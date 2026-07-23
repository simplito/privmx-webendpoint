import { Key } from "../Types.js";
import { CryptoFacade } from "../crypto/CryptoFacade.js";

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
 * @internal
 */
export class KeyStore {
    private readonly sessionPrefix: string;
    // Swapped by reference in setKeys (not mutated in place) so a rekey has no
    // window where the store holds no usable key.
    private externalToInternal = new Map<string, string>();
    private epochToInternalIds = new Map<number, string[]>();
    private encryptionInternalKeyId: string | undefined = undefined;
    // Wire-format (external) ID of the active encryption key, cached at setKeys
    // time. Consumed by the data-channel format (`DataChannelCryptor`); the media
    // frame format identifies the key by the compact `encryptionEpoch` instead.
    private encryptionExternalKeyId: string | undefined = undefined;
    // Compact 1-byte key epoch for the v2 media frame format, cached at setKeys
    // time. `encryptionEpoch` tags outgoing frames; `epochToInternalIds` resolves
    // an incoming frame's epoch back to candidate keys (usually one).
    private encryptionEpoch: number | undefined = undefined;

    constructor() {
        this.sessionPrefix = crypto.randomUUID();
    }

    /**
     * Replaces the key set atomically. New keys are imported into fresh maps
     * which are then swapped in by reference; only afterwards are keys that are
     * no longer present unregistered. This leaves no window where a concurrent
     * frame transform (interleaving at the `await` below) sees an empty store, so
     * a rotation never drops outbound frames or stalls decryption. Rejects
     * (invalid length, or an import failure rolled back) without disturbing the
     * live key set.
     */
    async setKeys(keys: Key[]): Promise<void> {
        // Validate everything up front so a bad batch rejects before any import.
        for (const k of keys) {
            if (k.key.byteLength !== AES_GCM_KEY_LENGTH_BYTES) {
                throw new Error(`Invalid key length: ${k.key.byteLength}`);
            }
        }

        const nextExternalToInternal = new Map<string, string>();
        const nextEpochToInternalIds = new Map<number, string[]>();
        let nextEncryptionInternalKeyId: string | undefined = undefined;
        let nextEncryptionExternalKeyId: string | undefined = undefined;
        let nextEncryptionEpoch: number | undefined = undefined;

        const liveInternalIds = new Set(this.externalToInternal.values());
        const imported: string[] = [];
        try {
            for (const k of keys) {
                const rawKey = new Uint8Array(k.key);
                const internalId = `${this.sessionPrefix}:${k.keyId}`;
                await CryptoFacade.importKeyAndWipeMaterial(
                    rawKey,
                    { name: "AES-GCM" },
                    ["encrypt", "decrypt"],
                    internalId,
                );
                imported.push(internalId);
                nextExternalToInternal.set(k.keyId, internalId);

                const epoch = KeyStore.epochOf(k.keyId);
                const bucket = nextEpochToInternalIds.get(epoch);
                if (bucket) bucket.push(internalId);
                else nextEpochToInternalIds.set(epoch, [internalId]);

                if (k.type === 0) {
                    nextEncryptionInternalKeyId = internalId;
                    nextEncryptionExternalKeyId = k.keyId;
                    nextEncryptionEpoch = epoch;
                }
            }
        } catch (e) {
            // Roll back registrations made in this call, but never a key id the
            // still-live set depends on, then leave the old key set untouched.
            for (const internalId of imported) {
                if (!liveInternalIds.has(internalId)) CryptoFacade.unregisterKey(internalId);
            }
            throw e;
        }

        // Atomic swap - subsequent lookups see the complete new set.
        this.externalToInternal = nextExternalToInternal;
        this.epochToInternalIds = nextEpochToInternalIds;
        this.encryptionInternalKeyId = nextEncryptionInternalKeyId;
        this.encryptionExternalKeyId = nextEncryptionExternalKeyId;
        this.encryptionEpoch = nextEncryptionEpoch;

        // Retire keys no longer present, skipping any id reused by the new set.
        const nextInternalIds = new Set(nextExternalToInternal.values());
        for (const internalId of liveInternalIds) {
            if (!nextInternalIds.has(internalId)) CryptoFacade.unregisterKey(internalId);
        }
    }

    /**
     * Derives the 1-byte epoch tag for an external key ID (an FNV-1a-style hash
     * of the JS string, folded to a byte). Deterministic and identical across
     * peers because they share the same external key IDs, so it needs no
     * server-assigned epoch number. The decoder resolves the actual key via
     * {@link resolveInternalKeyIdsByEpoch} and the AEAD tag, so the rare (~1/256)
     * collision between the ≤2 live keys is handled by trying both candidates.
     *
     * NOTE: this is implementation-defined, not a portable wire spec - it hashes
     * UTF-16 code units and folds with an extra XOR, so it is only valid because
     * media-frame E2EE is JS-only (all peers run this exact function). A non-JS
     * endpoint that ever needs to compute the epoch must replicate this method
     * verbatim, not a textbook FNV-1a.
     */
    private static epochOf(externalKeyId: string): number {
        let h = 0x811c9dc5;
        for (let i = 0; i < externalKeyId.length; i++) {
            h ^= externalKeyId.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h ^ (h >>> 8) ^ (h >>> 16) ^ (h >>> 24)) & 0xff;
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
     * Returns the 1-byte epoch tag of the active encryption key, to write into
     * an outgoing v2 frame trailer. Throws if no encryption key has been set.
     */
    getEncryptionEpoch(): number {
        if (this.encryptionEpoch === undefined) {
            throw new Error("No encryption key set.");
        }
        return this.encryptionEpoch;
    }

    /**
     * Returns the internal CryptoFacade key IDs of all held keys whose epoch tag
     * equals `epoch` - the candidates to try when decrypting a v2 frame. Usually
     * one; two only on the rare epoch-hash collision, which the AEAD tag then
     * disambiguates. Empty when no held key matches (unknown/foreign frame).
     */
    resolveInternalKeyIdsByEpoch(epoch: number): string[] {
        return this.epochToInternalIds.get(epoch) ?? [];
    }
}
