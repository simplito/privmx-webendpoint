import { RemoteStreamListener } from "../Types";
import { StreamRoomId } from "./types/ApiTypes";

export class RemoteStreamListenerRegistry {
    private readonly listeners: Map<StreamRoomId, RemoteStreamListener[]> = new Map();

    add(listener: RemoteStreamListener): void {
        const existing = this.listeners.get(listener.streamRoomId) ?? [];
        if (existing.find((x) => x.streamId === listener.streamId)) {
            throw new Error("RemoteStreamListener with given params already exists.");
        }
        existing.push(listener);
        this.listeners.set(listener.streamRoomId, existing);
    }

    dispatchTrack(roomId: StreamRoomId, event: RTCTrackEvent): void {
        const roomListeners = this.listeners.get(roomId);
        if (!roomListeners) {
            return;
        }
        const remoteStreamId = Number(event.streams[0].id);
        const filtered = roomListeners.filter(
            (x) => x.streamId === remoteStreamId || x.streamId === undefined,
        );
        for (const listener of filtered) {
            if (listener.onRemoteStreamTrack) {
                listener.onRemoteStreamTrack(event);
            }
        }
    }

    dispatchData(
        roomId: StreamRoomId,
        remoteStreamId: number,
        data: Uint8Array,
        statusCode: number,
    ): void {
        const roomListeners = this.listeners.get(roomId);
        if (!roomListeners || roomListeners.length === 0) {
            return;
        }
        const filtered = roomListeners.filter(
            (x) => x.streamId === remoteStreamId || x.streamId === undefined,
        );
        for (const listener of filtered) {
            if (listener.onRemoteData) {
                listener.onRemoteData(data, statusCode);
            }
        }
    }
}
