import { DataChannelCryptor } from "./DataChannelCryptor";

/**
 * Manages encrypted data channel communication for a single client session.
 *
 * Owns the outbound monotonic sequence number and the per-remote-stream inbound
 * sequence tracking used for replay protection.
 */
export class DataChannelSession {
    private outboundSeq: number = 1;
    private readonly inboundSeqByRemoteStream: Map<number, number> = new Map();

    constructor(private readonly cryptor: DataChannelCryptor) {}

    /**
     * Encrypts `data` using the active session key and increments the outbound
     * sequence number. Returns the wire-format frame ready to be sent over an
     * `RTCDataChannel`.
     */
    async encrypt(data: Uint8Array): Promise<Uint8Array> {
        return this.cryptor.encryptToWireFormat({
            plaintext: data,
            sequenceNumber: ++this.outboundSeq,
        });
    }

    /**
     * Decrypts a wire-format `frame` received from `remoteStreamId`, verifying
     * that the sequence number is strictly greater than the last accepted one
     * for that stream (replay protection).
     *
     * @returns the decrypted payload and the accepted sequence number.
     * @throws `DataChannelCryptorError` on authentication failure, replay, or
     *         an unrecognised key ID.
     */
    async decrypt(
        remoteStreamId: number,
        frame: Uint8Array,
    ): Promise<{ data: Uint8Array; seq: number }> {
        const lastSeq = this.inboundSeqByRemoteStream.get(remoteStreamId) ?? 0;
        const result = await this.cryptor.decryptFromWireFormat({
            frame,
            lastSequenceNumber: lastSeq,
        });
        this.inboundSeqByRemoteStream.set(remoteStreamId, result.seq);
        return result;
    }
}
