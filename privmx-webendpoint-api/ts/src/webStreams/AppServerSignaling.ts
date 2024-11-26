import { AppServerChannel } from "./AppServerChannel";
import {SignalingApi as ServerSignalingApi} from "../ServerTypes";
import { MediaServerApiTypes } from "../ServerTypes";
import { JanusPluginHandle, SessionId } from "appServer/mediaServer/MediaServerWebSocketApiTypes";

export class SignalingApi {
    constructor(public serverChannel: AppServerChannel) {}

    public async acceptOffer(session_id: SessionId, handle: JanusPluginHandle, answer: any, hasDataChannels?: boolean): Promise<void> {
        return this.serverChannel.call<ServerSignalingApi.AcceptOfferRequest, void>({kind: "signaling.acceptOffer", data: {session_id, handle, answer}});
    }

    public async createSession(): Promise<MediaServerApiTypes.SessionId> {
        return this.serverChannel.call<ServerSignalingApi.CreateSessionRequest, MediaServerApiTypes.SessionId>({kind: "signaling.createSession"});
    }
}
