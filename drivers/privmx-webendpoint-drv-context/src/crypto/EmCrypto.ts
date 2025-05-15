/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import * as elliptic from "elliptic";
import { assertIsNumber, assertIsUint8Array, assertArgsValid, assertIsString } from "../assert";
import * as Types from "./Types";
import * as Utils from "./Utils";
import BN = require("bn.js");
const EC = new elliptic.ec("secp256k1");
const {subtle} = globalThis.crypto;
const crypto = require('crypto');

export class EmCrypto {
    static HASH_ALGORITHM_MAP: {[name: string]: string} = {
        sha1: "SHA-1",
        sha256: "SHA-256",
        sha512: "SHA-512",
        SHA1: "SHA-1",
        SHA256: "SHA-256",
        SHA512: "SHA-512"
    };

    private methodsMap: { [K: string]: Function } = {
        randomBytes: this.randomBytes,
        hmac: this.hmac,
        hmacSha1: this.hmacSha1,
        hmacSha256: this.hmacSha256,
        hmacSha512: this.hmacSha512,
        sha1: this.sha1,
        sha256: this.sha256,
        sha512: this.sha512,
        ripemd160: this.ripemd160,
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
        ecc_genPair: this.eccGenPair,
        ecc_fromPublicKey: this.eccFromPublicKey,
        ecc_fromPrivateKey: this.eccFromPrivateKey,
        ecc_sign: this.eccSign,
        ecc_verify: this.eccVerify,
        ecc_verify2: this.eccVerify2,
        ecc_derive: this.eccDerive,
        ecc_getOrder: this.eccGetOrder,
        ecc_getGenerator: this.eccGetGenerator,
        bn_getBitsLength: this.bnGetBitsLength,
        bn_umod: this.bnUmod,
        bn_eq: this.bnEq,
        point_encode: this.pointEncode,
        point_mul: this.pointMul,
        point_add: this.pointAdd,
        fillWithZeroesTo32: this.fillWithZeroesTo32,
        getRecoveryParam: this.getRecoveryParam
     };

    async methodCaller(name: string, params: any): Promise<any> {
        if (this.methodsMap[name]) {
            return this.methodsMap[name](params);
        }        
        throw new Error(`Method '${name}' is not implemented.`);        
    }

