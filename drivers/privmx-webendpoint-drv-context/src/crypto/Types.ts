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
};

export class HMAC_PARAMS {
  engine: string;
  key: Uint8Array;
  data: Uint8Array;
};

export class SHA_PARAMS {
  data: Uint8Array;
};

export class RIPEMD160_PARAMS {
  data: Uint8Array;
}

export class HASH160_PARAMS {
  data: Uint8Array;
}

export class AES256ECB_PARAMS {
  data: Uint8Array;
  key: Uint8Array;
}

export class Aes256CbcPkcs7_PARAMS {
  data: Uint8Array;
  key: Uint8Array;
  iv: Uint8Array;
}

export class Prf_tls12_PARAMS {
  key: Uint8Array;
  seed: Uint8Array;
  length: number = 0;
}

export class Kdf_PARAMS {
  length: number = 0;
  key: Uint8Array;
  label: string;
}

export class GenerateIv_PARAMS {
  key: Uint8Array;
  idx: number = 0;
}

export class Aes256CbcPkcs7Encrypt_PARAMS {
  data: Uint8Array;
  key: Uint8Array;
  iv: Uint8Array;
  taglen: number = 0;
}

export class Aes256CbcPkcs7Decrypt_PARAMS {
  data: Uint8Array;
  key: Uint8Array;
  taglen: number = 0;
}

export class FromPublicOrPrivateKey_PARAMS {
  key: Uint8Array;
}

export class Sign_PARAMS {
  privateKey: Uint8Array;
  data: Uint8Array;
}

export class Verify_PARAMS {
  publicKey: Uint8Array;
  data: Uint8Array;
  signature: Uint8Array;
}

export class Verify2_PARAMS {
  publicKey: Uint8Array;
  data: Uint8Array;
  r: Uint8Array;
  s: Uint8Array;
}

export class Derive_PARAMS {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export class PBKDF2_PARAMS {
  password: string;
  salt: string;
  rounds: number = 0;
  length: number = 0;
  hash: string;
}

export class GetBitsLength_PARAMS {
  bn: Uint8Array;
}

export class BNumod_PARAMS {
  bn: Uint8Array;
  bn2: Uint8Array;
}

export class BNeq_PARAMS {
  bn: Uint8Array;
  bn2: Uint8Array;
}

export class PointEncode_PARAMS {
  point: Uint8Array;
  compact: boolean;
}

export class PointMul_PARAMS {
  point: Uint8Array;
  bn: Uint8Array;
}

export class PointAdd_PARAMS {
  point: Uint8Array;
  point2: Uint8Array;
}
