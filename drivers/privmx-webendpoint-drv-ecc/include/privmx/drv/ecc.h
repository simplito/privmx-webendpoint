/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef __PRIVMX_DRIVER_ECC_H__
#define __PRIVMX_DRIVER_ECC_H__

#ifdef __cplusplus
extern "C" {
#endif

struct privmxDrvEcc_BN;
typedef struct privmxDrvEcc_BN privmxDrvEcc_BN;
struct privmxDrvEcc_Point;
typedef struct privmxDrvEcc_Point privmxDrvEcc_Point;
struct privmxDrvEcc_ECC;
typedef struct privmxDrvEcc_ECC privmxDrvEcc_ECC;

struct privmxDrvEcc_Signature
{
    const privmxDrvEcc_BN* r;
    const privmxDrvEcc_BN* s;
};
typedef struct privmxDrvEcc_Signature privmxDrvEcc_Signature;

int privmxDrvEcc_version(unsigned int* version); // version 1

int privmxDrvEcc_bnBin2bn(const char* bin, int binlen, privmxDrvEcc_BN** res);
int privmxDrvEcc_bnBn2bin(privmxDrvEcc_BN* bn, char** out, int* outlen);
int privmxDrvEcc_bnBitsLength(const privmxDrvEcc_BN* bn, int* res);
int privmxDrvEcc_bnUmod(const privmxDrvEcc_BN* bn1, const privmxDrvEcc_BN* bn2, privmxDrvEcc_BN** res);
int privmxDrvEcc_bnEq(const privmxDrvEcc_BN* bn1, const privmxDrvEcc_BN* bn2, int* res);
int privmxDrvEcc_bnCopy(const privmxDrvEcc_BN* src, privmxDrvEcc_BN** dst);
int privmxDrvEcc_bnNew(privmxDrvEcc_BN** res);
int privmxDrvEcc_bnFree(privmxDrvEcc_BN* bn);

int privmxDrvEcc_pointOct2point(const char* oct, int octlen, privmxDrvEcc_Point** res);
int privmxDrvEcc_pointEncode(const privmxDrvEcc_Point* point, int compact, char** out, int* outlen);
int privmxDrvEcc_pointMul(const privmxDrvEcc_Point* point, const privmxDrvEcc_BN* bn, privmxDrvEcc_Point** res);
int privmxDrvEcc_pointAdd(const privmxDrvEcc_Point* point1, const privmxDrvEcc_Point* point2, privmxDrvEcc_Point** res);
int privmxDrvEcc_pointCopy(const privmxDrvEcc_Point* src, privmxDrvEcc_Point** dst);
int privmxDrvEcc_pointNew(privmxDrvEcc_Point** res);
int privmxDrvEcc_pointFree(privmxDrvEcc_Point* point);

int privmxDrvEcc_eccGenPair(privmxDrvEcc_ECC** res);
int privmxDrvEcc_eccFromPublicKey(const char* key, int keylen, privmxDrvEcc_ECC** res);
int privmxDrvEcc_eccFromPrivateKey(const char* key, int keylen, privmxDrvEcc_ECC** res);
int privmxDrvEcc_eccGetPublicKey(const privmxDrvEcc_ECC* ecc, privmxDrvEcc_Point** res);
int privmxDrvEcc_eccGetPrivateKey(const privmxDrvEcc_ECC* ecc, privmxDrvEcc_BN** res);
int privmxDrvEcc_eccSign(privmxDrvEcc_ECC* ecc, const char* msg, int msglen, privmxDrvEcc_Signature* res);
int privmxDrvEcc_eccVerify(privmxDrvEcc_ECC* ecc, const char* msg, int msglen, const privmxDrvEcc_Signature* sig, int* res);
int privmxDrvEcc_eccDerive(const privmxDrvEcc_ECC* ecc, const privmxDrvEcc_ECC* pub, char** res, int* reslen);
int privmxDrvEcc_eccGetOrder(privmxDrvEcc_BN** res);
int privmxDrvEcc_eccGetGenerator(privmxDrvEcc_Point** res);
int privmxDrvEcc_eccCopy(const privmxDrvEcc_ECC* src, privmxDrvEcc_ECC** dst);
int privmxDrvEcc_eccNew(privmxDrvEcc_ECC** res);
int privmxDrvEcc_eccFree(privmxDrvEcc_ECC* ecc);

int privmxDrvEcc_freeMem(void* ptr);

#ifdef __cplusplus
}
#endif

#endif // __PRIVMX_DRIVER_ECC_H__
