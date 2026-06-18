import { Api } from "../native/Api.js";
import { ExtKeyNative, ExtKeyNativePtr } from "../native/ExtKeyNative.js";
import { FinalizationHelper } from "../FinalizationHelper.js";
import { BaseApi } from "./BaseApi.js";

/**
 * A BIP-32 hierarchical-deterministic (HD) extended key: a secp256k1 key pair
 * plus a chain code, from which whole trees of child keys can be derived.
 *
 * All operations run locally in the C++/WASM core — keys never leave the
 * browser and no server is contacted; {@link EndpointFactory.setup} must have
 * completed first. Obtain instances from the static factories
 * ({@link fromSeed}, {@link fromBase58}, {@link generateRandom}) or from the
 * `extKey` field of the {@link BIP39} result of `CryptoApi.generateBip39` /
 * `fromMnemonic` — the constructor is private.
 *
 * Typical use: derive per-purpose child keys with {@link derive} /
 * {@link deriveHardened}, then extract a WIF private key
 * ({@link getPrivateKey}) for {@link EndpointFactory.connect} or a BASE58DER
 * public key ({@link getPublicKey}) for Context ACLs. Native resources are
 * freed automatically when an instance is garbage-collected.
 *
 * All methods reject with `NativeError` when the WASM core reports a failure
 * (e.g. invalid input or a public-only key asked for private material).
 */
export class ExtKey extends BaseApi {
    private static api: Api;

    /**
     * Called by EndpointFactory during WASM initialisation.
     * @internal
     */
    static init(api: Api): void {
        ExtKey.api = api;
    }

    private static makeNative(): ExtKeyNative {
        return new ExtKeyNative(ExtKey.api);
    }

    private static registerFinalization(extKey: ExtKey, ptr: ExtKeyNativePtr): void {
        FinalizationHelper.getInstance().register(extKey, {
            ptr,
            onFree: async () => {
                await new ExtKeyNative(ExtKey.api).deleteExtKey(ptr);
            },
        });
    }

    /**
     * Builds the root extended key of a BIP-32 tree from a binary seed.
     *
     * Runs the standard BIP-32 master-key derivation (HMAC-SHA512 over the
     * seed) locally in the WASM core, yielding the private key and chain code.
     *
     * Use it to recreate a deterministic key hierarchy from stored entropy —
     * typically a 64-byte seed produced by `CryptoApi.mnemonicToSeed` — then
     * derive children with {@link derive} or {@link deriveHardened}.
     *
     * @param {Uint8Array} seed binary seed the master key is computed from,
     *   e.g. the 64-byte output of `CryptoApi.mnemonicToSeed`
     * @returns {ExtKey} private root key of the hierarchy — call
     *   {@link derive} / {@link getPrivateKey} on it
     */
    static async fromSeed(seed: Uint8Array): Promise<ExtKey> {
        const native = this.makeNative();
        const ptr = await native.fromSeed([seed]);
        const extKey = new ExtKey(native, ptr);
        this.registerFinalization(extKey, ptr);
        return extKey;
    }

    /**
     * Reconstructs an extended key from its Base58 serialisation.
     *
     * Decodes the standard BIP-32 Base58 string (key material + chain code)
     * locally in the WASM core; whether the result is private or public
     * depends on which part was serialised.
     *
     * Use it to restore a key previously exported with
     * {@link getPrivatePartAsBase58} or {@link getPublicPartAsBase58} — e.g.
     * one persisted by the application or received from another device.
     *
     * @param {string} base58 serialised extended key produced by
     *   {@link getPrivatePartAsBase58} or {@link getPublicPartAsBase58}
     * @returns {ExtKey} the restored key — check {@link isPrivate} to see
     *   which operations it supports
     * @throws {NativeError} when the string is not a valid Base58-encoded
     *   extended key
     */
    static async fromBase58(base58: string): Promise<ExtKey> {
        const native = this.makeNative();
        const ptr = await native.fromBase58([base58]);
        const extKey = new ExtKey(native, ptr);
        this.registerFinalization(extKey, ptr);
        return extKey;
    }

    /**
     * Creates a brand-new random extended key.
     *
     * Draws fresh entropy from the WASM core's CSPRNG and derives a BIP-32
     * private key with chain code — locally, with no server involvement.
     *
     * Use it as the root of a new key hierarchy when no mnemonic backup is
     * needed; otherwise prefer `CryptoApi.generateBip39`, which also yields a
     * recovery phrase. Persist the key with {@link getPrivatePartAsBase58}.
     *
     * @returns {ExtKey} random private extended key — derive children with
     *   {@link derive} or export with {@link getPrivatePartAsBase58}
     */
    static async generateRandom(): Promise<ExtKey> {
        const native = this.makeNative();
        const ptr = await native.generateRandom([]);
        const extKey = new ExtKey(native, ptr);
        this.registerFinalization(extKey, ptr);
        return extKey;
    }

