import { Key } from "../Types";

export class KeyStore {
    private _keys: Map<string, Key> = new Map<string, Key>();
    private _encryptionKeyId: string = undefined;
    
    setKeys(keys: Key[]) {
        this._keys.clear();
        for (const k of keys) {
            this._keys.set(k.keyId, k);
            if (k.type === 0) {
                this._encryptionKeyId = k.keyId;
            }
        }
    }

    getKey(keyId: string): Key {
        return this._keys.get(keyId);
    }

    hasKey(keyId: string) {
        return this._keys.has(keyId);
    }

    getEncriptionKey(): Key {
        if (!this._encryptionKeyId) {
            console.error("No encryption key set.");
            console.log("DEBUG-info: ", this._keys);
            console.trace("Location");

            throw new Error("No encryption key set.");
        }
        return this._keys.get(this._encryptionKeyId);
    }
}