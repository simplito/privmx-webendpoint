/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#include <cstdlib>
#include <memory>
#include <string>
#include "privmx/drv/BNImpl.hpp"
#include "privmx/drv/PointImpl.hpp"
#include "privmx/drv/ECCImpl.hpp"
#include <secp256k1.h>
#include <secp256k1_ecdh.h>
#include <emscripten.h>
#include <emscripten/val.h>
#include <emscripten/bind.h>

#include "privmx/drv/ecc.h"
#include <string.h>

using namespace std;
using namespace emscripten;

struct privmxDrvEcc_BN {
    std::unique_ptr<BNImpl> impl;
};

struct privmxDrvEcc_Point {
    std::unique_ptr<PointImpl> impl;
};

struct privmxDrvEcc_ECC {
    std::unique_ptr<ECCImpl> impl;
};

secp256k1_context* ctx = secp256k1_context_create(SECP256K1_CONTEXT_NONE);

int privmxDrvEcc_version(unsigned int* version) {
    *version = 1;
    return 0;
}


int privmxDrvEcc_bnBin2bn(const char* bin, int binlen, privmxDrvEcc_BN** res) {
    std::unique_ptr<BNImpl> bn(new BNImpl(std::string(bin,binlen)));
    if (!bn) {
        return 1;
    }
    *res = new privmxDrvEcc_BN{std::move(bn)};
    return 0;
}

int privmxDrvEcc_bnBn2bin(privmxDrvEcc_BN* bn, char** out, int* outlen) {
    std::string cpp_str = bn->impl->toBuffer();
    *out = reinterpret_cast<char*>(malloc(cpp_str.length()));
    *outlen = cpp_str.length();
    memcpy(*out, cpp_str.c_str(), cpp_str.length());

    return 0;
}

int privmxDrvEcc_bnBitsLength(const privmxDrvEcc_BN* bn, int* res) {
    if(!bn->impl){
        return 1;
    }
    *res = bn->impl->getBitsLength();
    return 0;
}

int privmxDrvEcc_bnUmod(const privmxDrvEcc_BN* bn1, const privmxDrvEcc_BN* bn2, privmxDrvEcc_BN** res) {
    if(!bn1){
        return 1;
    }
    if(!bn2){
        return 2;
    }
    auto response = bn1->impl->umod(*(bn2->impl));
    *res = new privmxDrvEcc_BN{std::move(response)};
    return 0;
}

int privmxDrvEcc_bnEq(const privmxDrvEcc_BN* bn1, const privmxDrvEcc_BN* bn2, int* res) {
    if(!bn1){
        return 1;
    }
    if(!bn2){
        return 2;
    }
    *res = (bn1->impl->eq(*(bn2->impl)) == 0);
    return 0;
}

int privmxDrvEcc_bnCopy(const privmxDrvEcc_BN* src, privmxDrvEcc_BN** dst) {
    if(!src->impl){
        return 1;
    }
    *dst = new privmxDrvEcc_BN{std::make_unique<BNImpl>(*(src->impl))};
    return 0;
}

int privmxDrvEcc_bnNew(privmxDrvEcc_BN** res) {
    std::unique_ptr<BNImpl> bn(new BNImpl());
    if (!bn) {
        return 1;
    }
    *res = new privmxDrvEcc_BN{std::move(bn)};
    return 0;
}

int privmxDrvEcc_bnFree(privmxDrvEcc_BN* bn) {
    delete bn;
    return 0;
}

int privmxDrvEcc_pointOct2point(const char* oct, int octlen, privmxDrvEcc_Point** res) {
    std::string cpp_str(oct,octlen);
    *res = new privmxDrvEcc_Point{make_unique<PointImpl>(cpp_str)};
    return 0;
}

int privmxDrvEcc_pointEncode(const privmxDrvEcc_Point* point, int compact, char** out, int* outlen) {
    if (!point->impl) {
        return 1;
    }
    std::string cpp_str = point->impl->encode(compact);
    *out = reinterpret_cast<char*>(malloc(cpp_str.length()));
    *outlen = cpp_str.length();
    memcpy(*out, cpp_str.c_str(), cpp_str.length());
    return 0;
}

int privmxDrvEcc_pointMul(const privmxDrvEcc_Point* point, const privmxDrvEcc_BN* bn, privmxDrvEcc_Point** res) {
    std::unique_ptr<PointImpl> new_point;
    if (!point->impl){
        return 1;
    }
    if(!bn->impl){
        return 2;
    }
    new_point = point->impl->mul(*(bn->impl));
    *res = new privmxDrvEcc_Point{std::move(new_point)};
    return 0;
}

