import { Key } from "../Types";

const AES_GCM_KEY_LENGTH_BYTES = 32;

interface StoredKey {
    keyId: string;
    cryptoKey: Promise<CryptoKey>;
    type: number;
}

export class KeyStore {
    private _keys: Map<string, StoredKey> = new Map<string, StoredKey>();
    private _rawKeys: Map<string, Uint8Array> = new Map<string, Uint8Array>();
    private _encryptionKeyId: string = undefined;

    setKeys(keys: Key[]) {
        this._keys.clear();
        this._rawKeys.clear();
        this._encryptionKeyId = undefined;
        for (const k of keys) {
            const rawKey = new Uint8Array(k.key);
            this.assertKeyBytes(rawKey);
            this._rawKeys.set(k.keyId, rawKey);
            this._keys.set(k.keyId, {
                keyId: k.keyId,
                cryptoKey: crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
                    "encrypt",
                    "decrypt",
                ]),
                type: k.type,
            });
            if (k.type === 0) {
                this._encryptionKeyId = k.keyId;
            }
        }
    }

    async getKey(keyId: string): Promise<CryptoKey | undefined> {
        const key = this._keys.get(keyId);
        return key ? key.cryptoKey : undefined;
    }

    getRawKey(keyId: string): Uint8Array | undefined {
        return this._rawKeys.get(keyId);
    }

    hasKey(keyId: string) {
        return this._keys.has(keyId);
    }

    async getEncryptionKey(): Promise<CryptoKey> {
        if (!this._encryptionKeyId) {
            throw new Error("No encryption key set.");
        }
        return this._keys.get(this._encryptionKeyId).cryptoKey;
    }

    getRawEncryptionKey(): Uint8Array {
        if (!this._encryptionKeyId) {
            throw new Error("No encryption key set.");
        }
        return this._rawKeys.get(this._encryptionKeyId);
    }

    getEncryptionKeyId(): string {
        if (!this._encryptionKeyId) {
            throw new Error("No encryption key set.");
        }
        return this._encryptionKeyId;
    }

    private assertKeyBytes(keyBytes: Uint8Array): void {
        if (keyBytes.length !== AES_GCM_KEY_LENGTH_BYTES) {
            throw new Error(`Invalid key length: ${keyBytes.length}`);
        }
    }
}
