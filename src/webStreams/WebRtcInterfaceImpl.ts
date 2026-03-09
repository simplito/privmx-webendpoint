/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import {
    CurrentPublishersData,
    Jsep,
    RoomModel,
    SdpWithRoomModel,
    SetAnswerAndSetRemoteDescriptionModel,
    StreamsUpdatedData,
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
        const peerConnection = this.getClient()
            .getConnectionManager()
            .getConnectionWithSession(model.roomId, "publisher").pc;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        return offer.sdp; // sdp
    }

    async createAnswerAndSetDescriptions(model: SdpWithRoomModel): Promise<string> {
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
