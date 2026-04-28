/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { assertIsNumber, assertIsUint8Array, assertArgsValid, assertIsString } from "./assert";
import * as Types from "./Types";
import * as Utils from "./Utils";
import * as aesjs from "aes-js";
import { ripemd160 as nobleRipemd160 } from "@noble/hashes/legacy.js";
import { secp256k1 as secp } from "@noble/curves/secp256k1.js";

const subtle =
    typeof crypto !== "undefined"
        ? crypto.subtle
        : (globalThis as unknown as { crypto: { subtle: SubtleCrypto } }).crypto.subtle;

const textEncoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Byte helpers — replace every Buffer.* call with native Uint8Array ops
// ---------------------------------------------------------------------------

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    let total = 0;
    for (const a of arrays) total += a.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}

function writeUInt32BE(buf: Uint8Array, value: number, offset: number): void {
    buf[offset] = (value >>> 24) & 0xff;
    buf[offset + 1] = (value >>> 16) & 0xff;
    buf[offset + 2] = (value >>> 8) & 0xff;
    buf[offset + 3] = value & 0xff;
}

function hexToBytes(hex: string): Uint8Array {
    const len = hex.length >> 1;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function uint8ArrayEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// BigInt helpers — replace BN.js with native bigint
// ---------------------------------------------------------------------------

function bytesToBigInt(bytes: Uint8Array): bigint {
    let n = 0n;
    for (const byte of bytes) {
        n = (n << 8n) | BigInt(byte);
    }
    return n;
}

function bigIntToBytes(n: bigint, padToLength?: number): Uint8Array {
    if (n < 0n) throw new Error("Negative BigInt not supported");
    if (n === 0n) return new Uint8Array(padToLength ?? 1);
    let hex = n.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    const bytes = hexToBytes(hex);
    if (padToLength !== undefined && bytes.length < padToLength) {
        const padded = new Uint8Array(padToLength);
        padded.set(bytes, padToLength - bytes.length);
        return padded;
    }
    return bytes;
}

// ---------------------------------------------------------------------------

interface KeyRegistryEntry {
    key: CryptoKey;
    wipeAfterImport?: boolean;
}

export class EmCrypto {
    static HASH_ALGORITHM_MAP: { [name: string]: string } = {
        sha1: "SHA-1",
        sha256: "SHA-256",
        sha512: "SHA-512",
        SHA1: "SHA-1",
        SHA256: "SHA-256",
        SHA512: "SHA-512",
    };
    private keys: Map<string, KeyRegistryEntry> = new Map();

    private methodsMap: { [K: string]: Function } = {
        randomBytes: this.randomBytes,
        hmac: this.hmac,
        hmacSha1: this.hmacSha1,
        hmacSha256: this.hmacSha256,
        hmacSha512: this.hmacSha512,
        sha1: this.sha1,
        sha256: this.sha256,
        sha512: this.sha512,
        ripemd160: this.ripemd160Impl,
        hash160: this.hash160,
        aes256EcbEncrypt: this.aes256EcbEncrypt,
        aes256EcbDecrypt: this.aes256EcbDecrypt,
        aes256CbcPkcs7Encrypt: this.aes256CbcPkcs7Encrypt,
        aes256CbcPkcs7Decrypt: this.aes256CbcPkcs7Decrypt,
        aes256CbcNoPadEncrypt: this.aes256CbcNoPadEncrypt,
        aes256CbcNoPadDecrypt: this.aes256CbcNoPadDecrypt,
        prf_tls12: this.prf_tls12,
        kdf: this.kdf,
        getKEM: this.getKEM,
        aes256CbcHmac256Encrypt: this.aes256CbcHmac256Encrypt,
        aes256CbcHmac256Decrypt: this.aes256CbcHmac256Decrypt,
        pbkdf2: this.pbkdf2,
        aeadEncrypt: this.aeadEncrypt,
        aeadDecrypt: this.aeadDecrypt,
        ecc_genPair: this.eccGenPair,
        ecc_fromPublicKey: this.eccFromPublicKey,
        ecc_fromPrivateKey: this.eccFromPrivateKey,
        ecc_sign: this.eccSign,
        ecc_verify: this.eccVerify,
        ecc_verify2: this.eccVerify2,
        ecc_derive: this.eccDerive,
        ecc_getOrder: this.eccGetOrder,
        ecc_getGenerator: this.eccGetGenerator,
        importKey: this.importKey,
        unregisterKey: this.unregisterKey,
        bn_getBitsLength: this.bnGetBitsLength,
        bn_umod: this.bnUmod,
        bn_eq: this.bnEq,
        point_encode: this.pointEncode,
        point_mul: this.pointMul,
        point_add: this.pointAdd,
        fillWithZeroesTo32: this.fillWithZeroesTo32,
        getRecoveryParam: this.getRecoveryParam,
    };

    async methodCaller(name: string, params: unknown): Promise<unknown> {
        if (this.methodsMap[name]) {
            return (this.methodsMap[name] as (p: unknown) => Promise<unknown>).call(
                this,
                this.copyWasmBuffers(params),
            );
        }
        throw new Error(`Method '${name}' is not implemented.`);
    }

    /**
     * Copies Uint8Array fields in the flat params object passed by the WASM bridge,
     * detaching them from the WASM linear memory heap before any async suspension.
     * WASM linear memory is backed by a SharedArrayBuffer when threading is enabled,
     * and SubtleCrypto.importKey rejects views over shared memory. SharedArrayBuffer
     * .slice() returns another SharedArrayBuffer, so we must copy bytes manually
     * into a brand-new ArrayBuffer via set().
     */
    private copyWasmBuffers(params: unknown): unknown {
        if (params === null || typeof params !== "object" || params instanceof CryptoKey) {
            return params;
        }
        if (params instanceof Uint8Array) {
            return this.copyUint8Array(params);
        }
        const src = params as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(src)) {
            const v = src[key];
            out[key] = v instanceof Uint8Array ? this.copyUint8Array(v) : v;
        }
        return out;
    }

    /**
     * Copies a Uint8Array into a fresh plain ArrayBuffer-backed view.
     */
    private copyUint8Array(src: Uint8Array): Uint8Array {
        const dst = new Uint8Array(src.byteLength);
        dst.set(src);
        return dst;
    }

    public async randomBytes(params: Types.RANDOM_BYTES_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.RANDOM_BYTES_PARAMS);
        assertIsNumber(params.length);
        let buf = new Uint8Array(params.length);
        return Utils.toArrayBuffer(globalThis.crypto.getRandomValues(buf));
    }

    private async getOrImportKey(
        keyInput: Uint8Array | CryptoKey | string,
        algorithm: AlgorithmIdentifier,
        usages: KeyUsage[],
    ): Promise<CryptoKey> {
        if (keyInput instanceof CryptoKey) {
            return keyInput;
        }
        if (typeof keyInput === "string") {
            const entry = this.keys.get(keyInput);
            if (!entry) {
                throw new Error(`Key with ID '${keyInput}' not found in registry.`);
            }
            return entry.key;
        }
        if (keyInput instanceof Uint8Array) {
            const algoName = typeof algorithm === "string" ? algorithm : algorithm.name;
            if (algoName === "secp256k1-private" || algoName === "secp256k1-public") {
                return keyInput as unknown as CryptoKey;
            }
            const key = await subtle.importKey(
                "raw",
                keyInput as unknown as BufferSource,
                algorithm,
                false,
                usages,
            );
            keyInput.fill(0);
            return key;
        }
        throw new Error("Invalid key input type.");
    }

    public async importKey(params: {
        key: Uint8Array;
        algo: AlgorithmIdentifier;
        usages: KeyUsage[];
        id?: string;
    }): Promise<string> {
        const cryptoKey = await subtle.importKey(
            "raw",
            params.key as unknown as BufferSource,
            params.algo,
            false,
            params.usages,
        );
        const id = params.id || Utils.randomString(16);
        this.keys.set(id, { key: cryptoKey });
        params.key.fill(0);
        return id;
    }

    public unregisterKey(params: { id: string }): void {
        this.keys.delete(params.id);
    }

    public async hmac(params: Types.HMAC_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.HMAC_PARAMS);
        assertIsString(params.engine);
        assertIsUint8Array(params.data);
        if (params.engine === "sha1") {
            return this.hmacSha1({ key: params.key, data: params.data });
        } else if (params.engine === "sha256") {
            return this.hmacSha256({ key: params.key, data: params.data });
        } else if (params.engine === "sha512") {
            return this.hmacSha512({ key: params.key, data: params.data });
        }
        throw new Error("hmac: invalid engine arg");
    }

    public async hmacSha1(params: {
        key: Uint8Array | CryptoKey | string;
        data: ArrayBuffer | Uint8Array;
    }): Promise<ArrayBuffer> {
        const key = await this.getOrImportKey(
            params.key,
            { name: "HMAC", hash: "SHA-1" } as unknown as AlgorithmIdentifier,
            ["sign"],
        );
        return await subtle.sign("HMAC", key, new Uint8Array(params.data));
    }

    public async hmacSha256(params: {
        key: Uint8Array | CryptoKey | string;
        data: ArrayBuffer | Uint8Array;
    }): Promise<ArrayBuffer> {
        const key = await this.getOrImportKey(
            params.key,
            { name: "HMAC", hash: "SHA-256" } as unknown as AlgorithmIdentifier,
            ["sign"],
        );
        return subtle.sign("HMAC", key, new Uint8Array(params.data));
    }

    public async hmacSha512(params: {
        key: Uint8Array | CryptoKey | string;
        data: ArrayBuffer | Uint8Array;
    }): Promise<ArrayBuffer> {
        const key = await this.getOrImportKey(
            params.key,
            { name: "HMAC", hash: "SHA-512" } as unknown as AlgorithmIdentifier,
            ["sign"],
        );
        return subtle.sign("HMAC", key, new Uint8Array(params.data));
    }

    public async sha1(params: Types.SHA_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.SHA_PARAMS);
        assertIsUint8Array(params.data);
        return subtle.digest("SHA-1", new Uint8Array(params.data));
    }

    public async sha256(params: Types.SHA_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.SHA_PARAMS);
        assertIsUint8Array(params.data);
        return subtle.digest("SHA-256", new Uint8Array(params.data));
    }

    public async sha512(params: Types.SHA_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.SHA_PARAMS);
        assertIsUint8Array(params.data);
        return subtle.digest("SHA-512", new Uint8Array(params.data));
    }

    public async ripemd160Impl(params: Types.RIPEMD160_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.RIPEMD160_PARAMS);
        assertIsUint8Array(params.data);
        return Utils.toArrayBuffer(nobleRipemd160(new Uint8Array(params.data)));
    }

    public async aes256EcbEncrypt(params: Types.AES256ECB_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.AES256ECB_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        const keyCopy = new Uint8Array(params.key);
        const aesEcb = new aesjs.ModeOfOperation.ecb(keyCopy);
        const encryptedBytes = aesEcb.encrypt(new Uint8Array(params.data));
        keyCopy.fill(0);
        return Utils.toArrayBuffer(encryptedBytes);
    }

    public async aes256EcbDecrypt(params: Types.AES256ECB_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.AES256ECB_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        const keyCopy = new Uint8Array(params.key);
        const aesEcb = new aesjs.ModeOfOperation.ecb(keyCopy);
        const decryptedBytes = aesEcb.decrypt(new Uint8Array(params.data));
        keyCopy.fill(0);
        return Utils.toArrayBuffer(decryptedBytes);
    }

    public async aes256CbcPkcs7Encrypt(params: Types.Aes256CbcPkcs7_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.iv);
        const key = await this.getOrImportKey(params.key, "AES-CBC", ["encrypt"]);
        return subtle.encrypt(
            { name: "AES-CBC", iv: new Uint8Array(params.iv) as unknown as BufferSource },
            key,
            new Uint8Array(params.data) as unknown as BufferSource,
        );
    }

    public async aes256CbcPkcs7Decrypt(params: Types.Aes256CbcPkcs7_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.iv);
        const key = await this.getOrImportKey(params.key, "AES-CBC", ["decrypt"]);
        return subtle.decrypt(
            { name: "AES-CBC", iv: new Uint8Array(params.iv) as unknown as BufferSource },
            key,
            new Uint8Array(params.data) as unknown as BufferSource,
        );
    }

    public async aes256CbcNoPadEncrypt(params: Types.Aes256CbcPkcs7_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.iv);
        const keyCopy = new Uint8Array(params.key);
        const aesCbc = new aesjs.ModeOfOperation.cbc(keyCopy, new Uint8Array(params.iv));
        const encryptedBytes = aesCbc.encrypt(new Uint8Array(params.data));
        keyCopy.fill(0);
        return Utils.toArrayBuffer(encryptedBytes);
    }

    public async aes256CbcNoPadDecrypt(params: Types.Aes256CbcPkcs7_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.iv);
        const keyCopy = new Uint8Array(params.key);
        const aesCbc = new aesjs.ModeOfOperation.cbc(keyCopy, new Uint8Array(params.iv));
        const decryptedBytes = aesCbc.decrypt(new Uint8Array(params.data));
        keyCopy.fill(0);
        return Utils.toArrayBuffer(decryptedBytes);
    }

    public async prf_tls12(params: Types.Prf_tls12_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Prf_tls12_PARAMS);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.seed);
        assertIsNumber(params.length);
        let result = new Uint8Array(0);
        let a = new Uint8Array(params.seed);
        while (result.length < params.length) {
            a = new Uint8Array(await this.hmacSha256({ key: new Uint8Array(params.key), data: a }));
            const block = new Uint8Array(
                await this.hmacSha256({
                    key: new Uint8Array(params.key),
                    data: concatBytes(a, new Uint8Array(params.seed)),
                }),
            );
            result = concatBytes(result, block);
        }
        return Utils.toArrayBuffer(result.subarray(0, params.length));
    }

    public async kdf(
        algo: string,
        length: number,
        key: Uint8Array,
        labelStr: string,
    ): Promise<Uint8Array> {
        const label = textEncoder.encode(labelStr);
        const seed = new Uint8Array(label.length + 5);
        seed.set(label, 0);
        seed[label.length] = 0;
        writeUInt32BE(seed, length, label.length + 1);
        let k = new Uint8Array(0);
        let result = new Uint8Array(0);
        let i = 1;
        while (result.length < length) {
            const count = new Uint8Array(4);
            writeUInt32BE(count, i++, 0);
            const input = concatBytes(k, count, seed);
            const hmac = await this.hmac({ engine: algo, key, data: input });
            k = new Uint8Array(hmac);
            result = concatBytes(result, k);
        }
        return result;
    }

    public async getKEM(algo: string, key: Uint8Array, keLen?: number, kmLen?: number) {
        if (!keLen && keLen !== 0) {
            keLen = 32;
        }
        if (!kmLen && kmLen !== 0) {
            kmLen = 32;
        }
        const kEM = await this.kdf(algo, keLen + kmLen, key, "key expansion");
        return {
            kE: kEM.subarray(0, keLen),
            kM: kEM.subarray(keLen),
        };
    }

    public async aes256CbcHmac256Encrypt(
        params: Types.Aes256CbcPkcs7Encrypt_PARAMS,
    ): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7Encrypt_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.iv);
        assertIsNumber(params.taglen);
        const kem = await this.getKEM("sha256", new Uint8Array(params.key));
        const iv = new Uint8Array(params.iv).subarray(0, 16);
        const prefix = new Uint8Array(16);
        const data = concatBytes(prefix, new Uint8Array(params.data));
        const cipher = await this.aes256CbcPkcs7Encrypt({ data, key: kem.kE, iv });
        const tag = await this.hmacSha256({ key: kem.kM, data: cipher });
        return Utils.toArrayBuffer(
            concatBytes(new Uint8Array(cipher), new Uint8Array(tag).subarray(0, params.taglen)),
        );
    }

    public async aes256CbcHmac256Decrypt(
        params: Types.Aes256CbcPkcs7Decrypt_PARAMS,
    ): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7Decrypt_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsNumber(params.taglen);
        const kem = await this.getKEM("sha256", new Uint8Array(params.key));
        let data = new Uint8Array(params.data);
        const tag = data.subarray(data.length - params.taglen);
        data = data.subarray(0, data.length - params.taglen);
        const rTag = new Uint8Array(await this.hmacSha256({ key: kem.kM, data })).subarray(
            0,
            params.taglen,
        );
        if (!uint8ArrayEqual(tag, rTag)) {
            throw new Error("Wrong message security tag");
        }
        const iv = data.subarray(0, 16);
        data = data.subarray(16);
        return this.aes256CbcPkcs7Decrypt({ data, key: kem.kE, iv });
    }

    public async aeadEncrypt(params: Types.AeadEncrypt_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.AeadEncrypt_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.iv);
        assertIsUint8Array(params.aad);
        const key = await this.getOrImportKey(params.key, "AES-GCM", ["encrypt"]);
        return subtle.encrypt(
            {
                name: "AES-GCM",
                iv: new Uint8Array(params.iv) as unknown as BufferSource,
                additionalData: new Uint8Array(params.aad) as unknown as BufferSource,
                tagLength: 128,
            },
            key,
            new Uint8Array(params.data) as unknown as BufferSource,
        );
    }

    public async aeadDecrypt(params: Types.AeadDecrypt_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.AeadDecrypt_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.iv);
        assertIsUint8Array(params.aad);
        assertIsUint8Array(params.tag);
        const key = await this.getOrImportKey(params.key, "AES-GCM", ["decrypt"]);
        const dataWithTag = concatBytes(new Uint8Array(params.data), new Uint8Array(params.tag));
        return subtle.decrypt(
            {
                name: "AES-GCM",
                iv: new Uint8Array(params.iv) as unknown as BufferSource,
                additionalData: new Uint8Array(params.aad) as unknown as BufferSource,
                tagLength: 128,
            },
            key,
            dataWithTag as unknown as BufferSource,
        );
    }

    public async pbkdf2(params: Types.PBKDF2_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.PBKDF2_PARAMS);
        assertIsString(params.salt);
        assertIsNumber(params.rounds);
        assertIsNumber(params.length);
        assertIsString(params.hash);

        let key: CryptoKey;
        if (params.password instanceof CryptoKey) {
            key = params.password;
        } else {
            const passwordStr = params.password as string;
            key = await subtle.importKey(
                "raw",
                textEncoder.encode(passwordStr) as unknown as BufferSource,
                "PBKDF2",
                false,
                ["deriveBits"],
            );
        }

        return subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: textEncoder.encode(params.salt) as unknown as BufferSource,
                iterations: params.rounds,
                hash: { name: EmCrypto.HASH_ALGORITHM_MAP[params.hash] },
            },
            key,
            params.length * 8,
        );
    }

    public async hash160(params: Types.HASH160_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.HASH160_PARAMS);
        assertIsUint8Array(params.data);
        const sha256 = await subtle.digest("SHA-256", new Uint8Array(params.data));
        return Utils.toArrayBuffer(nobleRipemd160(new Uint8Array(sha256)));
    }

    private fillWithZeroesTo32(buffer: Uint8Array): Uint8Array {
        if (buffer.length >= 32) return buffer;
        const result = new Uint8Array(32);
        result.set(buffer, 32 - buffer.length);
        return result;
    }

    public async eccGenPair() {
        const privateKey = secp.utils.randomSecretKey(); // 32 bytes
        const publicKey = secp.getPublicKey(privateKey, true); // 33 bytes, compressed
        return { privateKey, publicKey };
    }

    public async eccFromPublicKey(params: Types.FromPublicOrPrivateKey_PARAMS) {
        assertArgsValid(params, Types.FromPublicOrPrivateKey_PARAMS);
        assertIsUint8Array(params.key);
        const point = secp.Point.fromBytes(new Uint8Array(params.key));
        return { publicKey: Utils.toArrayBuffer(point.toBytes(true)) };
    }

    public async eccFromPrivateKey(params: Types.FromPublicOrPrivateKey_PARAMS) {
        assertArgsValid(params, Types.FromPublicOrPrivateKey_PARAMS);
        assertIsUint8Array(params.key);
        const privateKey = this.fillWithZeroesTo32(new Uint8Array(params.key));
        const publicKey = secp.getPublicKey(privateKey, true);
        return {
            privateKey: new Uint8Array(Utils.toArrayBuffer(privateKey)),
            publicKey: new Uint8Array(Utils.toArrayBuffer(publicKey)),
        };
    }

    public async eccSign(params: Types.Sign_PARAMS) {
        assertArgsValid(params, Types.Sign_PARAMS);
        assertIsUint8Array(params.data);
        const privateKey = await this.getOrImportKey(
            params.privateKey,
            "secp256k1-private" as unknown as AlgorithmIdentifier,
            ["sign"],
        );
        const privBytes = new Uint8Array(privateKey as unknown as Uint8Array);
        // v3: sign with { format: 'recovered' } returns 65-byte Uint8Array:
        //   [0] = raw recovery id (0-3), [1..64] = r || s
        const rawSig = secp.sign(params.data, privBytes, { format: "recovered", prehash: false });
        const out = new Uint8Array(65);
        out[0] = 27 + rawSig[0];
        out.set(rawSig.subarray(1), 1); // r || s
        return Utils.toArrayBuffer(out);
    }

    private getRecoveryParam(value: number) {
        if (value >= 27 && value <= 30) {
            return value - 27;
        }
        if (value >= 31 && value <= 34) {
            return value - 31;
        }
        if (value >= 35 && value <= 38) {
            return value - 35;
        }
        if (value >= 39 && value <= 42) {
            return value - 39;
        }
        throw new Error("Invalid recovery param value");
    }

    public async eccVerify(params: Types.Verify_PARAMS) {
        assertArgsValid(params, Types.Verify_PARAMS);
        assertIsUint8Array(params.publicKey);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.signature);
        // signature format: [recovery_byte (1B)] [r (32B)] [s (32B)]
        const compactSig = params.signature.subarray(1, 65); // 64 bytes: r || s
        return secp.verify(compactSig, params.data, params.publicKey, { prehash: false, lowS: false });
    }

    public async eccVerify2(params: Types.Verify2_PARAMS) {
        assertArgsValid(params, Types.Verify2_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.r);
        assertIsUint8Array(params.s);
        const buffer = new Uint8Array(65);
        buffer[0] = 27;
        buffer.set(params.r, 1);
        buffer.set(params.s, 33);
        return this.eccVerify({
            publicKey: params.publicKey,
            data: buffer,
            signature: params.data,
        });
    }

    public async eccDerive(params: Types.Derive_PARAMS) {
        assertArgsValid(params, Types.Derive_PARAMS);
        assertIsUint8Array(params.publicKey);
        const privateKey = await this.getOrImportKey(
            params.privateKey,
            "secp256k1-private" as unknown as AlgorithmIdentifier,
            ["deriveBits"],
        );
        const privBytes = new Uint8Array(privateKey as unknown as Uint8Array);
        // getSharedSecret with isCompressed=true returns [prefix(1B), x(32B)] = 33 bytes
        const shared = secp.getSharedSecret(privBytes, new Uint8Array(params.publicKey), true);
        return Utils.toArrayBuffer(shared.slice(1)); // 32-byte x-coordinate
    }

    public async eccGetOrder(_params?: undefined) {
        return bigIntToBytes(secp.Point.CURVE().n, 32);
    }

    public async eccGetGenerator(_params?: undefined): Promise<Uint8Array> {
        return secp.Point.BASE.toBytes(true); // 33-byte compressed generator G
    }

    public async bnGetBitsLength(params: Types.GetBitsLength_PARAMS) {
        assertArgsValid(params, Types.GetBitsLength_PARAMS);
        assertIsUint8Array(params.bn);
        const bn = bytesToBigInt(new Uint8Array(params.bn));
        return bn === 0n ? 0 : bn.toString(2).length;
    }

    public async bnUmod(params: Types.BNumod_PARAMS) {
        assertArgsValid(params, Types.BNumod_PARAMS);
        assertIsUint8Array(params.bn);
        assertIsUint8Array(params.bn2);
        const a = bytesToBigInt(new Uint8Array(params.bn));
        const b = bytesToBigInt(new Uint8Array(params.bn2));
        const r = a % b;
        return bigIntToBytes(r < 0n ? r + b : r);
    }

    public async bnEq(params: Types.BNeq_PARAMS) {
        assertArgsValid(params, Types.BNeq_PARAMS);
        assertIsUint8Array(params.bn);
        assertIsUint8Array(params.bn2);
        return bytesToBigInt(new Uint8Array(params.bn)) === bytesToBigInt(new Uint8Array(params.bn2));
    }

    public async pointEncode(params: Types.PointEncode_PARAMS) {
        assertArgsValid(params, Types.PointEncode_PARAMS);
        assertIsUint8Array(params.point);
        const point = secp.Point.fromBytes(new Uint8Array(params.point));
        if (params.compact) {
            return point.toBytes(true); // 33-byte compressed
        } else {
            return Utils.toArrayBuffer(point.toBytes(false)); // 65-byte uncompressed
        }
    }

    public async pointMul(params: Types.PointMul_PARAMS) {
        assertArgsValid(params, Types.PointMul_PARAMS);
        assertIsUint8Array(params.point);
        assertIsUint8Array(params.bn);
        const point = secp.Point.fromBytes(new Uint8Array(params.point));
        const scalar = bytesToBigInt(new Uint8Array(params.bn));
        return point.multiply(scalar).toBytes(true);
    }

    public async pointAdd(params: Types.PointAdd_PARAMS) {
        assertArgsValid(params, Types.PointAdd_PARAMS);
        assertIsUint8Array(params.point);
        assertIsUint8Array(params.point2);
        const point1 = secp.Point.fromBytes(new Uint8Array(params.point));
        const point2 = secp.Point.fromBytes(new Uint8Array(params.point2));
        return point1.add(point2).toBytes(true);
    }
}
