import { VerificationRequest } from "../Types.js";

/**
 * Application-defined check of the binding between a user ID and a public key,
 * consulted by the WASM core whenever it decrypts data received from other
 * users.
 *
 * The Bridge server distributes users' public keys, so a compromised server
 * could substitute them; implementing this interface lets the application
 * verify each sender against an independent source of truth (the application's
 * own server, a PKI, a blockchain registry, …). Install the implementation
 * with {@link Connection.setUserVerifier} right after connecting.
 *
 * @type {UserVerifierInterface}
 */
export interface UserVerifierInterface {
    /**
     * Decides, for each request item, whether `pubKey` really belonged to
     * `userId` in the given Context at time `date`.
     *
     * Called by the WASM core with the senders of data being decrypted; the
     * verdicts flow back into the verification status reported alongside the
     * decrypted items. The implementation typically queries an external
     * service — it may be `async` and is awaited.
     *
     * @param {VerificationRequest[]} request senders to verify; each item
     *   carries `contextId`, `senderId`, `senderPubKey` and the `date` the data
     *   was created
     * @returns {Promise<boolean[]>} one verdict per request item, in the same
     *   order — `true` accepts the sender, `false` marks the data as coming
     *   from an unverified key
     */
    verify(request: VerificationRequest[]): Promise<boolean[]>;
}
