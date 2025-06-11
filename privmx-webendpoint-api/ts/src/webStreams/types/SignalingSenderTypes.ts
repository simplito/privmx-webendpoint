import { JanusPluginHandle, JanusStreamInfo, SessionId } from "./MediaServerWebSocketApiTypes";

export type SignalingSenderEventType = "subscriberAttached" | "streamConfigured";

export interface BaseEvent {
    kind: "media-event" | "event";
    type: SignalingSenderEventType;
}

export interface MediaEvent extends BaseEvent {
    sub?: string;
    data?: any;
}

// BackChannel types
export interface SubscriberAttached {
    session_id: SessionId;
    handle: JanusPluginHandle;
    room: any;
    streams: JanusStreamInfo[];
    offer: any;
}

export interface StreamConfigured {
    answer: any;
}

export interface SignalingSenderInterface {
    onSubscriberAttached(model: SubscriberAttached): void;
    onStreamConfigured(model: StreamConfigured): void;
}
