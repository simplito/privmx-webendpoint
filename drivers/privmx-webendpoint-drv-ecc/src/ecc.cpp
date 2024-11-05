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

#include "privmx/drv/ecc.h"
#include <string.h>
using namespace std;

struct privmxDrvEcc_BN {
    std::unique_ptr<BNImpl> impl;
};

struct privmxDrvEcc_Point {
    std::unique_ptr<PointImpl> impl;
};

struct privmxDrvEcc_ECC {
    std::unique_ptr<ECCImpl> impl;
};


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
    auto ecc_key = ECCImpl::fromPublicKey(std::string(key,keylen));
    if (!ecc_key) {
        return 1;
    }
    *res = new privmxDrvEcc_ECC{std::move(ecc_key)};
    return 0;
}

int privmxDrvEcc_eccFromPrivateKey(const char* key, int keylen, privmxDrvEcc_ECC** res) {
    auto ecc_key = ECCImpl::fromPrivateKey(std::string(key,keylen));
    if (!ecc_key) {
        return 1;
    }
    *res = new privmxDrvEcc_ECC{std::move(ecc_key)};
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
    std::string cpp_str(msg,msglen);
    auto new_signature = ecc->impl->sign2(cpp_str);
    res->r = new privmxDrvEcc_BN{std::move(new_signature.r)};
    res->s = new privmxDrvEcc_BN{std::move(new_signature.s)};
    return 0;
}

int privmxDrvEcc_eccVerify(privmxDrvEcc_ECC* ecc, const char* msg, int msglen, const privmxDrvEcc_Signature* sig, int* res) {
    if(!ecc->impl){
        return 1;
    }
    auto r_cp = std::make_unique<BNImpl>(*(sig->r->impl));
    auto s_cp = std::make_unique<BNImpl>(*(sig->s->impl));
    Signature ecc_sig;
    ecc_sig.r=std::move(r_cp);
    ecc_sig.s=std::move(s_cp);
    int result = ecc->impl->verify2(std::string(msg,msglen),ecc_sig);
    *res = (result == 1);
    return 0;
}

int privmxDrvEcc_eccDerive(const privmxDrvEcc_ECC* ecc, const privmxDrvEcc_ECC* pub, char** res, int* reslen) {
    if(!ecc->impl){
        return 1;
    }
    if(!pub->impl){
        return 2;
    }
    std::string cpp_str = ecc->impl->derive(*(pub->impl));
    *res = reinterpret_cast<char*>(malloc(cpp_str.length()));
    *reslen = cpp_str.length();
    memcpy(*res, cpp_str.c_str(), cpp_str.length());
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

