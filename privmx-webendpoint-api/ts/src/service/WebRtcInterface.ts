import { Key } from "../Types";
import { ConnectionType } from "../webStreams/PeerConnectionsManager";
import { StreamRoomId } from "../webStreams/types/ApiTypes";

export class UpdateKeysModel {
  keys: Key[]; 
}

export interface Jsep {
  sdp: string; 
  type: string;
}
export interface SdpWithRoomModel extends Jsep {
  roomId: StreamRoomId;
}

export interface RoomModel {
  roomId: StreamRoomId;
}

export type CreateAnswerAndSetDescriptionsModel = SdpWithRoomModel;
export type SetAnswerAndSetRemoteDescriptionModel = SdpWithRoomModel;

export interface StreamsUpdatedData {
    videoroom : "updated";
    room : StreamRoomId;
    streams: UpdatedStreamData[];
    jsep?: Jsep;
}

export interface UpdatedStreamData {
    type: "audio" | "video" | "data";
    streamId: number;
    streamMid: number;
    stream_display: string;
    mindex: number;
    mid: string;
    send: boolean;
    ready: boolean;
}
export interface CurrentPublishersData {
    room: StreamRoomId;
    publishers: NewPublisherEvent[];
}

export interface NewPublisherEvent {
    id: number;
    video_codec: string;
    streams: VideoRoomStreamTrack[];
}

export interface VideoRoomStreamTrack {
    type: string;
    codec: string;
    mid: string;
    mindex: number;
}

export interface WebRtcInterface {
    createOfferAndSetLocalDescription(model: RoomModel): Promise<string>;
    createAnswerAndSetDescriptions(model: CreateAnswerAndSetDescriptionsModel): Promise<string>;
    setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel): Promise<void>;
    updateSessionId(roomId: StreamRoomId, sessionId: number, connectionType: ConnectionType): Promise<void>;
    close(roomId: StreamRoomId): Promise<void>;
    updateKeys(model: UpdateKeysModel): Promise<void>;
}