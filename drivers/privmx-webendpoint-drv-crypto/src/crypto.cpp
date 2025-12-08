/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include <stdlib.h>
#include <string.h>
#include <string>

#include "privmx/drv/crypto.h"
#include "AsyncEngine.hpp"
#include "Mapper.hpp"

#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>
#include <Poco/Dynamic/Var.h>
#include <Poco/JSON/Object.h>
#include <Pson/BinaryString.hpp>

using namespace emscripten;
using namespace privmx::webendpoint;

const ThreadTarget CRYPTO_THREAD = ThreadTarget::Worker;

emscripten::memory_view<unsigned char> createUint8Array(const char* data, size_t datalen) {
    return emscripten::typed_memory_view(datalen, reinterpret_cast<const unsigned char*>(data));
}

EM_JS(void, performCryptoCall, (const char* method_str, emscripten::EM_VAL params_handle, int callId), {
    let method = UTF8ToString(method_str);
    let params = Emval.toValue(params_handle);
    Promise.resolve(self['em_crypto'].methodCaller(method, params))
    .then((response) => {
        let ret = {status: 1, buff: new Uint8Array(response), error: ""};
        Module.ccall('AsyncEngine_onSuccess', null, ['number', 'number'], [callId, Emval.toHandle(ret)]);
    })
    .catch((error) => {
        console.error("Crypto Error [" + method + "]", error);
        let ret = {status: -1, buff: "", error: error.toString()};
        Module.ccall('AsyncEngine_onError', null, ['number', 'number'], [callId, Emval.toHandle(ret)]);
    });
});

std::string extractCryptoResult(std::future<Poco::Dynamic::Var>& future) {
    Poco::Dynamic::Var resultVar = future.get();
    Poco::JSON::Object::Ptr obj = resultVar.extract<Poco::JSON::Object::Ptr>();

    int status = obj->getValue<int>("status");
    if (status < 0) {
        throw std::runtime_error(obj->getValue<std::string>("error"));
    }
    return obj->getValue<Pson::BinaryString>("buff");
}

EM_JS(bool,checkIfWorker,(void),{
    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
        return true;
    } else {
        return false;
    }
});

std::string hmac(const std::string& engine, const char* key, unsigned int keylen, const char* data, int datalen){
    auto future = AsyncEngine::getInstance()->callJsAsync([&](int callId) {
        val params = val::object();
        params.set("engine", engine);
        params.set("data", createUint8Array(data, datalen));
        params.set("key", createUint8Array(key, keylen));

        performCryptoCall("hmac", params.as_handle(), callId);
    }, CRYPTO_THREAD);

    return extractCryptoResult(future);
}

std::string translateAESConfig(const char* config) {
    if (strcmp(config, "AES-256-CBC") == 0) return "aes256CbcPkcs7";
    if (strcmp(config, "AES-256-CBC-NOPAD") == 0) return "aes256CbcNoPad";
    if (strcmp(config, "AES-256-ECB-NOPAD") == 0) return "aes256Ecb";
    throw std::runtime_error("Wrong aes256 config");
}

std::string translateSHAConfig(const char* config){
     if (strcmp(config, "SHA1") == 0) return "sha1";
     if (strcmp(config, "SHA256") == 0) return "sha256";
     if (strcmp(config, "SHA512") == 0) return "sha512";
     if (strcmp(config, "RIPEMD160") == 0) return "ripemd160";
     throw std::runtime_error("Wrong hash config");
}

int privmxDrvCrypto_version(unsigned int* version) {
    *version = 1;
    return 0;
}

int privmxDrvCrypto_randomBytes(char* buf, unsigned int len){
    auto future = AsyncEngine::getInstance()->callJsAsync([len](int callId) {
        val params = val::object();
        params.set("length", len);
        performCryptoCall("randomBytes", params.as_handle(), callId);
    }, CRYPTO_THREAD);

    try {
        std::string res = extractCryptoResult(future);
        memcpy(buf, res.data(), len); 
        return 0;
    } catch(...) {
        return 1;
    }
}

