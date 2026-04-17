/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import {
    RoomModel,
    SdpWithRoomModel,
    SetAnswerAndSetRemoteDescriptionModel,
    UpdateKeysModel,
    WebRtcInterface,
    WebRtcMethodCall,
} from "./WebRtcInterface";
import { ConnectionType } from "./PeerConnectionsManager";
import { Jsep, StreamRoomId } from "./types/ApiTypes";
import { WebRtcClient } from "./WebRtcClient";
import { SessionId } from "./WebRtcClientTypes";

type MethodMap = {
    [K in WebRtcMethodCall["name"]]: (
        params: Extract<WebRtcMethodCall, { name: K }>["params"],
    ) => Promise<unknown>;
};

export class WebRtcInterfaceImpl implements WebRtcInterface {
    constructor(private webRtcClient: WebRtcClient) {}

    private methodsMap: MethodMap = {
        createOfferAndSetLocalDescription: this.createOfferAndSetLocalDescription.bind(this),
        createAnswerAndSetDescriptions: this.createAnswerAndSetDescriptions.bind(this),
        setAnswerAndSetRemoteDescription: this.setAnswerAndSetRemoteDescription.bind(this),
        updateSessionId: (params) =>
            this.updateSessionId(params.streamRoomId, params.sessionId, params.connectionType),
        close: this.close.bind(this),
        updateKeys: this.updateKeys.bind(this),
    };

    isMainThread() {
        return typeof window !== "undefined";
    }

    getClient(): WebRtcClient {
        if (!this.webRtcClient) {
            throw new Error("WebRtcClient not initialized. Aborting...");
        }
        return this.webRtcClient;
    }

    async methodCall(name: string, params: unknown): Promise<unknown> {
        const method = this.methodsMap[name as WebRtcMethodCall["name"]];
        if (typeof method === "function") {
            return method(params as never);
        }
        throw new Error(`Method '${name}' is not implemented.`);
    }

    async createOfferAndSetLocalDescription(model: RoomModel) {
        const peerConnection = this.getClient()
            .getConnectionManager()
            .getConnectionWithSession(model.roomId, "publisher").pc;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        return offer.sdp; // sdp
    }

    async createAnswerAndSetDescriptions(model: SdpWithRoomModel): Promise<string> {
        const offer: Jsep = { sdp: model.sdp, type: model.type };
        await this.getClient().onSubscriptionUpdated(model.roomId, offer);
        return this.webRtcClient.lastProcessedAnswer[model.roomId].sdp;
    }

    async setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel) {
        const janusSession = this.getClient()
            .getConnectionManager()
            .getConnectionWithSession(model.roomId, "publisher");
        if (!("pc" in janusSession)) {
            throw new Error(
                "WebRtcInterfaceImpl: No peerConnection available on setAnswerAndSetRemoteDescription",
            );
        }
        const peerConnection = janusSession.pc;
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription({ sdp: model.sdp, type: model.type as RTCSdpType }),
        );
    }

    async close(roomId: StreamRoomId) {
        this.getClient()
            .getConnectionManager()
            .closePeerConnectionBySessionIfExists(roomId, "subscriber");
        this.getClient()
            .getConnectionManager()
            .closePeerConnectionBySessionIfExists(roomId, "publisher");
    }

    async updateKeys(model: UpdateKeysModel) {
        return this.getClient().updateKeys(model.streamRoomId, model.keys);
    }

    async updateSessionId(
        streamRoomId: StreamRoomId,
        sessionId: number,
        connectionType: ConnectionType,
    ): Promise<void> {
        this.getClient()
            .getConnectionManager()
            .updateSessionForConnection(streamRoomId, connectionType, sessionId as SessionId);
    }
}
