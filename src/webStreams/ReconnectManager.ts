import { StreamRoomConnectionState } from "../Types.js";
import {
    ConnectionType,
    JanusConnection,
    PeerConnectionManager,
    SessionId,
} from "./PeerConnectionManager.js";
import { Jsep, StreamRoomId } from "./types/ApiTypes.js";
import { Logger } from "./Logger.js";

/**
 * Signalling calls `StreamApiLow` exposes for renegotiating a broken transport.
 * @internal
 */
export interface ReconnectSignalling {
    setNewOfferOnReconfigure(sessionId: SessionId, jsep: Jsep): Promise<void>;
    restartSubscriberIce(streamRoomId: StreamRoomId): Promise<void>;
}

/** `disconnected` very often recovers on its own - wait this long before acting. */
const GRACE_MS = 2000;
/** ICE restarts tried per connection before the room is reported as lost. */
const MAX_ATTEMPTS = 3;

interface Recovery {
    attempts: number;
    timer?: ReturnType<typeof setTimeout>;
    lost: boolean;
}

/**
 * Recovers peer connections whose transport died (device moved from Wi-Fi to
 * LTE, woke from the background, …). `StreamApiLow` does not own the
 * `RTCPeerConnection`s, so it cannot see ICE fail and never restarts anything
 * by itself - detection and policy live here.
 *
 * Both connections of a room are watched: a participant who only watches never
 * publishes, so the publisher connection alone would leave them with a frozen
 * picture and no signal at all.
 *
 * A publisher is restarted by offering (`restartIce` → `createOffer` →
 * `setNewOfferOnReconfigure`, whose answer the library applies through
 * `setAnswerAndSetRemoteDescription`); a subscriber is restarted by asking
 * (`restartSubscriberIce`), because the media server owns its offer.
 * @internal
 */
export class ReconnectManager {
    private readonly recoveries = new Map<string, Recovery>();
    private readonly roomStates = new Map<StreamRoomId, StreamRoomConnectionState>();
    private readonly listeners = new Map<
        StreamRoomId,
        (state: StreamRoomConnectionState) => void
    >();
    private readonly rawListeners = new Map<string, (state: RTCPeerConnectionState) => void>();
    private readonly logger = new Logger();

    constructor(
        private readonly pcm: PeerConnectionManager,
        private readonly signalling: ReconnectSignalling,
    ) {}

    /** Registers the single state listener for `room`, replacing any previous one. */
    setListener(room: StreamRoomId, listener: (state: StreamRoomConnectionState) => void): void {
        this.listeners.set(room, listener);
    }

    /** Drops the listener and all recovery state for `room` (on leaving it). */
    clearListener(room: StreamRoomId): void {
        this.listeners.delete(room);
        this.roomStates.delete(room);
        for (const connectionType of ["publisher", "subscriber"] as const) {
            this.clearRecovery(room, connectionType);
            this.rawListeners.delete(this.key(room, connectionType));
        }
    }

    /**
     * Stops every pending recovery and drops all listeners - otherwise a timer
     * armed before the connection died would fire afterwards and signal on a
     * freed native pointer, forever.
     */
    destroy(): void {
        for (const recovery of this.recoveries.values()) {
            if (recovery.timer) clearTimeout(recovery.timer);
        }
        this.recoveries.clear();
        this.roomStates.clear();
        this.listeners.clear();
        this.rawListeners.clear();
    }

    /**
     * Registers a listener for the raw `RTCPeerConnection` state of one of
     * `room`'s connections, replacing any previous one. Unlike the coarse room
     * state this reports every transition, including `connecting` and `closed`.
     */
    setRawStateListener(
        room: StreamRoomId,
        connectionType: ConnectionType,
        listener: (state: RTCPeerConnectionState) => void,
    ): void {
        this.rawListeners.set(this.key(room, connectionType), listener);
    }

    /** Drops the raw state listener for `room` / `connectionType`. */
    clearRawStateListener(room: StreamRoomId, connectionType: ConnectionType): void {
        this.rawListeners.delete(this.key(room, connectionType));
    }

    /**
     * Fed by every `connectionstatechange` of a room's peer connections (and by
     * an explicit `"closed"` when we close one ourselves, since most stacks
     * deliver no event after the observer is deregistered).
     */
    onConnectionState(
        room: StreamRoomId,
        connectionType: ConnectionType,
        state: RTCPeerConnectionState,
    ): void {
        const rawListener = this.rawListeners.get(this.key(room, connectionType));
        if (rawListener) {
            try {
                rawListener(state);
            } catch (e) {
                this.logger.error("Connection state listener threw:", e);
            }
        }

        switch (state) {
            case "connected":
            case "closed":
                this.clearRecovery(room, connectionType);
                this.publish(room);
                break;
            case "disconnected":
                this.schedule(room, connectionType, GRACE_MS);
                break;
            case "failed":
                this.schedule(room, connectionType, 0);
                break;
            default:
                break;
        }
    }