int privmxDrvEcc_pointAdd(const privmxDrvEcc_Point* point1, const privmxDrvEcc_Point* point2, privmxDrvEcc_Point** res) {
    std::unique_ptr<PointImpl> new_point;
    if(!point1->impl){
        return 1;
    }
    if(!point2->impl){
        return 2;
    }
    new_point = point1->impl->add(*(point2->impl));
    *res = new privmxDrvEcc_Point{std::move(new_point)};
    return 0;
}

int privmxDrvEcc_pointCopy(const privmxDrvEcc_Point* src, privmxDrvEcc_Point** dst) {
    if (!src->impl) {
        return 1;
    }
    *dst = new privmxDrvEcc_Point{std::make_unique<PointImpl>(*(src->impl))};
    return 0;
}

int privmxDrvEcc_pointNew(privmxDrvEcc_Point** res) {
    std::unique_ptr<PointImpl> new_point(new PointImpl());
    if(!new_point){
        return 1;
    }
    *res = new privmxDrvEcc_Point{std::move(new_point)};
    return 0;
}

int privmxDrvEcc_pointFree(privmxDrvEcc_Point* point) {
    delete point;
    return 0;
}

int privmxDrvEcc_eccGenPair(privmxDrvEcc_ECC** res) {
    auto key = ECCImpl::genPair();
    if (!key) {
        return 1;
    }
    *res = new privmxDrvEcc_ECC{std::move(key)};
    return 0;
}

int privmxDrvEcc_eccFromPublicKey(const char* key, int keylen, privmxDrvEcc_ECC** res) {
    // auto ecc_key = ECCImpl::fromPublicKey(std::string(key,keylen));
    // if (!ecc_key) {
    //     return 1;
    // }
    // *res = new privmxDrvEcc_ECC{std::move(ecc_key)};
    *res = new privmxDrvEcc_ECC{std::make_unique<ECCImpl>(std::string(), std::string(key, keylen), false)};
    return 0;
}

int privmxDrvEcc_eccFromPrivateKey(const char* key, int keylen, privmxDrvEcc_ECC** res) {
    auto ecc_key = ECCImpl::fromPrivateKey(std::string(key,keylen));
    if (!ecc_key) {
        return 1;
    }
    *res = new privmxDrvEcc_ECC{std::move(ecc_key)};
    // *res = new privmxDrvEcc_ECC{std::make_unique<ECCImpl>(std::string(), std::string(key, keylen), false)};
    return 0;
}

int privmxDrvEcc_eccGetPublicKey(const privmxDrvEcc_ECC* ecc, privmxDrvEcc_Point** res) {
    if(!ecc->impl){
        return 1;
    }
    auto new_point = ecc->impl->getPublicKey2();
    *res = new privmxDrvEcc_Point{std::move(new_point)};
    return 0;
}

int privmxDrvEcc_eccGetPrivateKey(const privmxDrvEcc_ECC* ecc, privmxDrvEcc_BN** res) {
    if(!ecc->impl){
        return 1;
    }
    auto new_bn = ecc->impl->getPrivateKey2();
    *res = new privmxDrvEcc_BN{std::move(new_bn)};
    return 0;
}

int privmxDrvEcc_eccSign(privmxDrvEcc_ECC* ecc, const char* msg, int msglen, privmxDrvEcc_Signature* res) {
    if(!ecc->impl){
        return 1;
    }
   std::string private_key_str = ecc->impl->getPrivateKey();
    if (private_key_str.length() != 32) {
        return 1;
    }

    secp256k1_ecdsa_signature sig;
    if (!secp256k1_ecdsa_sign(ctx, &sig, 
                              reinterpret_cast<const unsigned char*>(msg),
                              reinterpret_cast<const unsigned char*>(private_key_str.data()),
                              NULL, NULL)) {
        return 1;
    }

    unsigned char compact_sig[64];
    secp256k1_ecdsa_signature_serialize_compact(ctx, compact_sig, &sig);

    std::string r_bytes(reinterpret_cast<const char*>(compact_sig), 32);
    std::string s_bytes(reinterpret_cast<const char*>(compact_sig + 32), 32);
    // return {.r = std::make_unique<BNImpl>(r), .s = std::make_unique<BNImpl>(s)};;
    res->r = new privmxDrvEcc_BN{std::make_unique<BNImpl>(r_bytes)};
    res->s = new privmxDrvEcc_BN{std::make_unique<BNImpl>(s_bytes)};
    return 0;
}