    /**
     * //doc-gen:ignore
     * @param {ExtKeyNativePtr} ptr raw native pointer to an existing ExtKey WASM object
     * @returns {ExtKey} ExtKey instance wrapping the given native pointer
     */
    static fromPtr(ptr: ExtKeyNativePtr): ExtKey {
        return new ExtKey(this.makeNative(), ptr);
    }

    /**
     * Instances are created by the static `from*` / `generateRandom` factories.
     * @internal
     */
    private constructor(
        private readonly native: ExtKeyNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Derives the normal (non-hardened) child key at the given index.
     *
     * Runs BIP-32 child derivation (HMAC-SHA512 over the parent chain code and
     * key) locally in the WASM core; the same parent and index always yield
     * the same child.
     *
     * Use it to give each purpose (device, sub-account, Context) its own key
     * under one root. Note that normal derivation also works from a
     * public-only key, so a leaked parent public key plus any child private
     * key exposes siblings — use {@link deriveHardened} where that matters.
     *
     * @param {number} index child position in the BIP-32 tree, from 0 to
     *   2^31-1; each index deterministically yields a distinct child
     * @returns {ExtKey} child extended key — derive further or extract keys
     *   with {@link getPrivateKey} / {@link getPublicKey}
     * @throws {NativeError} when `index` is outside the non-hardened range
     */
    async derive(index: number): Promise<ExtKey> {
        const ptr = await this.native.derive(this.servicePtr, [index]);
        const extKey = new ExtKey(this.native, ptr);
        FinalizationHelper.getInstance().register(extKey, {
            ptr,
            onFree: async () => {
                await this.native.deleteExtKey(ptr);
            },
        });
        return extKey;
    }

    /**
     * Derives the hardened child key at the given index.
     *
     * Runs BIP-32 hardened derivation locally in the WASM core — the parent
     * private key (not just the public part) enters the HMAC, so hardened
     * children cannot be linked to or derived from the parent public key.
     *
     * Prefer it over {@link derive} for identity keys, where a compromised
     * child must not endanger its siblings; it requires a private parent
     * (see {@link isPrivate}).
     *
     * @param {number} index child position in the BIP-32 tree, from 0 to
     *   2^31-1 (mapped internally to the hardened range)
     * @returns {ExtKey} hardened child extended key — derive further or
     *   extract keys with {@link getPrivateKey} / {@link getPublicKey}
     * @throws {NativeError} when this key is public-only and hardened
     *   derivation is impossible
     */
    async deriveHardened(index: number): Promise<ExtKey> {
        const ptr = await this.native.deriveHardened(this.servicePtr, [index]);
        return new ExtKey(this.native, ptr);
    }

    /**
     * Serialises the full private extended key (private key + chain code) to
     * Base58.
     *
     * Encodes the standard BIP-32 serialisation locally in the WASM core — the
     * resulting string contains secret material capable of deriving the whole
     * subtree.
     *
     * Use it to persist or transfer the key; restore later with
     * {@link fromBase58}. Treat the string like a password.
     *
     * @returns {string} Base58 private extended key — accepted by
     *   {@link fromBase58}; store it securely
     */
    async getPrivatePartAsBase58(): Promise<string> {
        return this.native.getPrivatePartAsBase58(this.servicePtr, []);
    }

    /**
     * Serialises the public part of the extended key (public key + chain code)
     * to Base58.
     *
     * Encodes the standard BIP-32 public serialisation locally in the WASM
     * core; it contains no secret material but still allows deriving the
     * subtree's non-hardened public keys.
     *
     * Share it where another party needs to derive or verify child public
     * keys without being able to sign; restore with {@link fromBase58}.
     *
     * @returns {string} Base58 public extended key — accepted by
     *   {@link fromBase58}, which then yields a public-only {@link ExtKey}
     */
    async getPublicPartAsBase58(): Promise<string> {
        return this.native.getPublicPartAsBase58(this.servicePtr, []);
    }

    /**
     * Extracts this node's plain ECC private key in WIF format.
     *
     * Strips the BIP-32 wrapping locally in the WASM core, leaving just the
     * secp256k1 private key — the format the rest of the SDK works with.
     *
     * Use the result as the user's identity key for
     * {@link EndpointFactory.connect} or for `CryptoApi.signData`.
     *
     * @returns {string} secp256k1 private key in WIF format — pass it to
     *   {@link EndpointFactory.connect}
     */
    async getPrivateKey(): Promise<string> {
        return this.native.getPrivateKey(this.servicePtr, []);
    }

    /**
     * Extracts this node's plain ECC public key in BASE58DER format.
     *
     * Strips the BIP-32 wrapping locally in the WASM core, leaving just the
     * secp256k1 public key — the counterpart of {@link getPrivateKey}.
     *
     * Use it wherever PrivMX expects a user's public key: Context ACLs,
     * `UserWithPubKey` arrays, or `CryptoApi.verifySignature`.
     *
     * @returns {string} secp256k1 public key in BASE58DER format — usable in
     *   `UserWithPubKey` entries and `CryptoApi.verifySignature`
     */
    async getPublicKey(): Promise<string> {
        return this.native.getPublicKey(this.servicePtr, []);
    }

    /**
     * Extracts the raw 32-byte private key, suitable for symmetric-style use.
     *
     * Returns the unencoded secp256k1 scalar from the WASM core — no WIF or
     * Base58 wrapping, just the bytes.
     *
     * Use it when a derived key should serve as raw secret material for a
     * custom scheme (e.g. as input to `CryptoFacade.importKeyAndWipeMaterial`);
     * for PrivMX APIs prefer the WIF form from {@link getPrivateKey}.
     *
     * @returns {Uint8Array} 32 raw private-key bytes — secret material, wipe
     *   or import it promptly after use
     */
    async getPrivateEncKey(): Promise<Uint8Array> {
        return this.native.getPrivateEncKey(this.servicePtr, []);
    }

    /**
     * Computes the Bitcoin-style Base58 address of this node's public key.
     *
     * Hashes the secp256k1 public key (SHA-256 then RIPEMD-160) and
     * Base58Check-encodes the result locally in the WASM core.
     *
     * Use it as a short, human-comparable fingerprint of the public key — e.g.
     * for display or out-of-band identity verification.
     *
     * @returns {string} Base58Check address derived from the public key — a
     *   compact fingerprint for display and comparison
     */
    async getPublicKeyAsBase58Address(): Promise<string> {
        return this.native.getPublicKeyAsBase58Address(this.servicePtr, []);
    }

    /**
     * Returns the BIP-32 chain code of this extended key.
     *
     * Reads the 32-byte chain code (the non-key half of the extended key that
     * makes child derivation possible) from the WASM core.
     *
     * Use it for interoperability with external BIP-32 implementations that
     * accept key and chain code separately. The chain code alone is not
     * secret, but combined with a child private key it can expose siblings.
     *
     * @returns {Uint8Array} 32-byte raw chain code of this BIP-32 node
     */
    async getChainCode(): Promise<Uint8Array> {
        return this.native.getChainCode(this.servicePtr, []);
    }

    /**
     * Verifies a compact ECDSA signature against this key's public part.
     *
     * Hashes the message and checks the compact (r‖s with recovery byte)
     * secp256k1 signature locally in the WASM core.
     *
     * Use it to authenticate messages signed by the holder of this key's
     * private part — e.g. signatures produced with `CryptoApi.signData` by the
     * key from {@link getPrivateKey}.
     *
     * @param {Uint8Array} message exact bytes that were signed — any
     *   modification makes verification fail
     * @param {Uint8Array} signature compact ECDSA signature to check, e.g.
     *   produced by `CryptoApi.signData`
     * @returns {boolean} `true` when the signature was made by this key's
     *   private counterpart over exactly this message
     */
    async verifyCompactSignatureWithHash(
        message: Uint8Array,
        signature: Uint8Array,
    ): Promise<boolean> {
        return this.native.verifyCompactSignatureWithHash(this.servicePtr, [message, signature]);
    }

    /**
     * Tells whether this extended key contains the private part.
     *
     * Inspects the key material held in the WASM core — a purely local check
     * with no derivation involved.
     *
     * Check it before calling private-only operations ({@link getPrivateKey},
     * {@link getPrivatePartAsBase58}, {@link deriveHardened}) on keys restored
     * with {@link fromBase58}, which may be public-only.
     *
     * @returns {boolean} `true` for a private key (full capability), `false`
     *   for a public-only key limited to verification and non-hardened
     *   public derivation
     */
    async isPrivate(): Promise<boolean> {
        return this.native.isPrivate(this.servicePtr, []);
    }
}
