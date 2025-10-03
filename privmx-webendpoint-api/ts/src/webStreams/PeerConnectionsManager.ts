import { StreamRoomId } from "./types/ApiTypes";
import { SessionId } from "./WebRtcClientTypes";

export type ConnectionType = "publisher" | "subscriber";

export class PeerConnectionManager {
    private connections: {[roomId: string]: {
        publisher?: JanusConnection,
        subscriber?: JanusConnection
    }} = {};
    constructor(private createPeerConnection: (room: StreamRoomId) => RTCPeerConnection, private onTrickle: (sessionId: SessionId, candidate: RTCIceCandidate) => void) {}

    public initialize(room: StreamRoomId, connectionType: ConnectionType, sessionId: SessionId = -1 as SessionId) {
        if (room in this.connections && connectionType in this.connections[room]) {
            // throw new Error("JanusConnection with given parameters initialized already.");
            return;
        }
        if (!(room in this.connections)) {
            this.connections[room] = {};
        }

        // create a dedicated RTCPeerConnection for this subscriber handle
        const pc = this.createPeerConnection(room);

        // when creating, make sure ice candidates for this pc are trickled to server for this session/handle
        pc.addEventListener('icecandidate', event => {
            const sessionId = this.connections[room][connectionType].sessionId;
            if (event.candidate && sessionId > -1) {
                try {
                    this.onTrickle(this.connections[room][connectionType].sessionId, event.candidate);
                } catch(err) {
                    console.warn('Failed to trickle candidate', err);
                }
            } else {
                console.warn("Failed to trickle: no candidate or sessionId not set");
            }
        });

        this.connections[room][connectionType] = {sessionId: sessionId, hasSubscriptions: false, pc};
    }

    public updateSessionForConnection(room: StreamRoomId, connectionType: ConnectionType, session: SessionId) {
        if (!(room in this.connections) || !(connectionType in this.connections[room])) {
            // throw new Error("To early call on peerConnectionManager.updateSessionForConnection().. this should be called when PC is initialized");
            this.initialize(room, connectionType);
        }
        this.connections[room][connectionType].sessionId = session;
    }

    public hasConnection(room: StreamRoomId, connectionType: ConnectionType) {
        return (room in this.connections) && (connectionType in this.connections[room]);
    }

    public getConnectionWithSession(room: StreamRoomId, connectionType: ConnectionType): JanusConnection {
        if (!(room in this.connections) || !(connectionType in this.connections[room])) {
            this.initialize(room, connectionType);
            // throw new Error("To early call on peerConnectionManager.initialize().. this should be called when sessionId is available");
        }
        return this.connections[room][connectionType];
    }
}

export interface JanusConnection {
    pc: RTCPeerConnection, sessionId: SessionId, hasSubscriptions: boolean
}