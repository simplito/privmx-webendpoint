import { Key } from "../Types";
import { CryptoFacade } from "../crypto/CryptoFacade";

const AES_GCM_KEY_LENGTH_BYTES = 32;

/**
 * Owns the set of AES-256-GCM keys for a single WebRTC session.
 *
 * Keys are registered in the global CryptoFacade registry under a
 * session-scoped internal ID (`<sessionPrefix>:<externalKeyId>`) to
 * prevent cross-session collisions when the server reuses key IDs.
 *
 * Callers work exclusively with the external key IDs (as they appear on
 * the wire). `resolveKeyId()` translates to the internal registry key.
 */
export class KeyStore {
    private readonly sessionPrefix: string;
    private readonly externalToInternal = new Map<string, string>();
    private encryptionInternalKeyId: string | undefined = undefined;

    constructor() {
        this.sessionPrefix = crypto.randomUUID();
    }

    async setKeys(keys: Key[]): Promise<void> {
        for (const internalId of this.externalToInternal.values()) {
            CryptoFacade.unregisterKey(internalId);
        }
        this.externalToInternal.clear();
        this.encryptionInternalKeyId = undefined;

        for (const k of keys) {
            const rawKey = new Uint8Array(k.key);
            if (rawKey.length !== AES_GCM_KEY_LENGTH_BYTES) {
                throw new Error(`Invalid key length: ${rawKey.length}`);
            }
            const internalId = `${this.sessionPrefix}:${k.keyId}`;
            await CryptoFacade.importKeyAndWipeMaterial(
                rawKey,
                { name: "AES-GCM" },
                ["encrypt", "decrypt"],
                internalId,
            );
            this.externalToInternal.set(k.keyId, internalId);
            if (k.type === 0) {
                this.encryptionInternalKeyId = internalId;
            }
        }
    }

    hasKey(externalKeyId: string): boolean {
        return this.externalToInternal.has(externalKeyId);
    }

    /**
     * Returns the internal CryptoFacade key ID for the given external (wire) key ID.
     * Throws if the key is not registered.
     */
    resolveKeyId(externalKeyId: string): string {
        const internal = this.externalToInternal.get(externalKeyId);
        if (!internal) throw new Error(`Key not found: ${externalKeyId}`);
        return internal;
    }

    /**
     * Returns the internal CryptoFacade key ID for the active encryption key.
     * Pass this to CryptoFacade encrypt/decrypt calls.
     * Throws if no encryption key has been set.
     */
    getEncryptionKeyId(): string {
        if (!this.encryptionInternalKeyId) {
            throw new Error("No encryption key set.");
        }
        return this.encryptionInternalKeyId;
    }

    /**
     * Returns the external (wire-format) key ID for the active encryption key.
     * Write this value into the wire frame so the peer can look it up.
     * Throws if no encryption key has been set.
     */
    getEncryptionExternalKeyId(): string {
        if (!this.encryptionInternalKeyId) {
            throw new Error("No encryption key set.");
        }
        // Strip the session prefix to recover the original external key ID.
        return this.encryptionInternalKeyId.slice(this.sessionPrefix.length + 1);
    }
}