    private schedule(room: StreamRoomId, connectionType: ConnectionType, delay: number): void {
        const key = this.key(room, connectionType);
        const recovery = this.recoveries.get(key) ?? { attempts: 0, lost: false };
        if (recovery.timer || recovery.lost) return;

        recovery.timer = setTimeout(() => {
            this.attempt(room, connectionType).catch((e) => {
                this.logger.error("ICE restart attempt threw:", e);
            });
        }, delay);
        this.recoveries.set(key, recovery);
        this.publish(room);
    }

    private async attempt(room: StreamRoomId, connectionType: ConnectionType): Promise<void> {
        const key = this.key(room, connectionType);
        const recovery = this.recoveries.get(key);
        if (!recovery) return;
        recovery.timer = undefined;

        const conn = this.pcm.getConnection(room, connectionType);
        // A closed (or torn down) connection is not a restartable one - renegotiating
        // a freshly created, trackless connection would just report a false success.
        if (!conn || conn.pc.connectionState === "closed") {
            this.clearRecovery(room, connectionType);
            this.publish(room);
            return;
        }
        if (conn.pc.connectionState === "connected") {
            this.clearRecovery(room, connectionType);
            this.publish(room);
            return;
        }
        // Nothing to renegotiate over while the whole device is offline; wait
        // without burning an attempt.
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            this.schedule(room, connectionType, GRACE_MS);
            return;
        }
        if (recovery.attempts >= MAX_ATTEMPTS) {
            recovery.lost = true;
            this.publish(room);
            return;
        }

        recovery.attempts++;
        // ponytail: TURN credentials are fetched once per publish/subscribe and
        // expire, so a restart after a long spell in the background has no relay
        // and burns all its attempts before reporting `lost` (the application
        // then rebuilds, which refetches them). Refresh them here - rebuild the
        // full config in PeerConnectionFactory and setConfiguration() before the
        // restart - if that wait turns out to matter.
        try {
            if (connectionType === "publisher") {
                await this.restartPublisher(room, conn);
            } else {
                await this.signalling.restartSubscriberIce(room);
            }
        } catch (e) {
            this.logger.error(`ICE restart failed (${connectionType}) in room ${room}:`, e);
        }
        // Re-armed either way: a restart can also "succeed" without the media
        // coming back. A `connected` state cancels this timer.
        this.schedule(room, connectionType, GRACE_MS);
    }

    private async restartPublisher(room: StreamRoomId, conn: JanusConnection): Promise<void> {
        if (conn.sessionId < 0) {
            throw new Error(`No publisher session id yet for room ${room}`);
        }
        conn.pc.restartIce();
        const offer = await conn.pc.createOffer();
        await conn.pc.setLocalDescription(offer);
        if (!offer.sdp) throw new Error("createOffer returned no SDP");
        await this.signalling.setNewOfferOnReconfigure(conn.sessionId, {
            sdp: offer.sdp,
            type: "offer",
        });
    }

    private clearRecovery(room: StreamRoomId, connectionType: ConnectionType): void {
        const key = this.key(room, connectionType);
        const recovery = this.recoveries.get(key);
        if (!recovery) return;
        if (recovery.timer) clearTimeout(recovery.timer);
        this.recoveries.delete(key);
    }

    /** Emits the room's coarse state (connected / reconnecting / lost) when it changes. */
    private publish(room: StreamRoomId): void {
        let state: StreamRoomConnectionState = "connected";
        for (const connectionType of ["publisher", "subscriber"] as const) {
            const recovery = this.recoveries.get(this.key(room, connectionType));
            if (!recovery) continue;
            if (recovery.lost) {
                state = "lost";
                break;
            }
            state = "reconnecting";
        }

        if (this.roomStates.get(room) === state) return;
        this.roomStates.set(room, state);

        const listener = this.listeners.get(room);
        if (!listener) return;
        try {
            listener(state);
        } catch (e) {
            this.logger.error("Stream room connection state listener threw:", e);
        }
    }

    private key(room: StreamRoomId, connectionType: ConnectionType): string {
        return `${room}|${connectionType}`;
    }
}
