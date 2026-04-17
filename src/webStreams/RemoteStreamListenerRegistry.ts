import { RemoteStreamListener } from "../Types";
import { Logger } from "./Logger";
import { StreamRoomId } from "./types/ApiTypes";

/**
 * Dispatches incoming remote media tracks and decrypted data channel frames to
 * registered `RemoteStreamListener` callbacks.
 *
 * Listeners are keyed by `streamRoomId` and optionally filtered to a specific
 * `streamId`. When `streamId` is `undefined` the listener receives events from
 * all remote streams in the room.
 */
export class RemoteStreamListenerRegistry {
    private readonly listeners: Map<StreamRoomId, RemoteStreamListener[]> = new Map();
    private readonly logger = new Logger();

    /**
     * Registers `listener` for the room and optional stream ID specified on the
     * listener object.
     * @throws if a listener with the same `streamRoomId` and `streamId` is already registered.
     */
    add(listener: RemoteStreamListener): void {
        const existing = this.listeners.get(listener.streamRoomId) ?? [];
        if (existing.find((x) => x.streamId === listener.streamId)) {
            throw new Error("RemoteStreamListener with given params already exists.");
        }
        existing.push(listener);
        this.listeners.set(listener.streamRoomId, existing);
    }

    /**
     * Dispatches `event` to all listeners registered for `roomId` whose
     * `streamId` matches the event's remote stream, or is `undefined`.
     */
    dispatchTrack(roomId: StreamRoomId, event: RTCTrackEvent): void {
        const roomListeners = this.listeners.get(roomId);
        if (!roomListeners) return;

        const remoteStreamId = Number(event.streams[0].id);
        const filtered = roomListeners.filter(
            (x) => x.streamId === remoteStreamId || x.streamId === undefined,
        );
        for (const listener of filtered) {
            if (listener.onRemoteStreamTrack) {
                try {
                    listener.onRemoteStreamTrack(event);
                } catch (e) {
                    this.logger.error("onRemoteStreamTrack listener threw:", e);
                }
            }
        }
    }

    /**
     * Dispatches a decrypted data channel payload to all listeners registered
     * for `roomId` whose `streamId` matches `remoteStreamId`, or is `undefined`.
     *
     * @param statusCode  `DataChannelCryptorDecryptStatus` value indicating whether
     *                    decryption succeeded or why it failed.
     */
    dispatchData(
        roomId: StreamRoomId,
        remoteStreamId: number,
        data: Uint8Array,
        statusCode: number,
    ): void {
        const roomListeners = this.listeners.get(roomId);
        if (!roomListeners || roomListeners.length === 0) return;

        const filtered = roomListeners.filter(
            (x) => x.streamId === remoteStreamId || x.streamId === undefined,
        );
        for (const listener of filtered) {
            if (listener.onRemoteData) {
                try {
                    listener.onRemoteData(data, statusCode);
                } catch (e) {
                    this.logger.error("onRemoteData listener threw:", e);
                }
            }
        }
    }
}
