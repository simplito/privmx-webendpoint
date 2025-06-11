import { AppRequest } from "./BaseServerTypes"
import { JanusPluginHandle, SessionId } from "./MediaServerWebSocketApiTypes";

export interface AcceptOfferRequest extends AppRequest {
    kind: "signaling.acceptOffer"
    data: {
        session_id: SessionId;
        handle: JanusPluginHandle;
        answer: any;
    }
}

export interface CreateSessionRequest extends AppRequest {
    kind: "signaling.createSession"
}