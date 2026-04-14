/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import {
    Jsep,
    RoomModel,
    SdpWithRoomModel,
    SetAnswerAndSetRemoteDescriptionModel,
    UpdateKeysModel,
    WebRtcInterface,
} from "../service/WebRtcInterface";
import { ConnectionType } from "./PeerConnectionsManager";
import { StreamRoomId } from "./types/ApiTypes";
import { WebRtcClient } from "./WebRtcClient";
import { SessionId } from "./WebRtcClientTypes";

export class WebRtcInterfaceImpl implements WebRtcInterface {
    constructor(private webRtcClient: WebRtcClient) {}

    private methodsMap: { [K: string]: Function } = {
        createOfferAndSetLocalDescription: this.createOfferAndSetLocalDescription,
        createAnswerAndSetDescriptions: this.createAnswerAndSetDescriptions,
        setAnswerAndSetRemoteDescription: this.setAnswerAndSetRemoteDescription,
        updateSessionId: this.updateSessionId,
        close: this.close,
        updateKeys: this.updateKeys,
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

    async methodCall(name: string, params: any): Promise<any> {
        if (this.methodsMap[name]) {
            const method = this.methodsMap[name];
            if (typeof method === "function") {
                return this.methodsMap[name].call(this, params);
            }
        }
        throw new Error(`Method '${name}' is not implemented.`);
    }

    async createOfferAndSetLocalDescription(model: RoomModel) {
        return this.getClient().createPublisherOffer(model.roomId);
    }

    async createAnswerAndSetDescriptions(model: SdpWithRoomModel): Promise<string> {
        const offer: Jsep = { sdp: model.sdp, type: model.type };
        await this.getClient().onSubscriptionUpdated(model.roomId, offer);
        return this.getClient().getLastProcessedAnswer(model.roomId).sdp;
    }

    async setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel) {
        await this.getClient().setPublisherRemoteDescription(model.roomId, model.sdp, model.type);
    }

    async close(roomId: StreamRoomId) {
        this.getClient().closeConnection(roomId, "subscriber");
        this.getClient().closeConnection(roomId, "publisher");
    }

    async updateKeys(model: UpdateKeysModel) {
        return this.getClient().updateKeys(model.streamRoomId, model.keys);
    }

    async updateSessionId(
        streamRoomId: StreamRoomId,
        sessionId: number,
        connectionType: ConnectionType,
    ): Promise<void> {
        this.getClient().updateConnectionSessionId(streamRoomId, sessionId as SessionId, connectionType);
    }

}