    private async randomBytes(params: Types.RANDOM_BYTES_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.RANDOM_BYTES_PARAMS);
        assertIsNumber(params.length);
        let buf = new Uint8Array(params.length);
        return globalThis.crypto.getRandomValues(buf);
    }

    private async hmac(params: Types.HMAC_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.HMAC_PARAMS);
        assertIsString(params.engine);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.data);
        if (params.engine === "sha1") {
            return this.hmacSha1(params.key, params.data);
        }
        else if (params.engine === "sha256") {
            return this.hmacSha256(params.key, params.data);
        }
        else if (params.engine === "sha512") {
            return this.hmacSha512(params.key, params.data);
        }
        throw new Error("hmac: invalid engine arg");
    }


    private async hmacSha1(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
        const importedKey = await subtle.importKey("raw", new Uint8Array(key), {
            name: "HMAC",
            hash: "SHA-1"
        }, false, ["sign"]);
        return await subtle.sign("HMAC", importedKey, new Uint8Array(data));
    }

    private async hmacSha256(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
        const importedKey = await subtle.importKey("raw", new Uint8Array(key), {
            name: "HMAC",
            hash: "SHA-256"
        }, false, ["sign"]);
        return subtle.sign("HMAC", importedKey, new Uint8Array(data));
    }

    private async hmacSha512(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
        const importedKey = await subtle.importKey("raw", new Uint8Array(key), {
            name: "HMAC",
            hash: "SHA-512"
        }, false, ["sign"]);
        return subtle.sign("HMAC", importedKey, new Uint8Array(data));
    }

    private async sha1(params: Types.SHA_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.SHA_PARAMS);
        assertIsUint8Array(params.data);
        return subtle.digest("SHA-1", new Uint8Array(params.data));
    }

    private async sha256(params: Types.SHA_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.SHA_PARAMS);
        assertIsUint8Array(params.data);
        return subtle.digest("SHA-256", new Uint8Array(params.data));
    }

    private async sha512(params: Types.SHA_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.SHA_PARAMS);
        assertIsUint8Array(params.data);
        return subtle.digest("SHA-512", new Uint8Array(params.data));
    }

    private async ripemd160(params: Types.RIPEMD160_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.RIPEMD160_PARAMS);
        assertIsUint8Array(params.data);
        return crypto.createHash("ripemd160").update(Buffer.from(params.data)).digest();
    }

    private async aes256EcbEncrypt(params: Types.AES256ECB_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.AES256ECB_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        const cipher = crypto.createCipheriv("aes-256-ecb", new Uint8Array(params.key), '');
        cipher.setAutoPadding(false);
        return Utils.toArrayBuffer(Buffer.concat([cipher.update(new Uint8Array(params.data)), cipher.final()]));
    }

    private async aes256EcbDecrypt(params: Types.AES256ECB_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.AES256ECB_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        const cipher = crypto.createDecipheriv("aes-256-ecb", new Uint8Array(params.key), '');
        cipher.setAutoPadding(false);
        return Utils.toArrayBuffer(Buffer.concat([cipher.update(new Uint8Array(params.data)), cipher.final()]));
    }

    private async aes256CbcPkcs7Encrypt(params: Types.Aes256CbcPkcs7_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.iv);
        const key = await subtle.importKey("raw", new Uint8Array(params.key), "AES-CBC", true, ["encrypt"]);
        return subtle.encrypt({name: "AES-CBC", iv: new Uint8Array(params.iv)}, key, new Uint8Array(params.data));
    }

    private async aes256CbcPkcs7Decrypt(params: Types.Aes256CbcPkcs7_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.iv);
        const key = await subtle.importKey("raw", new Uint8Array(params.key), "AES-CBC", true, ["decrypt"]);
        return subtle.decrypt({name: "AES-CBC", iv: new Uint8Array(params.iv)}, key, new Uint8Array(params.data));
    }

    private async aes256CbcNoPadEncrypt(params: Types.Aes256CbcPkcs7_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.iv);
        const cipher = crypto.createCipheriv("aes-256-cbc", params.key, params.iv);
        cipher.setAutoPadding(false);
        return Utils.toArrayBuffer(Buffer.concat([cipher.update(params.data), cipher.final()]));
    }

    private async aes256CbcNoPadDecrypt(params: Types.Aes256CbcPkcs7_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.iv);
        const cipher = crypto.createDecipheriv("aes-256-cbc", params.key, params.iv);
        return Utils.toArrayBuffer(Buffer.concat([cipher.update(params.data), cipher.final()]));
    }

    private async prf_tls12(params: Types.Prf_tls12_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Prf_tls12_PARAMS);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.seed);
        assertIsNumber(params.length);
        let result = Buffer.alloc(0);
        let a = new Uint8Array(params.seed);
        while (result.length < params.length) {
            a = new Uint8Array(await this.hmacSha256(new Uint8Array(params.key), a));
            result = Buffer.concat([result, Buffer.from(await this.hmacSha256(new Uint8Array(params.key), Buffer.concat([a, new Uint8Array(params.seed)])))]);
        }
        return Utils.toArrayBuffer(result.slice(0, params.length));
    }

    private async kdf(algo: string, length: number, key: Buffer, labelStr: string): Promise<Buffer> {
        const label = Buffer.from(labelStr);
        const context = Buffer.alloc(0);
        let seed = Buffer.alloc(label.length + context.length + 5);
        label.copy(seed);
        seed.writeUInt8(0, label.length);
        context.copy(seed, label.length + 1);
        seed.writeUInt32BE(length, label.length + context.length + 1);
        let k = Buffer.alloc(0);
        let result = Buffer.alloc(0);
        let i = 1;
        while (result.length < length) {
            let input = Buffer.alloc(0);
            input = k;
            const count = Buffer.alloc(4);
            count.writeUInt32BE(i++, 0);
            input = Buffer.concat([input, count]);
            input = Buffer.concat([input, seed]);
            const hmac = await this.hmac({engine: algo, key, data: input});
            k = Buffer.from(hmac);
            result = Buffer.concat([result, k]);
        }
        return result;
    }

    private async getKEM(algo: string, key: Buffer, keLen?: number, kmLen?: number) {
        if (!keLen && keLen !== 0) {
            keLen = 32;
        }
        if (!kmLen && kmLen !== 0) {
            kmLen = 32;
        }
        const kEM = await this.kdf(algo, keLen + kmLen, key, "key expansion");
        return {
            kE: kEM.slice(0, keLen),
            kM: kEM.slice(keLen)
        }
    }

    private async aes256CbcHmac256Encrypt(params: Types.Aes256CbcPkcs7Encrypt_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7Encrypt_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);
        assertIsUint8Array(params.iv);
        assertIsNumber(params.taglen);
        const kem = await this.getKEM("sha256", Buffer.from(params.key));
        const iv = Buffer.from(params.iv).slice(0, 16);
        const prefix = Buffer.alloc(16);
        prefix.fill(0);
        const data = Buffer.concat([prefix, Buffer.from(params.data)]);
        const cipher = await this.aes256CbcPkcs7Encrypt({data, key: kem.kE, iv});
        const tag = await this.hmacSha256(kem.kM, cipher);
        return Utils.toArrayBuffer(Buffer.concat([Buffer.from(cipher), Buffer.from(tag).slice(0, params.taglen)]));
    }

    private async aes256CbcHmac256Decrypt(params: Types.Aes256CbcPkcs7Decrypt_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.Aes256CbcPkcs7Decrypt_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.key);

        assertIsNumber(params.taglen);
        const kem = await this.getKEM("sha256", Buffer.from(params.key));
        let data = Buffer.from(params.data);
        const tag = data.slice(data.length - params.taglen);
        data = data.slice(0, data.length - params.taglen);
        const rTag = Buffer.from(await this.hmacSha256(kem.kM, data)).slice(0, params.taglen);
        if (!tag.equals(rTag)) {
            throw new Error("Wrong message security tag");
        }
        const iv = data.slice(0, 16);
        data = data.slice(16);
        return this.aes256CbcPkcs7Decrypt({data, key: kem.kE, iv});
    }

    private async pbkdf2(params: Types.PBKDF2_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.PBKDF2_PARAMS);
        assertIsString(params.password);
        assertIsString(params.salt);
        assertIsNumber(params.rounds);
        assertIsNumber(params.length);
        assertIsString(params.hash);
        const key = await subtle.importKey("raw", new Uint8Array(Buffer.from(params.password, "utf-8")), "PBKDF2", false, ["deriveBits"]);
        return subtle.deriveBits({
            name: "PBKDF2",
            salt: Buffer.from(params.salt, "utf-8"),
            iterations: params.rounds,
            hash: { name: EmCrypto.HASH_ALGORITHM_MAP[params.hash] }
        }, key, params.length * 8);
    }

    private async hash160(params: Types.HASH160_PARAMS): Promise<ArrayBuffer> {
        assertArgsValid(params, Types.HASH160_PARAMS);
        assertIsUint8Array(params.data);
        const sha256 = await subtle.digest("SHA-256", new Uint8Array(params.data));
        return crypto.createHash("ripemd160").update(Buffer.from(sha256)).digest();
    }



    private fillWithZeroesTo32(buffer: Buffer) {
        return buffer.length < 32 ? Buffer.concat([Buffer.alloc(32 - buffer.length).fill(0), buffer]) : buffer;
    }

    private async eccGenPair() {
        const keyPair = EC.genKeyPair();
        const privateKey = this.fillWithZeroesTo32(Buffer.from(keyPair.getPrivate("hex"), "hex"));
        const publicKey = Buffer.from(keyPair.getPublic().encodeCompressed());
        return {
            privateKey: Utils.toArrayBuffer(privateKey),
            publicKey: Utils.toArrayBuffer(publicKey)
        };
    }

    private async eccFromPublicKey(params: Types.FromPublicOrPrivateKey_PARAMS) {
        assertArgsValid(params, Types.FromPublicOrPrivateKey_PARAMS);
        assertIsUint8Array(params.key);
        const keyPairPub = EC.keyFromPublic(Buffer.from(params.key));
        const serializedPub = Buffer.from(keyPairPub.getPublic().encodeCompressed());
        return {
            publicKey: Utils.toArrayBuffer(serializedPub)
        };
    }

    private async eccFromPrivateKey(params: Types.FromPublicOrPrivateKey_PARAMS) {
        assertArgsValid(params, Types.FromPublicOrPrivateKey_PARAMS);
        assertIsUint8Array(params.key);
        const keyPair = EC.keyFromPrivate(Buffer.from(params.key));
        const privateKey = Utils.toArrayBuffer(this.fillWithZeroesTo32(Buffer.from(keyPair.getPrivate("hex"), "hex")));
        const publicKey = Utils.toArrayBuffer(Buffer.from(keyPair.getPublic().encodeCompressed()));
        return {
            privateKey: privateKey,
            publicKey: publicKey
        }
    }

    private async eccSign(params: Types.Sign_PARAMS) {
        assertArgsValid(params, Types.Sign_PARAMS);
        assertIsUint8Array(params.privateKey);
        assertIsUint8Array(params.data);
        const keyPair = EC.keyFromPrivate(Buffer.from(params.privateKey));
        const s = <elliptic.ec.Signature&{recoveryParam: number}>keyPair.sign(Buffer.from(params.data));
        const compact = 27 + s.recoveryParam;
        const buffer = Buffer.alloc(65);
        buffer.writeUInt8(compact, 0);
        Buffer.from(s.r.toArray("be", 32)).copy(buffer, 1);
        Buffer.from(s.s.toArray("be", 32)).copy(buffer, 33);
        return Utils.toArrayBuffer(buffer);
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

    private async eccVerify(params: Types.Verify_PARAMS) {
        assertArgsValid(params, Types.Verify_PARAMS);
        assertIsUint8Array(params.publicKey);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.signature);
        const signature = Buffer.from(params.signature);
        const keyPairPub = EC.keyFromPublic(Buffer.from(params.publicKey));
        const recoveryParam = this.getRecoveryParam(signature.readUInt8(0));
        const r = new BN(signature.slice(1, 33).toString("hex"), 16);
        const s = new BN(signature.slice(33).toString("hex"), 16);
        const sig = {
            r: r,
            s: s,
            recoveryParam: recoveryParam
        };
        return keyPairPub.verify(Buffer.from(params.data), sig);
    }

    private async eccVerify2(params: Types.Verify2_PARAMS) {
        assertArgsValid(params, Types.Verify2_PARAMS);
        assertIsUint8Array(params.data);
        assertIsUint8Array(params.r);
        assertIsUint8Array(params.s);
        const buffer = Buffer.alloc(65);
        buffer.writeUInt8(27, 0);
        Buffer.from(params.r).copy(buffer, 1);
        Buffer.from(params.s).copy(buffer, 33);
        return this.eccVerify({publicKey: params.publicKey, data: buffer, signature: params.data});
    }

    private async eccDerive(params: Types.Derive_PARAMS) {
        assertArgsValid(params, Types.Derive_PARAMS);
        assertIsUint8Array(params.privateKey);
        assertIsUint8Array(params.publicKey);
        const keyPairPub = EC.keyFromPublic(Buffer.from(params.publicKey));
        const keyPairPriv = EC.keyFromPrivate(Buffer.from(params.privateKey));
        const val = keyPairPriv.derive(keyPairPub.getPublic());
        const keyPair = EC.keyFromPrivate(val.toArray());
        return Utils.toArrayBuffer(this.fillWithZeroesTo32(Buffer.from(keyPair.getPrivate("hex"), "hex")));
    }

    private async eccGetOrder(params: undefined) {        
        const n = EC.curve.n;
        return Uint8Array.from(n.toArray());
    }

    private async eccGetGenerator(params: undefined) {
        const g = EC.g;
        return Uint8Array.from(g.encodeCompressed() as any as number[]);
    }

    private async bnGetBitsLength(params: Types.GetBitsLength_PARAMS) {
        assertArgsValid(params, Types.GetBitsLength_PARAMS);
        assertIsUint8Array(params.bn);
        const bn = new BN(Buffer.from(params.bn));
        return bn.bitLength();
    }

    private async bnUmod(params: Types.BNumod_PARAMS) {
        assertArgsValid(params, Types.BNumod_PARAMS);
        assertIsUint8Array(params.bn);
        assertIsUint8Array(params.bn2);
        const bn = new BN(Buffer.from(params.bn));
        const bn2 = new BN(Buffer.from(params.bn2));
        return Uint8Array.from(bn.umod(bn2).toArray());
    }

    private async bnEq(params: Types.BNeq_PARAMS) {
        assertArgsValid(params, Types.BNeq_PARAMS);
        assertIsUint8Array(params.bn);
        assertIsUint8Array(params.bn2);
        const bn = new BN(Buffer.from(params.bn));
        const bn2 = new BN(Buffer.from(params.bn2));
        return bn.eq(bn2);
    }

    private async pointEncode(params: Types.PointEncode_PARAMS) {
        assertArgsValid(params, Types.PointEncode_PARAMS);
        assertIsUint8Array(params.point);
        const point = EC.curve.decodePoint(Buffer.from(params.point));
        if (params.compact) {
            return Uint8Array.from(point.encodeCompressed() as any as number[]);
        } else {
            return Utils.toArrayBuffer(Buffer.from(point.encode()));
        }
    }

    private async pointMul(params: Types.PointMul_PARAMS) {
        assertArgsValid(params, Types.PointMul_PARAMS);
        assertIsUint8Array(params.point);
        assertIsUint8Array(params.bn);
        const point = EC.curve.decodePoint(Buffer.from(params.point));
        const bn = new BN(Buffer.from(params.bn));
        const result = point.mul(bn);
        return Uint8Array.from(result.encodeCompressed() as any as number[]);
    }

    private async pointAdd(params: Types.PointAdd_PARAMS) {
        assertArgsValid(params, Types.PointAdd_PARAMS);
        assertIsUint8Array(params.point);
        assertIsUint8Array(params.point2);
        const point = EC.curve.decodePoint(Buffer.from(params.point));
        const point2 = EC.curve.decodePoint(Buffer.from(params.point2));
        const result = point.add(point2);
        return Uint8Array.from(result.encodeCompressed() as any as number[]);
    }

}
