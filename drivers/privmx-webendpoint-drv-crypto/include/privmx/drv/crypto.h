/*
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

#ifndef __PRIVMX_DRIVER_CRYPTO_H__
#define __PRIVMX_DRIVER_CRYPTO_H__

#ifdef __cplusplus
extern "C" {
#endif

int privmxDrvCrypto_version(unsigned int* version);
int privmxDrvCrypto_randomBytes(char* buf, unsigned int len);
int privmxDrvCrypto_md(const char* data, int datalen, const char* config, char** out, unsigned int* outlen);
int privmxDrvCrypto_hmac(const char* key, unsigned int keylen, const char* data, int datalen, const char* config, char** out, unsigned int* outlen);
int privmxDrvCrypto_aesEncrypt(const char* key, const char* iv, const char* data, unsigned int datalen, const char* config, char** out, unsigned int* outlen);
int privmxDrvCrypto_aesDecrypt(const char* key, const char* iv, const char* data, unsigned int datalen, const char* config, char** out, unsigned int* outlen);
int privmxDrvCrypto_pbkdf2(const char* pass, unsigned int passlen, const char* salt, unsigned int saltlen, int rounds, unsigned int length, const char* hash, char** out, unsigned int* outlen);
int privmxDrvCrypto_freeMem(void* ptr);

#ifdef __cplusplus
}
#endif

#endif // __PRIVMX_DRIVER_CRYPTO_H__
