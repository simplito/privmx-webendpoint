import { Key } from "../Types";
import { CryptoFacade } from "../crypto/CryptoFacade";

const AES_GCM_KEY_LENGTH_BYTES = 32;

export class KeyStore {
    private readonly registeredKeyIds = new Set<string>();
    private encryptionKeyId: string | undefined = undefined;

    setKeys(keys: Key[]): void {
        for (const id of this.registeredKeyIds) {
            CryptoFacade.unregisterKey(id);
        }
        this.registeredKeyIds.clear();
        this.encryptionKeyId = undefined;
        for (const k of keys) {
            const rawKey = new Uint8Array(k.key);
            if (rawKey.length !== AES_GCM_KEY_LENGTH_BYTES) {
                throw new Error(`Invalid key length: ${rawKey.length}`);
            }
            CryptoFacade.importKeyAndWipeMaterial(
                rawKey,
                { name: "AES-GCM" },
                ["encrypt", "decrypt"],
                k.keyId,
            );
            this.registeredKeyIds.add(k.keyId);
            if (k.type === 0) {
                this.encryptionKeyId = k.keyId;
            }
        }
    }

    hasKey(keyId: string): boolean {
        return this.registeredKeyIds.has(keyId);
    }

    getEncryptionKeyId(): string {
        if (!this.encryptionKeyId) {
            throw new Error("No encryption key set.");
        }
        return this.encryptionKeyId;
    }
}
