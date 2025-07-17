import { Key } from "../Types";

export class UpdateKeysModel {
  keys: Key[]; 
}

export interface CreateAnswerAndSetDescriptionsModel {
  sdp: string; 
  type: string;
}

export interface SetAnswerAndSetRemoteDescriptionModel {
  sdp: string; 
  type: string;
}

export interface WebRtcInterface {
    createOfferAndSetLocalDescription(): Promise<string>;
    createAnswerAndSetDescriptions(model: CreateAnswerAndSetDescriptionsModel): Promise<string>;
    setAnswerAndSetRemoteDescription(model: SetAnswerAndSetRemoteDescriptionModel): Promise<void>;
    close(): Promise<void>;
    updateKeys(model: UpdateKeysModel): Promise<void>;
}