import { StreamHandle } from "../Types";

export interface StateChangeEvent {
    streamHandle: StreamHandle;
    state: RTCPeerConnectionState;
}

export interface StateChangeFilter {
    streamHandle: StreamHandle;
}

export type StateChangeListener = (event: StateChangeEvent) => void;

/**
 * Fan-out dispatcher for `RTCPeerConnection` state changes.
 *
 * Listeners are filtered by `streamHandle` so each published stream can
 * independently observe its own connection state without receiving events
 * from other streams.
 */
export class StateChangeDispatcher {
    private listeners = new Set<{
        filter: StateChangeFilter;
        listener: StateChangeListener;
    }>();

    /**
     * Registers `listener` to be called whenever the connection state changes
     * for the stream identified by `filter.streamHandle`.
     */
    addOnStateChangeListener(filter: StateChangeFilter, listener: StateChangeListener): void {
        this.listeners.add({ filter, listener });
    }

    /**
     * Removes all listeners whose `streamHandle` equals `filter.streamHandle`.
     */
    removeOnStateChangeListener(filter: StateChangeFilter): void {
        for (const value of this.listeners.values()) {
            if (value.filter.streamHandle === filter.streamHandle) {
                this.listeners.delete(value);
            }
        }
    }

    /**
     * Emits `event` to all listeners whose `streamHandle` matches the event's.
     */
    emit(event: StateChangeEvent): void {
        for (const { filter, listener } of this.listeners) {
            if (filter.streamHandle === event.streamHandle) {
                listener(event);
            }
        }
    }
}
