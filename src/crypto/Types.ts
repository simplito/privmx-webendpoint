/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

export class RANDOM_BYTES_PARAMS {
    length: number = 0;
}

export class HMAC_PARAMS {
    engine: string = undefined!;
    key: Uint8Array | CryptoKey | string = undefined!;
    data: Uint8Array = undefined!;
}

export class SHA_PARAMS {
    data: Uint8Array = undefined!;
}

export class RIPEMD160_PARAMS {
    data: Uint8Array = undefined!;
}

export class HASH160_PARAMS {
    data: Uint8Array = undefined!;
}

export class AES256ECB_PARAMS {
    data: Uint8Array = undefined!;
    key: Uint8Array | CryptoKey | string = undefined!;
}

export class Aes256CbcPkcs7_PARAMS {
    data: Uint8Array = undefined!;
    key: Uint8Array | CryptoKey | string = undefined!;
    iv: Uint8Array = undefined!;
    wipe: boolean = false;
}

export class Prf_tls12_PARAMS {
    key: Uint8Array | CryptoKey | string = undefined!;
    seed: Uint8Array = undefined!;
    length: number = 0;
}

export class Kdf_PARAMS {
    length: number = 0;
    key: Uint8Array | CryptoKey | string = undefined!;
    label: string = undefined!;
}

export class GenerateIv_PARAMS {
    key: Uint8Array | CryptoKey | string = undefined!;
    idx: number = 0;
}

export class Aes256CbcPkcs7Encrypt_PARAMS {
    data: Uint8Array = undefined!;
    key: Uint8Array | CryptoKey | string = undefined!;
    iv: Uint8Array = undefined!;
    taglen: number = 0;
    wipe: boolean = false;
}

export class Aes256CbcPkcs7Decrypt_PARAMS {
    data: Uint8Array = undefined!;
    key: Uint8Array | CryptoKey | string = undefined!;
    taglen: number = 0;
    wipe: boolean = false;
}

export class FromPublicOrPrivateKey_PARAMS {
    key: Uint8Array = undefined!;
}

export class Sign_PARAMS {
    privateKey: Uint8Array | CryptoKey | string = undefined!;
    data: Uint8Array = undefined!;
}

export class Verify_PARAMS {
    publicKey: Uint8Array = undefined!;
    data: Uint8Array = undefined!;
    signature: Uint8Array = undefined!;
}

export class Verify2_PARAMS {
    publicKey: Uint8Array = undefined!;
    data: Uint8Array = undefined!;
    r: Uint8Array = undefined!;
    s: Uint8Array = undefined!;
}

export class Derive_PARAMS {
    privateKey: Uint8Array | CryptoKey | string = undefined!;
    publicKey: Uint8Array = undefined!;
}

export class PBKDF2_PARAMS {
    password: string | CryptoKey = undefined!;
    salt: string = undefined!;
    rounds: number = 0;
    length: number = 0;
    hash: string = undefined!;
}

export class GetBitsLength_PARAMS {
    bn: Uint8Array = undefined!;
}

export class BNumod_PARAMS {
    bn: Uint8Array = undefined!;
    bn2: Uint8Array = undefined!;
}

export class BNeq_PARAMS {
    bn: Uint8Array = undefined!;
    bn2: Uint8Array = undefined!;
}

export class PointEncode_PARAMS {
    point: Uint8Array = undefined!;
    compact: boolean = false;
}

export class PointMul_PARAMS {
    point: Uint8Array = undefined!;
    bn: Uint8Array = undefined!;
}

export class PointAdd_PARAMS {
    point: Uint8Array = undefined!;
    point2: Uint8Array = undefined!;
}

export class AeadEncrypt_PARAMS {
    key: Uint8Array | CryptoKey | string = undefined!;
    iv: Uint8Array = undefined!;
    aad: Uint8Array = undefined!;
    data: Uint8Array = undefined!;
    wipe: boolean = false;
}

export class AeadDecrypt_PARAMS {
    key: Uint8Array | CryptoKey | string = undefined!;
    iv: Uint8Array = undefined!;
    aad: Uint8Array = undefined!;
    data: Uint8Array = undefined!;
    tag: Uint8Array = undefined!;
    wipe: boolean = false;
}
