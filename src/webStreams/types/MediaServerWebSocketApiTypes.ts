export type SessionId = string & {_sessionId: never};
export type TransactionId = string & {_transactionId: never};

export type PluginHandleId = number & {_pluginHandleId: never};
export type PluginId = string & {_pluginId: never};
export type UserToken = string & {_userToken: never};

export type VideoRoomRequestStatus = string & {_videoRoomStatus: never};
export type VideoRoomId = number & {_videoRoomId: never};
export type VideoRoomParticipantId = number & {_videoRoomParticipantId: never};
export type VideoRoomPublisherId = number & {_videoRoomPublisherId: never};

export interface JanusSession {
    id: SessionId;
}

export interface JanusStreamInfo {
    type: "audio" | "video" | "data";
    active: boolean;
    mid: string;
    mindex: number;
    ready: boolean;
    send: boolean;
    source_ids: VideoRoomParticipantId[];
    sources: number;
}

export interface JanusPluginHandle {
    id: PluginHandleId;
    pluginId: PluginId;
}

export interface VideoRoom {
    room: VideoRoomId;          //<unique numeric ID, optional, chosen by plugin if missing>,  // <true|false, whether the room should be saved in the config file, default=false>,
    description: string;   // "<pretty name of the room, optional>",
    pin_required: boolean; // <true|false, whether a PIN is required to join this room>,
    is_private: boolean; // <true|false, whether this room is 'private' (as in hidden) or not>,
    max_publishers: number; // <how many publishers can actually publish via WebRTC at the same time>,
    bitrate: number; // <bitrate cap that should be forced (via REMB) on all publishers by default>,
    bitrate_cap: number; // <true|false, whether the above cap should act as a limit to dynamic bitrate changes by publishers (optional)>,
    fir_freq: number; // <how often a keyframe request is sent via PLI/FIR to active publishers>,
    require_pvtid: boolean; // <true|false, whether subscriptions in this room require a private_id>,
    require_e2ee: boolean; // <true|false, whether end-to-end encrypted publishers are required>,
    dummy_publisher: boolean; // <true|false, whether a dummy publisher exists for placeholder subscriptions>,
    notify_joining: boolean; // <true|false, whether an event is sent to notify all participants if a new participant joins the room>,
    audiocodec: string; // "<comma separated list of allowed audio codecs>",
    videocodec: string; // "<comma separated list of allowed video codecs>",
    opus_fec: boolean; // <true|false, whether inband FEC must be negotiated (note: only available for Opus) (optional)>,
    opus_dtx: boolean; // <true|false, whether DTX must be negotiated (note: only available for Opus) (optional)>,
    record: boolean; // <true|false, whether the room is being recorded>,
    rec_dir: string; // "<if recording, the path where the .mjr files are being saved>",
    lock_record: boolean; // <true|false, whether the room recording state can only be changed providing the secret>,
    num_participants: number; // <count of the participants (publishers, active or not; not subscribers)>
    audiolevel_ext: boolean; // <true|false, whether the ssrc-audio-level extension must be negotiated or not for new publishers>,
    audiolevel_event: boolean; // <true|false, whether to emit event to other users about audiolevel>,
    audio_active_packets: number; // <amount of packets with audio level for checkup (optional, only if audiolevel_event is true)>,
    audio_level_average: number; // <average audio level (optional, only if audiolevel_event is true)>,
    videoorient_ext: boolean; // <true|false, whether the video-orientation extension must be negotiated or not for new publishers>,
    playoutdelay_ext: boolean; //<true|false, whether the playout-delay extension must be negotiated or not for new publishers>,
    transport_wide_cc_ext: boolean; // <true|false, whether the transport wide cc extension must be negotiated or not for new publishers>

}

