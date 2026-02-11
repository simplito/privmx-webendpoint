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
        private createPeerConnection: (room: StreamRoomId) => RTCPeerConnection,
        private onTrickle: (sessionId: SessionId, candidate: RTCIceCandidate) => void,
    ) {}

    public initialize(
        room: StreamRoomId,
        connectionType: ConnectionType,
        sessionId: SessionId = -1 as SessionId,
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
        const pc = this.createPeerConnection(room);

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
            // 1. Handle "End of Gathering" (null candidate) gracefully
            if (!event.candidate) {
                // console.debug("ICE Gathering Complete");
                return;
            }

            const conn = this.connections[room][connectionType];

            // Safety check in case connection was closed/removed during gathering
            if (!conn) return;

            const currentSessionId = conn.sessionId;

            // 2. If Session is ready, trickle immediately
            if (currentSessionId && currentSessionId > -1) {
                try {
                    this.onTrickle(currentSessionId, event.candidate);
                } catch (err) {
                    console.warn("Failed to trickle candidate", err);
                }
            } else {
                // 3. If Session NOT ready, buffer the candidate
                // console.log("Buffering ICE candidate (SessionId not ready)...");
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
            // Initialize with default (-1) if missing
            this.initialize(room, connectionType);
        }

        const conn = this.connections[room][connectionType];

        // 1. Update the Session ID
        conn!.sessionId = session;

        if (conn!.candidateQueue.length > 0) {
            conn!.candidateQueue.forEach((candidate) => {
                try {
                    this.onTrickle(session, candidate);
                } catch (err) {
                    console.warn("Failed to trickle buffered candidate", err);
                }
            });
            // Clear the queue to free memory and prevent re-sending
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
