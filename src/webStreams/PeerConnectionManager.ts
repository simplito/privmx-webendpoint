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

    hasConnection(room: StreamRoomId, connectionType: ConnectionType): boolean {
        return !!this.connections[room]?.[connectionType]?.pc;
    }

    getConnectionWithSession(room: StreamRoomId, connectionType: ConnectionType): JanusConnection {
        if (!this.hasConnection(room, connectionType)) {
            this.initialize(room, connectionType);
        }
        return this.connections[room][connectionType]!;
    }

    closePeerConnectionBySessionIfExists(room: StreamRoomId, connectionType: ConnectionType): void {
        if (this.hasConnection(room, connectionType)) {
            this.connections[room][connectionType]?.pc.close();
            delete this.connections[room][connectionType];
        }
    }
}
