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
#include <memory>
#include <string>

#include "privmx/drv/Bindings.hpp"
#include "privmx/drv/crypto.h"
// #include "privmx/utils/Utils.hpp"
#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>
#include <iostream>
using namespace emscripten;

EM_JS(bool,checkIfWorker,(void),{
    if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
		return true;
    } else {
        return false;
    }
});


std::string hmac(const std::string& engine, const char* key, unsigned int keylen, const char* data, int datalen){
    val name = val::u8string("hmac");
    val params = val::object();
    std::string cpp_key(key,keylen);
    std::string key_copy(key,keylen);
    params.set("engine", engine);
    params.set("data", typed_memory_view(datalen, data));
    params.set("key", typed_memory_view(key_copy.length(), key_copy.data()));
    return (
        Bindings::callJSSync<std::string>(name, params)
    );
}

std::string translateAESConfig(const char* config) {
    std::string alg;
    bool padding = true;
    if (strcmp(config, "AES-256-CBC") == 0) {
        return "aes256CbcPkcs7";
    } else if (strcmp(config, "AES-256-CBC-NOPAD") == 0) {
        return "aes256CbcNoPad";
    } else if (strcmp(config, "AES-256-ECB-NOPAD") == 0) {
        return "aes256Ecb";
    } else {
        throw "Wrong aes256 config";
    }
}
std::string translateSHAConfig(const char* config){
     if (strcmp(config, "SHA1") == 0) {
        return "sha1";
    } else if (strcmp(config, "SHA256") == 0) {
        return "sha256";
    } else if (strcmp(config, "SHA512") == 0) {
        return "sha512";
    } else if (strcmp(config, "RIPEMD160") == 0) {
        return "ripemd160";
    } else {
        throw "Wrong aes256 config";
    }

}
int privmxDrvCrypto_version(unsigned int* version) {
    *version = 1;
    return 0;
}

int privmxDrvCrypto_randomBytes(char* buf, unsigned int len){
    val name = val::u8string("randomBytes");
    val params = val::object();
    params.set("length", len);
    std::string cpp_str;
    try{
        cpp_str = Bindings::callJSSync<std::string>(name, params);
    }
    catch(...){
        return 1;
    }
    memcpy(buf, cpp_str.data(), len);
    return 0;
}

int privmxDrvCrypto_md(const char* data, int datalen, const char* config, char** out, unsigned int* outlen){
    std::string str_config = translateSHAConfig(config);
    val name = val::u8string(str_config.c_str());
    val params = val::object();
    params.set("data", typed_memory_view(datalen, data));
    std::string cpp_str;
    try{
        cpp_str = Bindings::callJSSync<std::string>(name, params);
    }
    catch(...){
        return 1;
    }
    *out = reinterpret_cast<char*>(malloc(cpp_str.length()));
    *outlen = cpp_str.length();
    memcpy(*out, cpp_str.c_str(), cpp_str.length());
    return 0;
}
int privmxDrvCrypto_hmac(const char* key, unsigned int keylen, const char* data, int datalen, const char* config, char** out, unsigned int* outlen){
    std::string str_config = translateSHAConfig(config);
    std::string cpp_str;
    try{
        cpp_str = hmac(str_config,key,keylen,data,datalen);
    }
    catch(std::exception e){
        std::cerr<<"_Hmac exception"<<std::endl;
        std::cerr<<e.what()<<std::endl;
        return 1;
    }
    *out = reinterpret_cast<char*>(malloc(cpp_str.length()));
    *outlen = cpp_str.length();
    memcpy(*out, cpp_str.data(), cpp_str.length());
    return 0;
}

int privmxDrvCrypto_aesEncrypt(const char* key, const char* iv, const char* data, unsigned int datalen, const char* config, char** out, unsigned int* outlen){
    std::string str_config = translateAESConfig(config);
    val name = val::u8string((str_config+"Encrypt").data());
    val params = val::object();
    params.set("data", typed_memory_view(datalen, data));
    params.set("key", typed_memory_view(32, key));
    if(str_config!="aes256Ecb"){
        params.set("iv", typed_memory_view(16, iv));
    }
    std::string cpp_str;
    try{
        cpp_str = Bindings::callJSSync<std::string>(name, params);
    }
    catch(...){
        return 1;
    }
    *out = reinterpret_cast<char*>(malloc(cpp_str.length()));
    *outlen = cpp_str.length();
    memcpy(*out, cpp_str.data(), cpp_str.length());
    return 0;
}
int privmxDrvCrypto_aesDecrypt(const char* key, const char* iv, const char* data, unsigned int datalen, const char* config, char** out, unsigned int* outlen){
    std::string str_config = translateAESConfig(config);
    val name = val::u8string((str_config+"Decrypt").data());
    val params = val::object();
    params.set("data", typed_memory_view(datalen, data));
    params.set("key", typed_memory_view(32, key));
    if(str_config!="aes256Ecb"){
        params.set("iv", typed_memory_view(16, iv));
    }
    std::string cpp_str;
    try{
        cpp_str = Bindings::callJSSync<std::string>(name, params);
    }
    catch(...){
        return 1;
    }
    *out = reinterpret_cast<char*>(malloc(cpp_str.length()));
    *outlen = cpp_str.length();
    memcpy(*out, cpp_str.data(), cpp_str.length());
    return 0;
}
int privmxDrvCrypto_pbkdf2(const char* pass, unsigned int passlen, const char* salt, unsigned int saltlen, int rounds, unsigned int length, const char* hash, char** out, unsigned int* outlen){
    val name = val::u8string("pbkdf2");
    val params = val::object();
    params.set("password", std::string(pass,passlen));
    params.set("salt", std::string(salt,saltlen));
    params.set("rounds", rounds);
    params.set("length", length);
    params.set("hash", hash);
    std::string cpp_str;
    try{
        cpp_str = Bindings::callJSSync<std::string>(name, params);
    }
    catch(...){
        return 1;
    }
    *out = reinterpret_cast<char*>(malloc(cpp_str.length()));
    *outlen = cpp_str.length();
    memcpy(*out, cpp_str.data(), cpp_str.length());
    return 0;
}

int privmxDrvCrypto_freeMem(void* ptr) {
    free(ptr);
    return 0;
}