export interface PublisherInfo {
    id: string; // : <unique ID of active publisher #1>,
    display: string; // : "<display name of active publisher #1, if any>",
    dummy: boolean; // <true if this participant is a dummy publisher>,
    streams: StreamInfo[];
    talking: boolean; // : <true|false, whether the publisher is talking or not (only if audio levels are used); deprecated, use the stream specific ones>,
}

export interface StreamInfo {
    type: string; //"<type of published stream #1 (audio|video|data)">,
    mindex: string; // "<unique mindex of published stream #1>",
    mid: string; //"<unique mid of of published stream #1>",
    disabled: boolean;  //<if true, it means this stream is currently inactive/disabled (and so codec, description, etc. will be missing)>,
    codec: string; //"<codec used for published stream #1>",
    description: string; //"<text description of published stream #1, if any>",
    moderated: boolean; //<true if this stream audio has been moderated for this participant>,
    simulcast: boolean; //"<true if published stream #1 uses simulcast>",
    svc: boolean; //"<true if published stream #1 uses SVC (VP9 and AV1 only)>",
    talking: boolean; //<true|false, whether the publisher stream has audio activity or not (only if audio levels are used)>,
}

export interface VideoRoomParticipant {
    id: VideoRoomParticipantId; // <unique numeric ID of the participant>,
    display: string; // "<display name of the participant, if any; optional>",
    publisher: boolean; // "<true|false, whether user is an active publisher in the room>",
    talking: boolean; // <true|false, whether user is talking or not (only if audio levels are used)>
}

export interface CreateRoomOptions {
    room?: string;          //<unique numeric ID, optional, chosen by plugin if missing>,
    permanent?: boolean;    // <true|false, whether the room should be saved in the config file, default=false>,
    description?: string;   // "<pretty name of the room, optional>",
    secret?: string;        // "<password required to edit/destroy the room, optional>",
    pin?: string;           // "<password required to join the room, optional>",
    is_private?: boolean;   // <true|false, whether the room should appear in a list request>,
    allowed?: UserToken[];  // [ array of string tokens users can use to join this room, optional],
    publishers?: number;    
    // TODO - dodac pozostale opcje
}

export interface CreateRoomResult {
    videoroom: "created";
    room: VideoRoomId;
    permanent: boolean;
}

export interface EditRoomOptions {
    room: VideoRoomId;          //<unique numeric ID, optional, chosen by plugin if missing>,

//     permanent?: boolean;    // <true|false, whether the room should be saved in the config file, default=false>,
    new_description?: string;   // "<pretty name of the room, optional>",
//     secret?: string;        // "<password required to edit/destroy the room, optional>",
//     pin?: string;           // "<password required to join the room, optional>",
//     is_private?: boolean;   // <true|false, whether the room should appear in a list request>,
//     allowed?: UserToken[];  // [ array of string tokens users can use to join this room, optional],
//     publishers?: number;
//  TODO - dodac pozostale opcje    
}

export interface EditRoomResult {
    videoroom: "edited";
    room: VideoRoomId;
    permanent: boolean;
}

export interface DestroyRoomOptions {
    room: VideoRoomId;
    secret?: string;
    permanent?: boolean; // <true|false, whether the room should be also removed from the config file, default=false>
}

export interface DestroyRoomResult {
    videoroom: "destroyed";
    room: VideoRoomId;
    permanent: boolean;
}

export interface RoomExistsOptions {
    room: VideoRoomId;
}

export interface RoomExistsResult {
    room: VideoRoomId;
    exists: boolean;
}

export interface SetRoomRestrictedAccessOptions {
    secret?: string;
    action: "enable" | "disable";
    room: VideoRoomId;
}

export interface SetRoomAccessAllowedOptions {
    secret?: string;
    action: "add" | "remove";
    room: VideoRoomId;
    allowed: string[];
}

export interface RoomAccessResult {
    room: VideoRoomId;
    allowed?: string[];
}

export interface RoomKickOptions {
    secret?: string;
    room: VideoRoomId;
    id: VideoRoomParticipantId; 
}

