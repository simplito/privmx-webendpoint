import { StreamHandle } from "../Types";
import { StreamRoomId, StreamTrack } from "./types/ApiTypes";
import { PeerConnectionManager, SessionId } from "./PeerConnectionManager";
import { AudioManager } from "./AudioManager";
import { E2eeTransformManager } from "./E2eeTransformManager";

/**
 * Manages the publisher-side peer connection for a single stream room:
 * track setup, audio metering, and E2EE sender transform installation.
 */
export class PublisherManager {
    constructor(
        private readonly pcm: PeerConnectionManager,
        private readonly audioManager: AudioManager,
        private readonly e2eeTransformManager: E2eeTransformManager,
    ) {}

    async createWithLocalStream(
        streamHandle: StreamHandle,
        streamRoomId: StreamRoomId,
        stream?: MediaStream,
        dataTracks?: StreamTrack[],
    ): Promise<RTCPeerConnection> {
        this.pcm.initialize(streamRoomId, "publisher", -1 as SessionId, streamHandle);
        const pc = this.pcm.getConnectionWithSession(streamRoomId, "publisher").pc;

        if (stream && stream.getTracks().length > 0) {
            for (const track of stream.getTracks()) {
                if (track.kind === "audio") {
                    await this.audioManager.ensureLocalAudioLevelMeter(track);
                }
                const sender = pc.addTrack(track, stream);
                await this.e2eeTransformManager.setupSenderTransform(sender);
            }
        }

        if (dataTracks) {
            for (const dataTrack of dataTracks) {
                const dc = pc.createDataChannel("JanusDataChannel", {
                    ordered: true,
                    negotiated: false,
                });
                dataTrack.dataChannelMeta.dataChannel = dc;
            }
        }

        return pc;
    }

    async updateLocalStream(
        streamRoomId: StreamRoomId,
        localStream: MediaStream,
        tracksToAdd: MediaStreamTrack[],
        tracksToRemove: MediaStreamTrack[],
    ): Promise<RTCPeerConnection> {
        this.pcm.initialize(streamRoomId, "publisher");
        const pc = this.pcm.getConnectionWithSession(streamRoomId, "publisher").pc;

        for (const track of tracksToAdd) {
            if (track.kind === "audio") {
                await this.audioManager.ensureLocalAudioLevelMeter(track);
            }
            const sender = pc.addTrack(track, localStream);
            await this.e2eeTransformManager.setupSenderTransform(sender);
        }

        for (const oldTrack of tracksToRemove) {
            if (oldTrack.kind === "audio") {
                this.audioManager.stopLocalAudioLevelMeter(oldTrack);
            }
            const sender = pc.getSenders().find((s) => s.track === oldTrack);
            if (sender) pc.removeTrack(sender);
        }

        return pc;
    }

    async createOffer(roomId: StreamRoomId): Promise<string> {
        const pc = this.pcm.getConnectionWithSession(roomId, "publisher").pc;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!offer.sdp) throw new Error("createOffer returned no SDP");
        return offer.sdp;
    }

    async setRemoteDescription(roomId: StreamRoomId, sdp: string, type: RTCSdpType): Promise<void> {
        const pc = this.pcm.getConnectionWithSession(roomId, "publisher").pc;
        await pc.setRemoteDescription(new RTCSessionDescription({ sdp, type }));
    }

    removeAndCleanup(streamRoomId: StreamRoomId, stream: MediaStream): void {
        for (const track of stream.getAudioTracks()) {
            this.audioManager.stopLocalAudioLevelMeter(track);
        }
        this.pcm.closePeerConnectionBySessionIfExists(streamRoomId, "publisher");
    }

    updateSessionId(roomId: StreamRoomId, sessionId: SessionId): void {
        this.pcm.updateSessionForConnection(roomId, "publisher", sessionId);
    }

    close(roomId: StreamRoomId): void {
        this.pcm.closePeerConnectionBySessionIfExists(roomId, "publisher");
    }
}
