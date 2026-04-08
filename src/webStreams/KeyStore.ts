import { Key } from "../Types";
import { CryptoFacade } from "../crypto/CryptoFacade";

const AES_GCM_KEY_LENGTH_BYTES = 32;

export class KeyStore {
    // Maps SHA-256 hex digest of raw key bytes -> registered keyId in CryptoFacade registry
    private readonly keyHashRegistry = new Map<string, string>();

    private readonly rawKeys = new Map<string, Uint8Array>();
    private encryptionKeyId: string | undefined = undefined;

    setKeys(keys: Key[]): void {
        for (const id of this.rawKeys.keys()) {
            CryptoFacade.unregisterKey(id);
        }
        this.rawKeys.clear();
        this.keyHashRegistry.clear();
        this.encryptionKeyId = undefined;
        for (const k of keys) {
            const rawKey = new Uint8Array(k.key);
            if (rawKey.length !== AES_GCM_KEY_LENGTH_BYTES) {
                throw new Error(`Invalid key length: ${rawKey.length}`);
            }
            this.rawKeys.set(k.keyId, rawKey);
            CryptoFacade.importKey(rawKey, { name: "AES-GCM" }, ["encrypt", "decrypt"], k.keyId);
            if (k.type === 0) {
                this.encryptionKeyId = k.keyId;
            }
        }
    }

    hasKey(keyId: string): boolean {
        return this.rawKeys.has(keyId);
    }

    getEncryptionKeyId(): string {
        if (!this.encryptionKeyId) {
            throw new Error("No encryption key set.");
        }
        return this.encryptionKeyId;
    }

    getRawKey(keyId: string): Uint8Array | undefined {
        return this.rawKeys.get(keyId);
    }

    getRawEncryptionKey(): Uint8Array {
        if (!this.encryptionKeyId) {
            throw new Error("No encryption key set.");
        }
        return this.rawKeys.get(this.encryptionKeyId);
    }

    async importKeyIfAbsent(
        key: Uint8Array,
        algo: AlgorithmIdentifier,
        usages: KeyUsage[],
    ): Promise<string> {
        const prefix = new TextEncoder().encode("secret:");
        const input = new Uint8Array(prefix.length + key.length);
        input.set(prefix);
        input.set(key, prefix.length);
        const hashBuffer = await crypto.subtle.digest("SHA-256", input as unknown as BufferSource);
        const keyHash = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");

        const existing = this.keyHashRegistry.get(keyHash);
        if (existing !== undefined) {
            return existing;
        }

        const keyId = await CryptoFacade.importKey(key, algo, usages);
        this.keyHashRegistry.set(keyHash, keyId);
        return keyId;
    }
}
