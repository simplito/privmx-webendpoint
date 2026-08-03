/**
 * The three encoded video frame types defined by the WebRTC Encoded Transform spec.
 * @internal
 */
export type RTCEncodedVideoFrameType = "key" | "delta" | "empty";

// VP8 uncompressed-header sizes: key frames carry the 3-byte frame tag + 3-byte
// start code + 4-byte dimensions (10B); inter (delta) frames carry only the
// 3-byte frame tag; "empty"/audio frames keep a single byte.
const VIDEO_HEADER_SIZES: Record<RTCEncodedVideoFrameType, number> = {
    key: 10,
    delta: 3,
    empty: 1,
};
const AUDIO_HEADER_SIZE = 1;

/**
 * Number of leading bytes of an encoded frame that must stay **cleartext** (the
 * codec bitstream header), so the SFU can still read them - e.g. VP8 keyframe
 * detection and packetization. Written into the v2 trailer as `ClearLen`.
 *
 * This is the **only** codec-specific knowledge in the E2EE path and the single
 * place to update when codec support changes (the sizes above are VP8-specific).
 * The decoder never calls this - it reads `ClearLen` from the frame - so a codec
 * change is a sender-side concern only.
 */
export function clearHeaderLength(kind: string, videoType?: RTCEncodedVideoFrameType): number {
    if (kind !== "video") return AUDIO_HEADER_SIZE;
    return videoType ? (VIDEO_HEADER_SIZES[videoType] ?? 0) : 0;
}
