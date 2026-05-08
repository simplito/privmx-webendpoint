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
import { ConnectionType, SessionId } from "./PeerConnectionManager";
import { Jsep, StreamRoomId } from "./types/ApiTypes";
import { WebRtcClient } from "./WebRtcClient";

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

    async methodCall(name: string, params: unknown): Promise<unknown> {
        const method = this.methodsMap[name as WebRtcMethodCall["name"]];
        if (typeof method === "function") {
            return method(params as never);
        }
        throw new Error(`Method '${name}' is not implemented.`);
    }

    async createOfferAndSetLocalDescription(model: RoomModel) {
        return this.webRtcClient.createPublisherOffer(model.roomId);
    }

    async createAnswerAndSetDescriptions(model: SdpWithRoomModel): Promise<string> {
        const offer: Jsep = { sdp: model.sdp, type: model.type };
        await this.webRtcClient.onSubscriptionUpdated(model.roomId, offer);
        return this.webRtcClient.getLastProcessedAnswer(model.roomId).sdp;
    }

    async setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel) {
        await this.webRtcClient.setPublisherRemoteDescription(model.roomId, model.sdp, model.type);
    }

    async close(roomId: StreamRoomId) {
        this.webRtcClient.closeConnection(roomId, "subscriber");
        this.webRtcClient.closeConnection(roomId, "publisher");
    }

    async updateKeys(model: UpdateKeysModel) {
        return this.webRtcClient.updateKeys(model.streamRoomId, model.keys);
    }

    async updateSessionId(
        streamRoomId: StreamRoomId,
        sessionId: number,
        connectionType: ConnectionType,
    ): Promise<void> {
        this.webRtcClient.updateConnectionSessionId(
            streamRoomId,
            sessionId as SessionId,
            connectionType,
        );
    }
}
