import { DataChannelCryptor } from "./DataChannelCryptor";

/**
 * Manages encrypted data channel communication for a single client session.
 * Owns the outbound sequence number and per-remote-stream inbound sequence tracking.
 */
export class DataChannelSession {
    private outboundSeq: number = 1;
    private readonly inboundSeqByRemoteStream: Map<number, number> = new Map();

    constructor(private readonly cryptor: DataChannelCryptor) {}

    async encrypt(data: Uint8Array): Promise<Uint8Array> {
        return this.cryptor.encryptToWireFormat({
            plaintext: data,
            sequenceNumber: ++this.outboundSeq,
        });
    }

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
