import { RemoteStreamListenerRegistry } from "../RemoteStreamListenerRegistry";
import { RemoteStreamListener } from "../../Types";
import { StreamId, StreamRoomId } from "../types/ApiTypes";

const ROOM = "room-1" as StreamRoomId;
const ROOM_2 = "room-2" as StreamRoomId;

function sid(n: number): StreamId {
    return n as StreamId;
}

function makeTrackEvent(streamId: number): RTCTrackEvent {
    return {
        streams: [{ id: String(streamId) }],
        track: {},
        receiver: {},
    } as unknown as RTCTrackEvent;
}

describe("RemoteStreamListenerRegistry", () => {
    let registry: RemoteStreamListenerRegistry;

    beforeEach(() => {
        registry = new RemoteStreamListenerRegistry();
    });

    describe("add", () => {
        it("adds a listener without throwing", () => {
            const listener: RemoteStreamListener = { streamRoomId: ROOM, streamId: sid(1) };
            expect(() => registry.add(listener)).not.toThrow();
        });

        it("allows listeners with different streamIds in the same room", () => {
            registry.add({ streamRoomId: ROOM, streamId: sid(1) });
            expect(() =>
                registry.add({ streamRoomId: ROOM, streamId: sid(2) }),
            ).not.toThrow();
        });

        it("allows the same streamId in different rooms", () => {
            registry.add({ streamRoomId: ROOM, streamId: sid(1) });
            expect(() =>
                registry.add({ streamRoomId: ROOM_2, streamId: sid(1) }),
            ).not.toThrow();
        });

        it("allows a wildcard listener (streamId undefined) alongside specific ones", () => {
            registry.add({ streamRoomId: ROOM });
            expect(() =>
                registry.add({ streamRoomId: ROOM, streamId: sid(5) }),
            ).not.toThrow();
        });

        it("throws when adding a duplicate (same room + same streamId)", () => {
            registry.add({ streamRoomId: ROOM, streamId: sid(3) });
            expect(() =>
                registry.add({ streamRoomId: ROOM, streamId: sid(3) }),
            ).toThrow("RemoteStreamListener with given params already exists.");
        });

        it("throws when adding a second wildcard listener in the same room", () => {
            registry.add({ streamRoomId: ROOM });
            expect(() => registry.add({ streamRoomId: ROOM })).toThrow(
                "RemoteStreamListener with given params already exists.",
            );
        });
    });

    describe("dispatchTrack", () => {
        it("calls onRemoteStreamTrack on matching listener", () => {
            const onTrack = jest.fn();
            registry.add({ streamRoomId: ROOM, streamId: sid(10), onRemoteStreamTrack: onTrack });
            const event = makeTrackEvent(10);
            registry.dispatchTrack(ROOM, event);
            expect(onTrack).toHaveBeenCalledWith(event);
        });

        it("does not call listener registered for a different streamId", () => {
            const onTrack = jest.fn();
            registry.add({ streamRoomId: ROOM, streamId: sid(10), onRemoteStreamTrack: onTrack });
            registry.dispatchTrack(ROOM, makeTrackEvent(99));
            expect(onTrack).not.toHaveBeenCalled();
        });

        it("calls a wildcard listener (streamId undefined) for any streamId", () => {
            const onTrack = jest.fn();
            registry.add({ streamRoomId: ROOM, onRemoteStreamTrack: onTrack });
            registry.dispatchTrack(ROOM, makeTrackEvent(42));
            expect(onTrack).toHaveBeenCalledTimes(1);
        });

        it("does not call listeners registered under a different room", () => {
            const onTrack = jest.fn();
            registry.add({ streamRoomId: ROOM_2, onRemoteStreamTrack: onTrack });
            registry.dispatchTrack(ROOM, makeTrackEvent(1));
            expect(onTrack).not.toHaveBeenCalled();
        });

        it("is a no-op when there are no listeners for the room", () => {
            expect(() => registry.dispatchTrack(ROOM, makeTrackEvent(1))).not.toThrow();
        });

        it("skips listeners that have no onRemoteStreamTrack handler", () => {
            registry.add({ streamRoomId: ROOM, streamId: sid(1) });
            expect(() => registry.dispatchTrack(ROOM, makeTrackEvent(1))).not.toThrow();
        });

        it("calls both a specific and a wildcard listener when event matches", () => {
            const specific = jest.fn();
            const wildcard = jest.fn();
            registry.add({ streamRoomId: ROOM, streamId: sid(5), onRemoteStreamTrack: specific });
            registry.add({ streamRoomId: ROOM, onRemoteStreamTrack: wildcard });
            registry.dispatchTrack(ROOM, makeTrackEvent(5));
            expect(specific).toHaveBeenCalledTimes(1);
            expect(wildcard).toHaveBeenCalledTimes(1);
        });
    });

    describe("dispatchData", () => {
        it("calls onRemoteData on matching listener", () => {
            const onData = jest.fn();
            registry.add({ streamRoomId: ROOM, streamId: sid(7), onRemoteData: onData });
            const data = new Uint8Array([1, 2, 3]);
            registry.dispatchData(ROOM, 7, data, 0);
            expect(onData).toHaveBeenCalledWith(data, 0);
        });

        it("does not call listener for a different streamId", () => {
            const onData = jest.fn();
            registry.add({ streamRoomId: ROOM, streamId: sid(7), onRemoteData: onData });
            registry.dispatchData(ROOM, 99, new Uint8Array(), 0);
            expect(onData).not.toHaveBeenCalled();
        });

        it("calls wildcard listener for any streamId", () => {
            const onData = jest.fn();
            registry.add({ streamRoomId: ROOM, onRemoteData: onData });
            registry.dispatchData(ROOM, 55, new Uint8Array([9]), 1);
            expect(onData).toHaveBeenCalledTimes(1);
            expect(onData).toHaveBeenCalledWith(new Uint8Array([9]), 1);
        });

        it("forwards the statusCode unchanged", () => {
            const onData = jest.fn();
            registry.add({ streamRoomId: ROOM, streamId: sid(2), onRemoteData: onData });
            registry.dispatchData(ROOM, 2, new Uint8Array(), 42);
            expect(onData).toHaveBeenCalledWith(expect.any(Uint8Array), 42);
        });

        it("is a no-op when there are no listeners for the room", () => {
            expect(() =>
                registry.dispatchData(ROOM, 1, new Uint8Array(), 0),
            ).not.toThrow();
        });

        it("does not call listeners in a different room", () => {
            const onData = jest.fn();
            registry.add({ streamRoomId: ROOM_2, streamId: sid(1), onRemoteData: onData });
            registry.dispatchData(ROOM, 1, new Uint8Array(), 0);
            expect(onData).not.toHaveBeenCalled();
        });

        it("skips listeners that have no onRemoteData handler", () => {
            registry.add({ streamRoomId: ROOM, streamId: sid(1) });
            expect(() => registry.dispatchData(ROOM, 1, new Uint8Array(), 0)).not.toThrow();
        });
    });
});
