import { Jsep, StreamRoomId } from "./types/ApiTypes.js";
import { PeerConnectionManager, SessionId } from "./PeerConnectionManager.js";

interface QueueItem {
    room: StreamRoomId;
    jsep: { sdp: string; type: RTCSdpType };
}
import { E2eeTransformManager } from "./E2eeTransformManager.js";
import { RemoteStreamListenerRegistry } from "./RemoteStreamListenerRegistry.js";
import { AudioManager } from "./AudioManager.js";
import { Queue } from "./Queue.js";
import { Logger } from "./Logger.js";

/**
 * Manages the subscriber-side peer connection for a stream room:
 * SDP offer/answer negotiation, the reconfigure queue, and remote track wiring.
 * @internal
 */
export class SubscriberManager {
    private readonly reconfigureQueue: Queue<QueueItem>;
    private readonly lastProcessedAnswer: { [roomId: string]: Jsep } = {};
    private readonly bootstrapChannels: Map<StreamRoomId, RTCDataChannel[]> = new Map();
    // Streams whose remote track the media server took away while they were still
    // subscribed - which is what a republication looks like from here.
    private readonly staleStreams: Map<StreamRoomId, Set<number>> = new Map();
    // Removals we asked for ourselves, so the track going away is expected. Held
    // until the Stream delivers again rather than consumed by the first
    // `removetrack`: one unsubscribe takes away every track of the Stream, and
    // the events can arrive long after the call which asked for them returned.
    private readonly expectedRemovals: Map<StreamRoomId, Set<number>> = new Map();
    // Remote streams whose `removetrack` is already watched, so the audio and
    // the video of one publisher - which share a MediaStream - do not install
    // the listener twice over.
    private readonly watchedStreams = new WeakSet<MediaStream>();
    private readonly logger = new Logger();

    constructor(
        private readonly pcm: PeerConnectionManager,
        private readonly e2eeTransformManager: E2eeTransformManager,
        private readonly listenerRegistry: RemoteStreamListenerRegistry,
        private readonly audioManager: AudioManager,
    ) {
        this.reconfigureQueue = new Queue<QueueItem>();
        this.reconfigureQueue.assignProcessorFunc(async (item) => {
            await this.reconfigureSingle(item.room, item.jsep);
        });
    }

    /**
     * Initialises the subscriber `RTCPeerConnection` for `roomId` so it is
     * ready to receive incoming SDP offers from the server.
     */
    initialize(roomId: StreamRoomId): void {
        this.pcm.initialize(roomId, "subscriber");
    }

    /**
     * Enqueues a new SDP offer from the server and serially processes the
     * queue, ensuring reconfigures are never interleaved.
     */
    async onSubscriptionUpdated(room: StreamRoomId, offer: Jsep): Promise<void> {
        this.reconfigureQueue.enqueue({ room, jsep: offer });
        await this.reconfigureQueue.processAll();
    }

    /**
     * Returns the last SDP answer produced for `room` during reconfiguration.
     * Used by `WebRtcInterfaceImpl` to reply to the server's accept-offer call.
     * @throws if no answer has been produced for the given room yet.
     */
    getLastProcessedAnswer(room: StreamRoomId): Jsep {
        const answer = this.lastProcessedAnswer[room];
        if (!answer) throw new Error(`No processed answer for room: ${room}`);
        return answer;
    }

    /**
     * Wires a newly arrived remote track into the E2EE receiver pipeline and
     * notifies registered `RemoteStreamListener` callbacks. Waits for ICE to
     * reach connected/completed state before installing the transform to avoid
     * a race between the transform pipeline and DTLS negotiation.
     */
    async onRemoteTrack(roomId: StreamRoomId, event: RTCTrackEvent): Promise<void> {
        const receiver = event.receiver;
        const stream = event.streams[0];
        const publisherId = Number(stream.id);
        const pc = this.pcm.getOrCreateConnection(roomId, "subscriber").pc;

        // A track arriving says this Stream delivers again: an unsubscribe we
        // were still waiting on is over, and a stale mark left by an earlier
        // publication no longer holds. A `removetrack` of the old track arriving
        // after the new one would still mark the Stream stale; that costs the
        // application one subscription made anew, not media lost in silence.
        this.expectedRemovals.get(roomId)?.delete(publisherId);
        this.staleStreams.get(roomId)?.delete(publisherId);

        this.logger.debug("waitUntilConnected...");
        await this.waitUntilConnected(pc);

        this.logger.debug("setupReceiverTransform...");
        await this.e2eeTransformManager.setupReceiverTransform(receiver);
        if (event.track.kind === "audio") {
            this.audioManager.watchRemoteReceiver(publisherId, receiver);
        }
        event.track.addEventListener("ended", () => {
            this.e2eeTransformManager.teardownReceiver(receiver).catch((e) => {
                this.logger.error("teardownReceiver failed:", e);
            });
            if (event.track.kind === "audio") {
                this.audioManager.unwatchRemoteReceiver(publisherId);
            }
        });

        // The media server stops feeding a subscribed Stream by taking its track
        // away - the browser reports that as `removetrack` (the track itself is
        // only muted, and never ends). It is the one local sign that the
        // subscriptions held for that Stream went stale.
        //
        // Unsubscribing removes the track just the same, so removals we asked
        // for are announced through `expectStreamRemoval` and skipped here - the
        // announcement is read, not consumed, because one `removetrack` reaches
        // every listener installed on the Stream.
        if (stream && !this.watchedStreams.has(stream)) {
            this.watchedStreams.add(stream);
            stream.addEventListener("removetrack", () => {
                if (this.expectedRemovals.get(roomId)?.has(publisherId)) {
                    this.logger.debug("remote track removed as asked:", publisherId);
                    return;
                }
                this.logger.debug("remote track taken away, marking stream stale:", publisherId);
                const stale = this.staleStreams.get(roomId) ?? new Set<number>();
                stale.add(publisherId);
                this.staleStreams.set(roomId, stale);
            });
        }

        this.listenerRegistry.dispatchTrack(roomId, event);
    }

