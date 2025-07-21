/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { SetAnswerAndSetRemoteDescriptionModel, UpdateKeysModel, WebRtcInterface } from "../service/WebRtcInterface";
import { WebRtcClient } from "./WebRtcClient";

interface SdpModel {
  sdp: string; 
  type: string;
}

export class WebRtcInterfaceImpl implements WebRtcInterface {
    constructor(private webRtcClient: WebRtcClient) {}

    private methodsMap: { [K: string]: Function } = {
        createOfferAndSetLocalDescription: this.createOfferAndSetLocalDescription,
        createAnswerAndSetDescriptions: this.createAnswerAndSetDescriptions,
        setAnswerAndSetRemoteDescription: this.setAnswerAndSetRemoteDescription,
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

    async createOfferAndSetLocalDescription() {
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
        const peerConnection = this.getClient().getActivePeerConnection();
        const offer = await peerConnection.createOffer();
        peerConnection.setLocalDescription(offer);
        return offer.sdp; // sdp 
    }

    async createAnswerAndSetDescriptions(model: SdpModel): Promise<string> {
        const peerConnection = this.getClient().getActivePeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription({sdp: model.sdp, type: model.type as RTCSdpType}));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        return answer.sdp;
    }

    async setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel) {  
        const peerConnection = this.getClient().getActivePeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription({sdp: model.sdp, type: model.type as RTCSdpType}));
    }

    async close() {
        const peerConnection = this.getClient().getActivePeerConnection();
        peerConnection.close();
    }

    async updateKeys(model: UpdateKeysModel) {
        try {
            return this.getClient().updateKeys(model.keys);
        } catch(e) {
            console.warn("error on update keys", e);
        }
    }
}
