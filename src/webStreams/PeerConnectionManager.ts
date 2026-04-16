import { StreamHandle } from "../Types";
import { StreamRoomId } from "./types/ApiTypes";

export type SessionId = number & { _sessionId: never };
export type ConnectionType = "publisher" | "subscriber";

export interface JanusConnection {
    pc: RTCPeerConnection;
    sessionId: SessionId;
    hasSubscriptions: boolean;
    candidateQueue: RTCIceCandidate[];
}

/**
 * Lifecycle map for Janus `RTCPeerConnection` instances, keyed by room × connection type.
 *
 * ICE candidates that arrive before a Janus session ID is assigned are queued
 * and flushed automatically when `updateSessionForConnection` is called with
 * the real session ID.
 */
export class PeerConnectionManager {
    private readonly connections: {
        [roomId: string]: {
            publisher?: JanusConnection;
            subscriber?: JanusConnection;
        };
    } = {};

    constructor(
        private readonly createPeerConnection: (
            room: StreamRoomId,
            streamHandle?: StreamHandle,
        ) => RTCPeerConnection,
        private readonly onTrickle: (sessionId: SessionId, candidate: RTCIceCandidate) => void,
    ) {}

    /**
     * Creates a new `JanusConnection` for `room` / `connectionType` if one does
     * not already exist. Wires the `icecandidate` listener so that candidates are
     * either forwarded immediately (if a session ID is known) or buffered in
     * `candidateQueue` until `updateSessionForConnection` is called.
     *
     * @param sessionId  Initial session ID; use `-1` (the default) when the session
     *                   has not yet been assigned by the server.
     * @param streamHandle  Optional stream handle forwarded to the peer connection factory.
     */
    initialize(
        room: StreamRoomId,
        connectionType: ConnectionType,
        sessionId: SessionId = -1 as SessionId,
        streamHandle?: StreamHandle,
    ): void {
        if (this.hasConnection(room, connectionType)) return;

        if (!(room in this.connections)) this.connections[room] = {};

        const pc = this.createPeerConnection(room, streamHandle);
        const conn: JanusConnection = {
            sessionId,
            hasSubscriptions: false,
            pc,
            candidateQueue: [],
        };
        this.connections[room][connectionType] = conn;

        pc.addEventListener("icecandidate", (event) => {
            if (!event.candidate) return;
            const current = this.connections[room][connectionType];
            if (!current) return;
            if (current.sessionId > -1) {
                try {
                    this.onTrickle(current.sessionId, event.candidate);
                } catch (err) {
                    console.warn("Failed to trickle candidate", err);
                }
            } else {
                current.candidateQueue.push(event.candidate);
            }
        });
    }

    /**
     * Updates the Janus session ID for an existing connection and flushes any
     * ICE candidates that were queued while the session ID was still `-1`.
     * If no connection exists for the given room/type, one is created first.
     */
    updateSessionForConnection(
        room: StreamRoomId,
        connectionType: ConnectionType,
        session: SessionId,
    ): void {
        if (!this.hasConnection(room, connectionType)) {
            this.initialize(room, connectionType);
        }
        const conn = this.connections[room][connectionType]!;
        conn.sessionId = session;

        for (const candidate of conn.candidateQueue) {
            try {
                this.onTrickle(session, candidate);
            } catch (err) {
                console.warn("Failed to trickle buffered candidate", err);
            }
        }
        conn.candidateQueue = [];
    }

    /**
     * Returns `true` if a peer connection is registered for `room` / `connectionType`.
     * Note: a registered connection may be in any state including `"closed"`.
     */
    hasConnection(room: StreamRoomId, connectionType: ConnectionType): boolean {
        return !!this.connections[room]?.[connectionType]?.pc;
    }

    /**
     * Returns the `JanusConnection` for `room` / `connectionType`, creating it
     * first (with session ID `-1`) if it does not exist yet.
     */
    getConnectionWithSession(room: StreamRoomId, connectionType: ConnectionType): JanusConnection {
        if (!this.hasConnection(room, connectionType)) {
            this.initialize(room, connectionType);
        }
        return this.connections[room][connectionType]!;
    }

    /**
     * Closes the peer connection for `room` / `connectionType` (if one exists)
     * and removes it from the map. If both publisher and subscriber entries for
     * the room are now absent the outer room entry is also removed.
     */
    closePeerConnectionBySessionIfExists(room: StreamRoomId, connectionType: ConnectionType): void {
        if (this.hasConnection(room, connectionType)) {
            this.connections[room][connectionType]?.pc.close();
            delete this.connections[room][connectionType];
            if (!this.connections[room]?.publisher && !this.connections[room]?.subscriber) {
                delete this.connections[room];
            }
        }
    }
}