export interface RoomModerateOptions {
    secret?: string;
    room: VideoRoomId;
    id: VideoRoomParticipantId;
    mid: string;    // <mid of the m-line to refer to for this moderate request>,
    mute: boolean;  // <true|false, depending on whether the media addressed by the above mid should be muted by the moderator>
}

export interface RoomListParticipantsOptions {
    room: VideoRoomId;
}

export interface RoomListResult {
    list: VideoRoom[];
}

export interface RoomListParticipantsResult {
    room: VideoRoomId;
    participants: VideoRoomParticipant[];
}

export interface RoomJoinAsPublisherOptions {
    room: VideoRoomId; // <unique ID of the room to join>,
    id?: VideoRoomParticipantId; //<unique ID to register for the publisher; optional, will be chosen by the plugin if missing>,
    display?: string; // "<display name for the publisher; optional>",
    token?: string; // "<invitation token, in case the room has an ACL; optional>"
}

export interface RoomJoinAsSubscriberOptions {
    room: VideoRoomId;
    use_msid?: boolean; //<whether subscriptions should include an msid that references the publisher; false by default>
    autoupdate?: boolean; //<whether a new SDP offer is sent automatically when a subscribed publisher leaves; true by default>
    private_id?: string; //<unique ID of the publisher that originated this request; optional, unless mandated by the room configuration>
    streams: RoomJoinStreamOptions[];
    data: boolean;
}

export interface RoomJoinStreamOptions {
    feed: number; // : <unique ID of publisher owning the stream to subscribe to>,
    mid?: string; // "<unique mid of the publisher stream to subscribe to; optional>"
    crossrefid?: string; // : "<id to map this subscription with entries in streams list; optional>"
}


export interface VideoRoomDescription {
    mid: string; //"<unique mid of a stream being published>"
    description?: string; //"<text description of the stream (e.g., My front webcam)>"
}


export interface RoomPublishOptions {
    videocodec?: string; // "<video codec to prefer among the negotiated ones; optional>",
    bitrate?: number; // <bitrate cap to return via REMB; optional, overrides the global room value if present>,
    record?: boolean; // <true|false, whether this publisher should be recorded or not; optional>,
    filename?: string; // "<if recording, the base path/file to use for the recording files; optional>",
    display?: string; // "<display name to use in the room; optional>",
    audio_level_average?: number; // "<if provided, overrided the room audio_level_average for this user; optional>",
    audio_active_packets?: any; // "<if provided, overrided the room audio_active_packets for this user; optional>",
    descriptions?: VideoRoomDescription[];
    e2ee?: boolean;
    data: boolean;
}

export interface VideoRoomStreamTrack {
    type: string;
    codec: string;
    mid: string;
    mindex: number;
}
export interface NewPublisherEvent {
    id: VideoRoomPublisherId;
    video_codec: string;
    streams: VideoRoomStreamTrack[];
}

export interface JoinedEvent {
    room: VideoRoomId;
    description: string;
    id: number;
    private_id: number;
    publishers: NewPublisherEvent[]
}

// WebRTC-specific events (Media Server signalling)
export type MediaServerSignallingEvent = WebRTCMediaEvent | WebRTCSHangupEvent | WebRTCSlowLinkEvent | WebRTCUpEvent;
export interface WebRTCUpEvent {
    eventType: "webrtcup";
    session_id: string;
    sender: string;
}

export interface WebRTCMediaEvent {
    eventType: "media";
    session_id: string;
    sender: string;
    type : "audio" | "video" | "data";
    receiving: boolean;
}

export interface WebRTCSlowLinkEvent {
    eventType: "slowlink";
    session_id: string;
    sender: string;
    uplink: boolean;
    nacks: number;
}

export interface WebRTCSHangupEvent {
    eventType: "hangup";
    session_id: string;
    sender: string;
    reason: string;
}