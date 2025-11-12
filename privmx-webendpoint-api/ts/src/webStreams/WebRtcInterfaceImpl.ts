/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { CurrentPublishersData, Jsep, RoomModel, SdpWithRoomModel, SetAnswerAndSetRemoteDescriptionModel, StreamsUpdatedData, UpdateKeysModel, WebRtcInterface } from "../service/WebRtcInterface";
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
        updateKeys: this.updateKeys
    };

    isMainThread() {
        return (typeof window !== 'undefined');
    }

    getClient(): WebRtcClient {
        if(!this.webRtcClient) {
            throw new Error("WebRtcClient not initialized. Aborting...");
        }
        return this.webRtcClient;
    }

    async methodCall(name: string, params: any): Promise<any> {
        if (this.methodsMap[name]) {
            const method = this.methodsMap[name];
            if (typeof method === 'function') {
                return this.methodsMap[name].call(this, params);
            }
        }        
        throw new Error(`Method '${name}' is not implemented.`);        
    }

    async createOfferAndSetLocalDescription(model: RoomModel) {
                // ==== CODE BELOW MOVED TO WEBRTC IMPL ===========
        // 
        // // configure client
        // const mediaTracks: MediaStreamTrack[] = [];
        // for (const value of this.streamTracks.values()) {
        //     if (value.streamId === streamId && value.track) {
        //         mediaTracks.push(value.track);
        //     }
        // }
        // const key = streamId.toString();
        // const _stream = this.streams.get(key);
        // if (!_stream) {
        //     throw new Error("No stream defined to publish");
        // }
        
        // const mediaStream = new MediaStream(mediaTracks);
        
        // // prepare peerConnection
        // const peerConnection = await this.client.createPeerConnectionWithLocalStream(mediaStream);

        // // natywna obsluga datachanneli
        // let dataChannelId = -1;
        // for (const value of this.streamTracks.values()) {
        //     if (value.streamId === streamId && value.dataChannelMeta) {
        //         const channel = peerConnection.createDataChannel(value.dataChannelMeta.name, {id: (++dataChannelId)});
        //         console.log("CREATING AND SETTING UP data channel", value, channel);
        //         this.dataChannels.set(value.id, channel);
        //     }
        // }

        // // get offer created and set during negotiation
        // console.warn("streamPublish: generate new offer on publish, but has to be implemented in conjunction with negotiationneeded event");
        // // const offer = peerConnection.currentLocalDescription?.toJSON();
        // const offer = await peerConnection.createOffer();
        // peerConnection.setLocalDescription(offer);

        // createPeerConnectionWithLocalStream powinno byc zawolane w kliencie jak ustawiamy strumien z kamery
        // const peerConnection = await this.client.createPeerConnectionWithLocalStream(mediaStream);
        console.log("[WebrtcInterfaceImpl]: createOfferAndSetLocalDescription call..");
        const peerConnection = this.getClient().getConnectionManager().getConnectionWithSession(model.roomId, "publisher").pc;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        return offer.sdp; // sdp 
    }

    async createAnswerAndSetDescriptions(model: SdpWithRoomModel): Promise<string> {
        console.log("[WebrtcInterfaceImpl]: createAnswerAndSetDescriptions call..");
        // const janusSession = this.getClient().getConnectionManager().getConnectionWithSession(model.roomId, "subscriber");
        // if (!("pc" in janusSession)) {
        //     throw new Error("WebRtcInterfaceImpl: No peerConnection available on createAnswerAndSetDescriptions");
        // }
        // const peerConnection = janusSession.pc;

        // await peerConnection.setRemoteDescription(new RTCSessionDescription({sdp: model.sdp, type: model.type as RTCSdpType}));
        // const answer = await peerConnection.createAnswer();
        // await peerConnection.setLocalDescription(answer);
        const offer: Jsep = {sdp: model.sdp, type: model.type};
        const answer = await this.getClient().onSubscriptionUpdatedSingle(model.roomId, offer);
        return answer.sdp;
    }

    async setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel) {
        console.log("[WebrtcInterfaceImpl]: setAnswerAndSetRemoteDescription call..");
        const janusSession = this.getClient().getConnectionManager().getConnectionWithSession(model.roomId, "publisher");
        if (!("pc" in janusSession)) {
            throw new Error("WebRtcInterfaceImpl: No peerConnection available on setAnswerAndSetRemoteDescription");
        }
        const peerConnection = janusSession.pc;
        await peerConnection.setRemoteDescription(new RTCSessionDescription({sdp: model.sdp, type: model.type as RTCSdpType}));
    }

    async close(roomId: StreamRoomId) {
        const subscriberSession = this.getClient().getConnectionManager().getConnectionWithSession(roomId, "subscriber");
        if (!("pc" in subscriberSession)) {
            throw new Error("WebRtcInterfaceImpl: No peerConnection available on close (subscriber)");
        }
        subscriberSession.pc.close();

        const publisherSession = this.getClient().getConnectionManager().getConnectionWithSession(roomId, "publisher");
        if (!("pc" in publisherSession)) {
            throw new Error("WebRtcInterfaceImpl: No peerConnection available on close (publisher)");
        }
        publisherSession.pc.close();
    }

    async updateKeys(model: UpdateKeysModel) {
        return this.getClient().updateKeys(model.streamRoomId, model.keys);
    }

    async updateSessionId(streamRoomId: StreamRoomId, sessionId: number, connectionType: ConnectionType): Promise<void> {
        this.getClient().getConnectionManager().updateSessionForConnection(streamRoomId, connectionType, sessionId as SessionId);
    }
}
