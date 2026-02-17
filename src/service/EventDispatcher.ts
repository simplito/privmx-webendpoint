import { StreamHandle } from "../Types";

export interface StateChangeEvent {
    streamHandle: StreamHandle;
    state: RTCPeerConnectionState;
};

export interface StateChangeFilter {
    streamHandle: StreamHandle;
};

export type StateChangeListener = (event: StateChangeEvent) => void;

export class StateChangeDispatcher {
    private listeners = new Set<{
        filter: StateChangeFilter;
        listener: StateChangeListener;
    }>();

    addOnStateChangeListener(
        filter: StateChangeFilter,
        listener: StateChangeListener
    ) {
        const entry = { filter, listener };
        this.listeners.add(entry);
    }

    removeOnStateChangeListener(filter: StateChangeFilter) {
        for (const value of this.listeners.values()) {
            if (value.filter === filter) {
                this.listeners.delete(value)
            }
        }
    }

    emit(event: StateChangeEvent): void {
        for (const { filter, listener } of this.listeners) {
            if (filter.streamHandle === event.streamHandle) {
                listener(event);
            }
        }
    }
}
