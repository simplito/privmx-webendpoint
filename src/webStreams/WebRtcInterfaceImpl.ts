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
} from "../service/WebRtcInterface";
import { ConnectionType } from "./PeerConnectionsManager";
import { Jsep, StreamRoomId } from "./types/ApiTypes";
import { WebRtcClient } from "./WebRtcClient";
import { SessionId } from "./WebRtcClientTypes";

type MethodMap = {
    createOfferAndSetLocalDescription: (model: RoomModel) => Promise<string>;
    createAnswerAndSetDescriptions: (model: SdpWithRoomModel) => Promise<string>;
    setAnswerAndSetRemoteDescription: (
        model: SetAnswerAndSetRemoteDescriptionModel,
    ) => Promise<void>;
    updateSessionId: (
        streamRoomId: StreamRoomId,
        sessionId: number,
        connectionType: ConnectionType,
    ) => Promise<void>;
    close: (roomId: StreamRoomId) => Promise<void>;
    updateKeys: (model: UpdateKeysModel) => Promise<void>;
};

export class WebRtcInterfaceImpl implements WebRtcInterface {
    constructor(private webRtcClient: WebRtcClient) {}

    private methodsMap: MethodMap = {
        createOfferAndSetLocalDescription: this.createOfferAndSetLocalDescription.bind(this),
        createAnswerAndSetDescriptions: this.createAnswerAndSetDescriptions.bind(this),
        setAnswerAndSetRemoteDescription: this.setAnswerAndSetRemoteDescription.bind(this),
        updateSessionId: this.updateSessionId.bind(this),
        close: this.close.bind(this),
        updateKeys: this.updateKeys.bind(this),
    };

    isMainThread() {
        return typeof window !== "undefined";
    }

    async methodCall(name: string, params: unknown): Promise<unknown> {
        const method = this.methodsMap[name as keyof MethodMap];
        if (typeof method === "function") {
            return (method as (p: unknown) => Promise<unknown>)(params);
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
