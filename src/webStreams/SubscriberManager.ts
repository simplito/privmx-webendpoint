import { Jsep, StreamRoomId } from "./types/ApiTypes";
import { PeerConnectionManager, SessionId } from "./PeerConnectionManager";

interface QueueItem {
    room: StreamRoomId;
    jsep: { sdp: string; type: RTCSdpType };
}
import { E2eeTransformManager } from "./E2eeTransformManager";
import { RemoteStreamListenerRegistry } from "./RemoteStreamListenerRegistry";
import { Queue } from "./Queue";
import { Logger } from "./Logger";

/**
 * Manages the subscriber-side peer connection for a stream room:
 * SDP offer/answer negotiation, the reconfigure queue, and remote track wiring.
 */
export class SubscriberManager {
    private readonly reconfigureQueue: Queue<QueueItem>;
    private readonly lastProcessedAnswer: { [roomId: string]: Jsep } = {};
    private readonly bootstrapChannels: Map<StreamRoomId, RTCDataChannel[]> = new Map();
    private readonly logger = new Logger();

    constructor(
        private readonly pcm: PeerConnectionManager,
        private readonly e2eeTransformManager: E2eeTransformManager,
        private readonly listenerRegistry: RemoteStreamListenerRegistry,
    ) {
        this.reconfigureQueue = new Queue<QueueItem>();
        this.reconfigureQueue.assignProcessorFunc(async (item) => {
            await this.reconfigureSingle(item.room, item.jsep);
        });
    }

    initialize(roomId: StreamRoomId): void {
        this.pcm.initialize(roomId, "subscriber");
    }

    async onSubscriptionUpdated(room: StreamRoomId, offer: Jsep): Promise<void> {
        this.reconfigureQueue.enqueue({ room, jsep: offer });
        try {
            await this.reconfigureQueue.processAll();
        } catch (e) {
            console.error("Error processing subscriber reconfigure queue", e);
        }
    }

    getLastProcessedAnswer(room: StreamRoomId): Jsep {
        const answer = this.lastProcessedAnswer[room];
        if (!answer) throw new Error(`No processed answer for room: ${room}`);
        return answer;
    }

    async onRemoteTrack(roomId: StreamRoomId, event: RTCTrackEvent): Promise<void> {
        const receiver = event.receiver;
        const publisherId = Number(event.streams[0].id);
        const pc = this.pcm.getConnectionWithSession(roomId, "subscriber").pc;

        this.logger.debug("waitUntilConnected...");
        await this.waitUntilConnected(pc);

        this.logger.debug("setupReceiverTransform...");
        await this.e2eeTransformManager.setupReceiverTransform(receiver, publisherId);
        event.track.addEventListener("ended", async () => {
            await this.e2eeTransformManager.teardownReceiver(receiver);
        });

        this.listenerRegistry.dispatchTrack(roomId, event);
    }

    updateSessionId(roomId: StreamRoomId, sessionId: SessionId): void {
        this.pcm.updateSessionForConnection(roomId, "subscriber", sessionId);
    }

    close(roomId: StreamRoomId): void {
        this.pcm.closePeerConnectionBySessionIfExists(roomId, "subscriber");
        delete this.lastProcessedAnswer[roomId];
        this.closeBootstrapChannels(roomId);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private closeBootstrapChannels(roomId: StreamRoomId): void {
        const channels = this.bootstrapChannels.get(roomId);
        if (channels) {
            for (const dc of channels) {
                try { dc.close(); } catch { /* ignore */ }
            }
            this.bootstrapChannels.delete(roomId);
        }
    }

    private waitUntilConnected(pc: RTCPeerConnection): Promise<void> {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            const onChange = () => {
                if (
                    pc.iceConnectionState === "connected" ||
                    pc.iceConnectionState === "completed"
                ) {
                    pc.removeEventListener("iceconnectionstatechange", onChange);
                    resolve();
                } else if (
                    pc.iceConnectionState === "failed" ||
                    pc.connectionState === "failed" ||
                    pc.connectionState === "closed"
                ) {
                    pc.removeEventListener("iceconnectionstatechange", onChange);
                    reject(new Error("ICE/DTLS not connected"));
                }
            };
            pc.addEventListener("iceconnectionstatechange", onChange);
        });
    }

    private async reconfigureSingle(room: StreamRoomId, offer: Jsep): Promise<void> {
        const pc = this.pcm.getConnectionWithSession(room, "subscriber").pc;
        this.logger.debug("SUBSCRIBER RECV OFFER FROM PUBLISHER:", offer.sdp);

        // Create a bootstrap data channel on every reconfigure so that Janus
        // sees the data-channel m= line in each offer/answer exchange.
        const dc = pc.createDataChannel("JanusDataChannel");
        dc.onerror = (e) => console.error("Bootstrap data channel error:", e);
        const existing = this.bootstrapChannels.get(room) ?? [];
        existing.push(dc);
        this.bootstrapChannels.set(room, existing);

        await pc.setRemoteDescription(
            new RTCSessionDescription({ type: offer.type, sdp: offer.sdp }),
        );
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(new RTCSessionDescription(answer));

        if (!answer.type || !answer.sdp) {
            throw new Error("createAnswer returned incomplete description");
        }
        this.lastProcessedAnswer[room] = { sdp: answer.sdp, type: answer.type };
    }
}
