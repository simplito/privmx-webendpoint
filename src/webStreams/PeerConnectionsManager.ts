import { StreamHandle } from "../Types";
import { StreamRoomId } from "./types/ApiTypes";
import { SessionId } from "./WebRtcClientTypes";

export type ConnectionType = "publisher" | "subscriber";

export interface JanusConnection {
    pc: RTCPeerConnection;
    sessionId: SessionId;
    hasSubscriptions: boolean;
    candidateQueue: RTCIceCandidate[];
}

export class PeerConnectionManager {
    private connections: {
        [roomId: string]: {
            publisher?: JanusConnection;
            subscriber?: JanusConnection;
        };
    } = {};

    constructor(
        private createPeerConnection: (room: StreamRoomId, streamHandle?: StreamHandle) => RTCPeerConnection,
        private onTrickle: (sessionId: SessionId, candidate: RTCIceCandidate) => void,
    ) {}

    public initialize(
        room: StreamRoomId,
        connectionType: ConnectionType,
        sessionId: SessionId = -1 as SessionId,
        streamHandle?: StreamHandle,
    ) {
        // Prevent re-initialization if it already exists
        if (
            room in this.connections &&
            connectionType in this.connections[room] &&
            this.connections[room][connectionType]?.pc
        ) {
            return;
        }

        if (!(room in this.connections)) {
            this.connections[room] = {};
        }

        // Create the RTCPeerConnection
        const pc = this.createPeerConnection(room, streamHandle);

        // Prepare the connection object immediately so we can access the queue in the listener
        const newConnection: JanusConnection = {
            sessionId: sessionId,
            hasSubscriptions: false,
            pc,
            candidateQueue: [],
        };

        // Assign immediately so the listener has access to the reference
        this.connections[room][connectionType] = newConnection;

        pc.addEventListener("icecandidate", (event) => {
            if (!event.candidate) {
                return;
            }

            const conn = this.connections[room][connectionType];
            if (!conn) return;

            const currentSessionId = conn.sessionId;
            if (currentSessionId && currentSessionId > -1) {
                try {
                    this.onTrickle(currentSessionId, event.candidate);
                } catch (err) {
                    console.warn("Failed to trickle candidate", err);
                }
            } else {
                conn.candidateQueue.push(event.candidate);
            }
        });
    }

    public updateSessionForConnection(
        room: StreamRoomId,
        connectionType: ConnectionType,
        session: SessionId,
    ) {
        if (!(room in this.connections) || !(connectionType in this.connections[room])) {
            this.initialize(room, connectionType);
        }
        const conn = this.connections[room][connectionType];
        conn!.sessionId = session;

        if (conn!.candidateQueue.length > 0) {
            conn!.candidateQueue.forEach((candidate) => {
                try {
                    this.onTrickle(session, candidate);
                } catch (err) {
                    console.warn("Failed to trickle buffered candidate", err);
                }
            });
            conn!.candidateQueue = [];
        }
    }

    public hasConnection(room: StreamRoomId, connectionType: ConnectionType) {
        return !!(this.connections[room] && this.connections[room][connectionType]);
    }

    public getConnectionWithSession(
        room: StreamRoomId,
        connectionType: ConnectionType,
    ): JanusConnection {
        if (!this.hasConnection(room, connectionType)) {
            this.initialize(room, connectionType);
        }
        return this.connections[room][connectionType]!;
    }

    public closePeerConnectionBySessionIfExists(
        room: StreamRoomId,
        connectionType: ConnectionType,
    ): void {
        if (this.hasConnection(room, connectionType)) {
            const conn = this.connections[room][connectionType];
            if (conn?.pc) {
                conn.pc.close();
            }
            // Optional: Clean up the reference to allow garbage collection
            delete this.connections[room][connectionType];
        }
    }
}