int privmxDrvEcc_eccVerify(privmxDrvEcc_ECC* ecc, const char* msg, int msglen, const privmxDrvEcc_Signature* sig, int* res) {
    *res = 0;
    unsigned char compact_sig[64] = {0};
    std::string r_bytes = sig->r->impl->toBuffer();
    std::string s_bytes = sig->s->impl->toBuffer();

    if (r_bytes.length() > 32 || s_bytes.length() > 32) {
        return 1; 
    }

    memcpy(compact_sig + 32 - r_bytes.length(), r_bytes.data(), r_bytes.length());
    memcpy(compact_sig + 64 - s_bytes.length(), s_bytes.data(), s_bytes.length());

    std::string pubkey_str = ecc->impl->getPublicKey();
    const unsigned char* pubkey_bytes = reinterpret_cast<const unsigned char*>(pubkey_str.data());
    size_t pubkey_len = pubkey_str.length();

    if (pubkey_len != 33 && pubkey_len != 65) {
        return 1;
    }

    if (!ctx) {
        return 1;
    }

    secp256k1_pubkey pubkey;
    if (!secp256k1_ec_pubkey_parse(ctx, &pubkey, pubkey_bytes, pubkey_len)) {
        return 1;
    }

    secp256k1_ecdsa_signature ecc_sig;
    if (!secp256k1_ecdsa_signature_parse_compact(ctx, &ecc_sig, compact_sig)) {
        return 1;
    }

    secp256k1_ecdsa_signature_normalize(ctx, &ecc_sig, &ecc_sig);
    if (secp256k1_ecdsa_verify(ctx, &ecc_sig, reinterpret_cast<const unsigned char*>(msg), &pubkey) == 1) {
        *res = 1;
    }
    return 0;
}

int raw_ecdh_hash_function(unsigned char *output, const unsigned char *x, const unsigned char *y, void *data) {
    // These arguments are not used but are part of the function signature.
    (void)y;
    (void)data;
    // Copy the 32-byte x-coordinate directly to the output buffer.
    memcpy(output, x, 32);
    return 1; // Return 1 for success
}

int privmxDrvEcc_eccDerive(const privmxDrvEcc_ECC* ecc, const privmxDrvEcc_ECC* pub, char** res, int* reslen) {
    if(!ecc->impl){
        return 1;
    } 
    if(!pub->impl){
        return 2;
    }
    std::string pub_key_str = pub->impl->getPublicKey(false);
    std::string priv_key_str = ecc->impl->getPrivateKey();
    if (priv_key_str.length() != 32) {
        return 3;
    }
    if (pub_key_str.empty()) {
        return 4;
    }
    if (!ctx) {
        return 5;
    }
    secp256k1_pubkey pubkey_struct;
    if (secp256k1_ec_pubkey_parse(ctx, &pubkey_struct, reinterpret_cast<const unsigned char*>(pub_key_str.data()), pub_key_str.length()) != 1) {
        return 6;
    }
    unsigned char shared_secret[32] = {0};
    if (secp256k1_ecdh(ctx, shared_secret, &pubkey_struct, reinterpret_cast<const unsigned char*>(priv_key_str.data()), raw_ecdh_hash_function, NULL) != 1) {
        return 7;
    }
    char* result_buffer = new (std::nothrow) char[32];
    if (!result_buffer) {
        return 8;
    }
    memcpy(result_buffer, shared_secret, 32);
    *res = result_buffer;
    *reslen = 32;
    return 0;
}

int privmxDrvEcc_eccGetOrder(privmxDrvEcc_BN** res) {
    auto new_bn = ECCImpl::getOrder2();
    *res = new privmxDrvEcc_BN{std::move(new_bn)};
    return 0;
}

int privmxDrvEcc_eccGetGenerator(privmxDrvEcc_Point** res) {
    auto new_point = ECCImpl::getEcGenerator();
    *res = new privmxDrvEcc_Point{std::move(new_point)};
    return 0;
}

int privmxDrvEcc_eccCopy(const privmxDrvEcc_ECC* src, privmxDrvEcc_ECC** dst) {
    if (!src->impl) {
        return 1;
    }
    *dst = new privmxDrvEcc_ECC{std::make_unique<ECCImpl>(*(src->impl))};
    return 0;
}

int privmxDrvEcc_eccNew(privmxDrvEcc_ECC** res) {
    std::unique_ptr<ECCImpl> key(new ECCImpl());
    if (!key) {
        return 1;
    }
    *res = new privmxDrvEcc_ECC{std::move(key)};
    return 0;
}

int privmxDrvEcc_eccFree(privmxDrvEcc_ECC* ecc) {
    delete ecc;
    return 0;
}


int privmxDrvEcc_freeMem(void* ptr) {
    free(ptr);
    return 0;
}

