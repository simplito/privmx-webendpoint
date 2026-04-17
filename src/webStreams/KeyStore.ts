import { Key } from "../Types";
import { CryptoFacade } from "../crypto/CryptoFacade";

const AES_GCM_KEY_LENGTH_BYTES = 32;

export class KeyStore {
    private readonly registeredKeyIds = new Set<string>();
    private encryptionKeyId: string | undefined = undefined;

    async setKeys(keys: Key[]): Promise<void> {
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
            await CryptoFacade.importKeyAndWipeMaterial(
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

    /**
     * Returns the wire-format key ID to embed in outgoing frames.
     * In this implementation the internal and wire IDs are identical;
     * a future refactor will introduce a session-scoped prefix.
     */
    getEncryptionExternalKeyId(): string {
        return this.getEncryptionKeyId();
    }

    /**
     * Translates a wire-format key ID to the internal CryptoFacade registry ID.
     * In this implementation they are identical; a session-prefix refactor will
     * override this mapping.
     */
    resolveKeyId(externalKeyId: string): string {
        return externalKeyId;
    }
}
