import { Key } from "../Types.js";
import { ConnectionType } from "./PeerConnectionManager.js";
import { Jsep, StreamRoomId } from "./types/ApiTypes.js";

export class UpdateKeysModel {
    streamRoomId: StreamRoomId;
    keys: Key[];
}

export interface SdpWithRoomModel extends Jsep {
    roomId: StreamRoomId;
    connectionType: ConnectionType;
}

export interface RoomModel {
    roomId: StreamRoomId;
    connectionType: ConnectionType;
}

export type CreateAnswerAndSetDescriptionsModel = SdpWithRoomModel;
export type SetAnswerAndSetRemoteDescriptionModel = SdpWithRoomModel;

export interface CloseModel {
    roomId: StreamRoomId;
    connectionType: ConnectionType;
}

export interface WebRtcInterface {
    createOfferAndSetLocalDescription(model: RoomModel): Promise<string>;
    createAnswerAndSetDescriptions(model: CreateAnswerAndSetDescriptionsModel): Promise<string>;
    setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel): Promise<void>;
    updateSessionId(
        roomId: StreamRoomId,
        sessionId: number,
        connectionType: ConnectionType,
    ): Promise<void>;
    close(model: CloseModel): Promise<void>;
    closeAll(roomId: StreamRoomId): Promise<void>;
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
    | { name: "close"; params: CloseModel }
    | { name: "closeAll"; params: StreamRoomId }
    | { name: "updateKeys"; params: UpdateKeysModel };
