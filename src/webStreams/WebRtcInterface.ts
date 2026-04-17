import { Key } from "../Types";
import { ConnectionType } from "./PeerConnectionManager";
import { Jsep, StreamRoomId } from "./types/ApiTypes";

export class UpdateKeysModel {
    streamRoomId: StreamRoomId;
    keys: Key[];
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

// Discriminated union covering every method the C++ WASM layer can invoke.
export type WebRtcMethodCall =
    | { name: "createOfferAndSetLocalDescription"; params: RoomModel }
    | { name: "createAnswerAndSetDescriptions"; params: SdpWithRoomModel }
    | { name: "setAnswerAndSetRemoteDescription"; params: SetAnswerAndSetRemoteDescriptionModel }
    | {
          name: "updateSessionId";
          params: { streamRoomId: StreamRoomId; sessionId: number; connectionType: ConnectionType };
      }
    | { name: "close"; params: StreamRoomId }
    | { name: "updateKeys"; params: UpdateKeysModel };
