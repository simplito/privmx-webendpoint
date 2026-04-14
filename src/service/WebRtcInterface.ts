import { Key } from "../Types";
import { ConnectionType } from "../webStreams/PeerConnectionsManager";
import { StreamRoomId } from "../webStreams/types/ApiTypes";

export class UpdateKeysModel {
    streamRoomId: StreamRoomId;
    keys: Key[];
}

export interface Jsep {
    sdp: string;
    type: RTCSdpType;
}
export interface SdpWithRoomModel extends Jsep {
    roomId: StreamRoomId;
}

export interface RoomModel {
    roomId: StreamRoomId;
}

export type CreateAnswerAndSetDescriptionsModel = SdpWithRoomModel;
export type SetAnswerAndSetRemoteDescriptionModel = SdpWithRoomModel;

export interface WebRtcInterface {
    createOfferAndSetLocalDescription(model: RoomModel): Promise<string>;
    createAnswerAndSetDescriptions(model: CreateAnswerAndSetDescriptionsModel): Promise<string>;
    setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel): Promise<void>;
    updateSessionId(
        roomId: StreamRoomId,
        sessionId: number,
        connectionType: ConnectionType,
    ): Promise<void>;
    close(roomId: StreamRoomId): Promise<void>;
    updateKeys(model: UpdateKeysModel): Promise<void>;
}
