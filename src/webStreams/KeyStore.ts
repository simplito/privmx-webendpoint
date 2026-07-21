import { Key } from "../Types.js";
import { CryptoFacade } from "../crypto/CryptoFacade.js";

const AES_GCM_KEY_LENGTH_BYTES = 32;

const textEncoder = new TextEncoder();

/**
 * Owns the set of AES-256-GCM keys for a single WebRTC session.
 *
 * Keys are registered in the global CryptoFacade registry under a
 * session-scoped internal ID (`<sessionPrefix>:<externalKeyId>`) to
 * prevent cross-session collisions when the server reuses key IDs.
 *
 * Callers work exclusively with the external key IDs (as they appear on
 * the wire). `resolveKeyId()` translates to the internal registry key.
 * @internal
 */
export class KeyStore {
    private readonly sessionPrefix: string;
    private readonly externalToInternal = new Map<string, string>();
    private encryptionInternalKeyId: string | undefined = undefined;
    // Wire-format (external) ID of the active encryption key and its UTF-8
    // bytes, both cached at setKeys time. They are written into every outgoing
    // frame, so deriving them per frame - a String.slice plus a
    // TextEncoder.encode - would be pure hot-path waste.
    private encryptionExternalKeyId: string | undefined = undefined;
    private encryptionExternalKeyIdBytes: Uint8Array | undefined = undefined;

    constructor() {
        this.sessionPrefix = crypto.randomUUID();
    }

    async setKeys(keys: Key[]): Promise<void> {
        for (const internalId of this.externalToInternal.values()) {
            CryptoFacade.unregisterKey(internalId);
        }
        this.externalToInternal.clear();
        this.encryptionInternalKeyId = undefined;
        this.encryptionExternalKeyId = undefined;
        this.encryptionExternalKeyIdBytes = undefined;

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
                this.encryptionExternalKeyId = k.keyId;
                this.encryptionExternalKeyIdBytes = textEncoder.encode(k.keyId);
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
        if (this.encryptionExternalKeyId === undefined) {
            throw new Error("No encryption key set.");
        }
        return this.encryptionExternalKeyId;
    }

    /**
     * Returns the cached UTF-8 bytes of the active encryption key's external
     * (wire-format) ID, ready to write straight into an outgoing frame. Computed
     * once per {@link setKeys} rather than re-encoded per frame. The returned
     * array is shared - callers must copy from it (e.g. `result.set(...)`), not
     * mutate it. Throws if no encryption key has been set.
     */
    getEncryptionExternalKeyIdBytes(): Uint8Array {
        if (this.encryptionExternalKeyIdBytes === undefined) {
            throw new Error("No encryption key set.");
        }
        return this.encryptionExternalKeyIdBytes;
    }
}
