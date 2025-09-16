import { VideoRoomId } from "./types/MediaServerWebSocketApiTypes";
import { SessionId } from "./WebRtcClientTypes";

export type ConnectionType = "publisher" | "subscriber";

export class PeerConnectionManager {
    private connections: {[roomId: string]: {
        publisher?: JanusConnection | JanusConnectionInit,
        subscriber?: JanusConnection | JanusConnectionInit
    }} = {};
    constructor(private createPeerConnection: () => RTCPeerConnection, private onTrickle: (sessionId: SessionId, candidate: RTCIceCandidate) => void) {}

    public initialize(room: VideoRoomId, connectionType: ConnectionType, sessionId: SessionId) {
        if (room in this.connections && connectionType in this.connections[room]) {
            throw new Error("JanusConnection with given parameters initialized already.");
        }
        this.connections[room][connectionType] = {sessionId: sessionId, hasSubscriptions: false} as JanusConnectionInit;
    }

    public hasConnection(room: VideoRoomId, connectionType: ConnectionType) {
        return (room in this.connections) && (connectionType in this.connections[room]);
    }

    public getConnectionWithSession(room: VideoRoomId, connectionType: ConnectionType): JanusConnection | JanusConnectionInit {
        if (!(room in this.connections) || !(connectionType in this.connections[room])) {
            throw new Error("JanusConnection should exist at least as JanusConnectionInit. Call streamsApi.joinRoom() or publish() before.");
        }

        const currentState = this.connections[room];
        if (currentState[connectionType] && "pc" in currentState[connectionType]) {
            console.log("important-only", "--> there is PC for room. Skipping creation..");
            return currentState[connectionType];
        }
        
        // create a dedicated RTCPeerConnection for this subscriber handle
        const pc = this.createPeerConnection();

        // when creating, make sure ice candidates for this pc are trickled to server for this session/handle
        pc.addEventListener('icecandidate', event => {
            if (event.candidate) {
                try {
                    this.onTrickle(currentState[connectionType].sessionId, event.candidate);
                } catch(err) {
                    console.warn('Failed to trickle candidate', err);
                }
            }
        });

        // store mapping
        (this.connections[room][connectionType] as JanusConnection).pc = pc;
        return this.connections[room][connectionType];
    }

}

export interface JanusConnectionInit {
    sessionId: SessionId, hasSubscriptions: boolean
}
export interface JanusConnection extends JanusConnectionInit {
    pc: RTCPeerConnection
}