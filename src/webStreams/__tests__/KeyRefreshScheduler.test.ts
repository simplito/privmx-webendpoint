import { KeyRefreshScheduler } from "../KeyRefreshScheduler.js";
import { StreamRoomId } from "../types/ApiTypes.js";

const ROOM = "room-1" as StreamRoomId;
const OTHER_ROOM = "room-2" as StreamRoomId;
const COOLDOWN_MS = 10000;

/** Lets every microtask of a settled refresh run before the assertion. */
async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** A refresh which only settles when the test says so. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
}

describe("KeyRefreshScheduler", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("refreshes the room which asked for it", async () => {
        const refresh = vi.fn().mockResolvedValue(undefined);
        new KeyRefreshScheduler(refresh).requestRefresh(ROOM);

        expect(refresh).toHaveBeenCalledWith(ROOM);
    });

    it("keeps one refresh per room in flight", async () => {
        const pending = deferred();
        const refresh = vi.fn().mockReturnValue(pending.promise);
        const scheduler = new KeyRefreshScheduler(refresh);

        scheduler.requestRefresh(ROOM);
        scheduler.requestRefresh(ROOM);
        scheduler.requestRefresh(ROOM);

        expect(refresh).toHaveBeenCalledTimes(1);

        pending.resolve();
        await pending.promise;
    });

    it("refreshes other rooms while one is in flight", async () => {
        const refresh = vi.fn().mockReturnValue(deferred().promise);
        const scheduler = new KeyRefreshScheduler(refresh);

        scheduler.requestRefresh(ROOM);
        scheduler.requestRefresh(OTHER_ROOM);

        expect(refresh.mock.calls.map((c) => c[0])).toEqual([ROOM, OTHER_ROOM]);
    });

    it("holds off until the cooldown passes, then refreshes again", async () => {
        const refresh = vi.fn().mockResolvedValue(undefined);
        const scheduler = new KeyRefreshScheduler(refresh);

        scheduler.requestRefresh(ROOM);
        await flush();
        expect(refresh).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(COOLDOWN_MS - 1);
        scheduler.requestRefresh(ROOM);
        expect(refresh).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1);
        scheduler.requestRefresh(ROOM);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("arms the cooldown even when the refresh fails", async () => {
        const refresh = vi.fn().mockRejectedValue(new Error("bridge unreachable"));
        const scheduler = new KeyRefreshScheduler(refresh);

        scheduler.requestRefresh(ROOM);
        await flush();
        expect(refresh).toHaveBeenCalledTimes(1);

        scheduler.requestRefresh(ROOM);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("forgetting a room drops its cooldown", async () => {
        const refresh = vi.fn().mockResolvedValue(undefined);
        const scheduler = new KeyRefreshScheduler(refresh);

        scheduler.requestRefresh(ROOM);
        await flush();
        expect(refresh).toHaveBeenCalledTimes(1);

        scheduler.forgetRoom(ROOM);
        scheduler.requestRefresh(ROOM);

        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
