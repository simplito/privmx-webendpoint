import { KeyRefreshScheduler } from "../KeyRefreshScheduler.js";
import { KeySyncManager } from "../KeySyncManager.js";
import { E2eeWorker } from "../E2eeWorker.js";
import { WebRtcClient } from "../WebRtcClient.js";
import { StreamRoomId } from "../types/ApiTypes.js";
import { StreamRoomErrorCode } from "../../native/NativeErrorCodes.js";

const ROOM = "room-1" as StreamRoomId;
const OTHER_ROOM = "room-2" as StreamRoomId;

function setup() {
    let reportMissingKey = (): void => undefined;
    const e2eeWorker = {
        setMissingKeyListener: (listener: () => void) => (reportMissingKey = listener),
        setKeys: vi.fn().mockResolvedValue(undefined),
    } as unknown as E2eeWorker;

    const keys = new KeySyncManager(e2eeWorker);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const keyRefresh = new KeyRefreshScheduler(refresh);

    const stub = undefined as never;
    const client = new WebRtcClient(
        stub,
        stub,
        keys,
        stub,
        stub,
        stub,
        stub,
        e2eeWorker,
        stub,
        stub,
        keyRefresh,
    );

    const decryptDataChannelMessage = vi.fn();
    client.bindApiInterface({
        trickle: vi.fn(),
        setNewOfferOnReconfigure: vi.fn(),
        restartSubscriberIce: vi.fn(),
        refreshStreamRoomKeys: vi.fn().mockResolvedValue(undefined),
        decryptDataChannelMessage,
    });

    return { client, keys, refresh, decryptDataChannelMessage, report: () => reportMissingKey() };
}

function decrypted(statusCode: number) {
    return { data: new Uint8Array(), seq: 1, statusCode };
}

describe("WebRtcClient key refresh", () => {
    it("refreshes the keys of a data channel message whose key is not held", async () => {
        const { client, refresh, decryptDataChannelMessage } = setup();
        decryptDataChannelMessage.mockResolvedValue(
            decrypted(StreamRoomErrorCode.NO_STREAM_DECRYPTION_KEY),
        );

        await client.decryptDataChannelMessage(ROOM, "7", new Uint8Array());

        expect(refresh).toHaveBeenCalledWith(ROOM);
    });

    it("leaves a data channel message which failed for any other reason alone", async () => {
        const { client, refresh, decryptDataChannelMessage } = setup();
        decryptDataChannelMessage.mockResolvedValue(
            decrypted(StreamRoomErrorCode.INVALID_DATA_CHANNEL_SEQ),
        );

        await client.decryptDataChannelMessage(ROOM, "7", new Uint8Array());

        expect(refresh).not.toHaveBeenCalled();
    });

    it("refreshes every room holding keys when the worker reports a missing one", async () => {
        const { client, keys, refresh, report } = setup();
        await client.updateKeys(ROOM, []);
        await keys.updateKeys(OTHER_ROOM, []);

        report();

        expect(refresh.mock.calls.map((c) => c[0])).toEqual([ROOM, OTHER_ROOM]);
    });

    it("stops refreshing a room which was left", async () => {
        const { client, refresh, report } = setup();
        await client.updateKeys(ROOM, []);

        client.clearKeyRefreshState(ROOM);
        report();

        expect(refresh).not.toHaveBeenCalled();
    });
});