    /**
     * IDs of the Streams in `roomId` which were taken away while subscribed, so
     * their subscriptions no longer deliver anything and have to be made anew.
     */
    getStaleStreams(roomId: StreamRoomId): ReadonlySet<number> {
        return this.staleStreams.get(roomId) ?? new Set<number>();
    }

    /** Forgets one Stream of `roomId` once its subscription was redone or dropped. */
    forgetStaleStream(roomId: StreamRoomId, streamId: number): void {
        this.staleStreams.get(roomId)?.delete(streamId);
    }

    /**
     * Announces that `streamId` is being unsubscribed, so the remote track going
     * away is not mistaken for the media server taking it from us. Stands until
     * the Stream delivers again or {@link forgetExpectedRemoval} takes it back.
     */
    expectStreamRemoval(roomId: StreamRoomId, streamId: number): void {
        const expected = this.expectedRemovals.get(roomId) ?? new Set<number>();
        expected.add(streamId);
        this.expectedRemovals.set(roomId, expected);
    }

    /**
     * Takes back an announcement made with {@link expectStreamRemoval}: the
     * unsubscribe it was made for never happened, so `streamId` is still
     * subscribed and its track going away is the media server taking it from us.
     */
    forgetExpectedRemoval(roomId: StreamRoomId, streamId: number): void {
        this.expectedRemovals.get(roomId)?.delete(streamId);
    }

    /** Forgets every stale Stream of `roomId` (the subscriber stream was rebuilt). */
    clearStaleStreams(roomId: StreamRoomId): void {
        this.staleStreams.delete(roomId);
        this.expectedRemovals.delete(roomId);
    }

    /**
     * Updates the Janus session ID for the subscriber connection in `roomId`
     * and flushes any ICE candidates that were queued before the session was assigned.
     */
    updateSessionId(roomId: StreamRoomId, sessionId: SessionId): void {
        this.pcm.updateSessionForConnection(roomId, "subscriber", sessionId);
    }

    /**
     * Closes the subscriber peer connection for `roomId`, removes the cached
     * SDP answer, and closes all bootstrap data channels for that room.
     */
    close(roomId: StreamRoomId): void {
        this.pcm.closePeerConnectionBySessionIfExists(roomId, "subscriber");
        delete this.lastProcessedAnswer[roomId];
        this.closeBootstrapChannels(roomId);
        this.staleStreams.delete(roomId);
        this.expectedRemovals.delete(roomId);
    }

    private closeBootstrapChannels(roomId: StreamRoomId): void {
        const channels = this.bootstrapChannels.get(roomId);
        if (channels) {
            for (const dc of channels) {
                try {
                    dc.close();
                } catch {
                    /* ignore */
                }
            }
            this.bootstrapChannels.delete(roomId);
        }
    }

    private waitUntilConnected(pc: RTCPeerConnection): Promise<void> {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            return Promise.resolve();
        }
        if (
            pc.iceConnectionState === "failed" ||
            pc.connectionState === "failed" ||
            pc.connectionState === "closed"
        ) {
            return Promise.reject(new Error("ICE/DTLS not connected"));
        }
        return new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                pc.removeEventListener("iceconnectionstatechange", onChange);
                pc.removeEventListener("connectionstatechange", onChange);
            };
            const onChange = () => {
                if (
                    pc.iceConnectionState === "connected" ||
                    pc.iceConnectionState === "completed"
                ) {
                    cleanup();
                    resolve();
                } else if (
                    pc.iceConnectionState === "failed" ||
                    pc.connectionState === "failed" ||
                    pc.connectionState === "closed"
                ) {
                    cleanup();
                    reject(new Error("ICE/DTLS not connected"));
                }
            };
            pc.addEventListener("iceconnectionstatechange", onChange);
            pc.addEventListener("connectionstatechange", onChange);
        });
    }

    private async reconfigureSingle(room: StreamRoomId, offer: Jsep): Promise<void> {
        const pc = this.pcm.getOrCreateConnection(room, "subscriber").pc;

        // Bootstrap channel on every reconfigure so Janus sees the data-channel m= line each exchange.
        const dc = pc.createDataChannel("JanusDataChannel");
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
