import { ReconnectManager } from "../ReconnectManager.js";
import {
    ConnectionType,
    JanusConnection,
    PeerConnectionManager,
    SessionId,
} from "../PeerConnectionManager.js";
import { StreamRoomId } from "../types/ApiTypes.js";
import { StreamRoomConnectionState } from "../../Types.js";

const ROOM = "room-1" as StreamRoomId;
const GRACE_MS = 2000;

function makePc(state: RTCPeerConnectionState) {
    return {
        connectionState: state,
        restartIce: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ sdp: "offer-sdp", type: "offer" }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
    } as unknown as RTCPeerConnection & { restartIce: ReturnType<typeof vi.fn> };
}

function setup(conns: Partial<Record<ConnectionType, JanusConnection>>) {
    const signalling = {
        setNewOfferOnReconfigure: vi.fn().mockResolvedValue(undefined),
        restartSubscriberIce: vi.fn().mockResolvedValue(undefined),
    };
    const pcm = {
        getConnection: (_room: StreamRoomId, type: ConnectionType) => conns[type],
    } as unknown as PeerConnectionManager;
    const states: StreamRoomConnectionState[] = [];
    const manager = new ReconnectManager(pcm, signalling);
    manager.setListener(ROOM, (state) => states.push(state));
    return { manager, signalling, states };
}

function connection(pc: RTCPeerConnection, sessionId = 7): JanusConnection {
    return {
        pc,
        sessionId: sessionId as SessionId,
        hasSubscriptions: false,
        candidateQueue: [],
    };
}

describe("ReconnectManager", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("waits out the grace period on disconnected and does nothing if it recovers", async () => {
        const pc = makePc("disconnected");
        const { manager, signalling, states } = setup({
            publisher: connection(pc),
        });

        manager.onConnectionState(ROOM, "publisher", "disconnected");
        expect(states).toEqual(["reconnecting"]);

        (pc as { connectionState: RTCPeerConnectionState }).connectionState = "connected";
        manager.onConnectionState(ROOM, "publisher", "connected");
        await vi.advanceTimersByTimeAsync(GRACE_MS * 2);

        expect(signalling.setNewOfferOnReconfigure).not.toHaveBeenCalled();
        expect(states).toEqual(["reconnecting", "connected"]);
    });

    it("restarts the publisher by offering, immediately on failed", async () => {
        const pc = makePc("failed");
        const { manager, signalling } = setup({ publisher: connection(pc) });

        manager.onConnectionState(ROOM, "publisher", "failed");
        await vi.advanceTimersByTimeAsync(0);

        expect(pc.restartIce).toHaveBeenCalledTimes(1);
        expect(signalling.setNewOfferOnReconfigure).toHaveBeenCalledWith(7, {
            sdp: "offer-sdp",
            type: "offer",
        });
    });

    it("restarts the subscriber by asking, never by offering", async () => {
        const pc = makePc("failed");
        const { manager, signalling } = setup({ subscriber: connection(pc) });

        manager.onConnectionState(ROOM, "subscriber", "failed");
        await vi.advanceTimersByTimeAsync(0);

        expect(signalling.restartSubscriberIce).toHaveBeenCalledWith(ROOM);
        expect(pc.restartIce).not.toHaveBeenCalled();
        expect(signalling.setNewOfferOnReconfigure).not.toHaveBeenCalled();
    });

    it("gives up as lost after the attempts run out", async () => {
        const pc = makePc("failed");
        const { manager, signalling, states } = setup({
            subscriber: connection(pc),
        });

        manager.onConnectionState(ROOM, "subscriber", "failed");
        await vi.advanceTimersByTimeAsync(GRACE_MS * 5);

        expect(signalling.restartSubscriberIce).toHaveBeenCalledTimes(3);
        expect(states).toEqual(["reconnecting", "lost"]);
    });

    it("reports every raw state of the subscriber connection, recovery or not", async () => {
        const pc = makePc("connected");
        const { manager } = setup({ subscriber: connection(pc) });
        const raw: RTCPeerConnectionState[] = [];
        manager.setRawStateListener(ROOM, "subscriber", (state) => raw.push(state));

        for (const state of ["connecting", "connected", "disconnected", "closed"] as const) {
            manager.onConnectionState(ROOM, "subscriber", state);
        }
        manager.onConnectionState(ROOM, "publisher", "failed");

        // Publisher states go to the publisher's own listener, not this one.
        expect(raw).toEqual(["connecting", "connected", "disconnected", "closed"]);
    });

    it("fires no restart after destroy, even with a recovery already armed", async () => {
        const pc = makePc("failed");
        const { manager, signalling, states } = setup({ subscriber: connection(pc) });

        manager.onConnectionState(ROOM, "subscriber", "disconnected");
        manager.destroy();
        await vi.advanceTimersByTimeAsync(GRACE_MS * 5);

        expect(signalling.restartSubscriberIce).not.toHaveBeenCalled();
        expect(states).toEqual(["reconnecting"]);
    });

    it("does not restart a closed connection", async () => {
        const pc = makePc("failed");
        const { manager, signalling } = setup({ publisher: connection(pc) });

        manager.onConnectionState(ROOM, "publisher", "failed");
        (pc as { connectionState: RTCPeerConnectionState }).connectionState = "closed";
        await vi.advanceTimersByTimeAsync(GRACE_MS * 5);

        expect(signalling.setNewOfferOnReconfigure).not.toHaveBeenCalled();
    });
});