int privmxDrvCrypto_md(const char* data, int datalen, const char* config, char** out, unsigned int* outlen){
    std::string str_config = translateSHAConfig(config);

    auto future = AsyncEngine::getInstance()->callJsAsync([&](int callId) {
        val params = val::object();
        params.set("data", createUint8Array(data, datalen));
        performCryptoCall(str_config.c_str(), params.as_handle(), callId);
    }, CRYPTO_THREAD);

    try {
        std::string res = extractCryptoResult(future);
        *out = reinterpret_cast<char*>(malloc(res.size()));
        *outlen = res.size();
        memcpy(*out, res.data(), res.size());
        return 0;
    } catch(...) {
        return 1;
    }
}

int privmxDrvCrypto_hmac(const char* key, unsigned int keylen, const char* data, int datalen, const char* config, char** out, unsigned int* outlen){
    std::string str_config = translateSHAConfig(config);
    try {
        std::string res = hmac(str_config, key, keylen, data, datalen);
        *out = reinterpret_cast<char*>(malloc(res.size()));
        *outlen = res.size();
        memcpy(*out, res.data(), res.size());
        return 0;
    } catch(std::exception& e){
        std::cerr << "_Hmac exception: " << e.what() << std::endl;
        return 1;
    }
}

int privmxDrvCrypto_aesEncrypt(const char* key, const char* iv, const char* data, unsigned int datalen, const char* config, char** out, unsigned int* outlen){
    std::string str_config = translateAESConfig(config);
    
    auto future = AsyncEngine::getInstance()->callJsAsync([&](int callId) {
        val params = val::object();
        params.set("data", createUint8Array(data, datalen));
        params.set("key", createUint8Array(key, 32));
        
        if (str_config != "aes256Ecb" && iv != nullptr) {
            params.set("iv", createUint8Array(iv, 16));
        }
        
        performCryptoCall((str_config + "Encrypt").c_str(), params.as_handle(), callId);
    }, CRYPTO_THREAD);

    try {
        std::string res = extractCryptoResult(future);
        *out = reinterpret_cast<char*>(malloc(res.size()));
        *outlen = res.size();
        memcpy(*out, res.data(), res.size());
        return 0;
    } catch(...) {
        return 1;
    }
}

int privmxDrvCrypto_aesDecrypt(const char* key, const char* iv, const char* data, unsigned int datalen, const char* config, char** out, unsigned int* outlen){
    std::string str_config = translateAESConfig(config);

    auto future = AsyncEngine::getInstance()->callJsAsync([&](int callId) {
        val params = val::object();
        params.set("data", createUint8Array(data, datalen));
        params.set("key", createUint8Array(key, 32));
        
        if (str_config != "aes256Ecb" && iv != nullptr) {
            params.set("iv", createUint8Array(iv, 16));
        }
        
        performCryptoCall((str_config + "Decrypt").c_str(), params.as_handle(), callId);
    }, CRYPTO_THREAD);

    try {
        std::string res = extractCryptoResult(future);
        *out = reinterpret_cast<char*>(malloc(res.size()));
        *outlen = res.size();
        memcpy(*out, res.data(), res.size());
        return 0;
    } catch(...) {
        return 1;
    }
}

int privmxDrvCrypto_pbkdf2(const char* pass, unsigned int passlen, const char* salt, unsigned int saltlen, int rounds, unsigned int length, const char* hash, char** out, unsigned int* outlen){
    auto future = AsyncEngine::getInstance()->callJsAsync([&](int callId) {
        val params = val::object();
        params.set("password", createUint8Array(pass, passlen));
        params.set("salt", createUint8Array(salt, saltlen));
        params.set("rounds", rounds);
        params.set("length", length);
        params.set("hash", std::string(hash));
        
        performCryptoCall("pbkdf2", params.as_handle(), callId);
    }, CRYPTO_THREAD);

    try {
        std::string res = extractCryptoResult(future);
        *out = reinterpret_cast<char*>(malloc(res.size()));
        *outlen = res.size();
        memcpy(*out, res.data(), res.size());
        return 0;
    } catch(...) {
        return 1;
    }
}

int privmxDrvCrypto_freeMem(void* ptr) {
    free(ptr);
    return 0;
}