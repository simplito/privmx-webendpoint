import { ConnectionType, PeerConnectionManager } from "../PeerConnectionManager.js";
import { StreamRoomId } from "../types/ApiTypes.js";

const ROOM_A = "room-a" as StreamRoomId;
const ROOM_B = "room-b" as StreamRoomId;

function makePc() {
    return {
        close: vi.fn(),
        addEventListener: vi.fn(),
    } as unknown as RTCPeerConnection & { close: ReturnType<typeof vi.fn> };
}

function setup() {
    const created: RTCPeerConnection[] = [];
    const states: [StreamRoomId, ConnectionType, RTCPeerConnectionState][] = [];
    const pcm = new PeerConnectionManager(
        () => {
            const pc = makePc();
            created.push(pc);
            return pc;
        },
        () => {},
        (room, connectionType, state) => states.push([room, connectionType, state]),
    );
    return { pcm, created, states };
}

describe("PeerConnectionManager.closeAll", () => {
    it("closes every connection of every room and empties the map", () => {
        const { pcm, created, states } = setup();
        pcm.initialize(ROOM_A, "publisher");
        pcm.initialize(ROOM_A, "subscriber");
        pcm.initialize(ROOM_B, "subscriber");

        pcm.closeAll();

        expect(created).toHaveLength(3);
        for (const pc of created) {
            expect((pc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
        }
        expect(states).toEqual([
            [ROOM_A, "publisher", "closed"],
            [ROOM_A, "subscriber", "closed"],
            [ROOM_B, "subscriber", "closed"],
        ]);
        expect(pcm.hasConnection(ROOM_A, "publisher")).toBe(false);
        expect(pcm.getConnection(ROOM_B, "subscriber")).toBeUndefined();
    });

    it("is a no-op when called twice", () => {
        const { pcm, created } = setup();
        pcm.initialize(ROOM_A, "publisher");

        pcm.closeAll();
        pcm.closeAll();

        expect(
            (created[0] as unknown as { close: ReturnType<typeof vi.fn> }).close,
        ).toHaveBeenCalledTimes(1);
    });
});
