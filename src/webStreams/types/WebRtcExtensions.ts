/**
 * Type augmentations for non-standard / draft WebRTC APIs that are present in
 * modern browsers but absent from the TypeScript lib.dom.d.ts declarations.
 */

export interface EncodedStreams {
    readable: ReadableStream<EncodedAudioChunk | EncodedVideoChunk>;
    writable: WritableStream<EncodedAudioChunk | EncodedVideoChunk>;
}

export interface RTCRtpScriptTransformOptions {
    operation: "encode" | "decode";
    id?: string;
    publisherId?: number;
    kind?: string;
}

export interface RTCRtpSenderWithTransform extends RTCRtpSender {
    transform: unknown;
    createEncodedStreams(): EncodedStreams;
}

export interface RTCRtpReceiverWithTransform extends RTCRtpReceiver {
    transform: unknown;
    createEncodedStreams(): EncodedStreams;
}

export interface RTCConfigurationWithInsertableStreams extends RTCConfiguration {
    encodedInsertableStreams: boolean;
}

export interface WindowWithRTCRtpScriptTransform extends Window {
    RTCRtpScriptTransform: new (worker: Worker, options: RTCRtpScriptTransformOptions) => unknown;
}

export interface WindowWithWasmHandler extends Window {
    webRtcInterfaceToNativeHandler: Record<number, unknown>;
}
