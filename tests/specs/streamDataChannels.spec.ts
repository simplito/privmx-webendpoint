import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { setupUsers } from "../test-utils";
import type { Endpoint, StreamApi } from "../../src";
import { StreamRoomId } from "../../src/webStreams/types/ApiTypes";
import { StreamHandle } from "../../src/Types";
import { StreamEventType, StreamEventSelectorType } from "../../src/Types";

interface TestUser {
    id: string;
    privKey: string;
    pubKey: string;
}

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;

        streamApi?: StreamApi;
        currentUser?: TestUser;

        myHandle?: StreamHandle;

        remoteTracksCount?: number;
        trackEnded?: boolean;
        trackMuted?: boolean;
    }
}

test.use({
    launchOptions: {
        args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--headless",
        ],
        firefoxUserPrefs: {
            "media.navigator.streams.fake": true,
            "media.navigator.permission.disabled": true,
        },
    },
});

test.describe("StreamTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            await window.Endpoint.setup("../../assets");
        });
    });

    const initPage = async (page: any) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            try {
                await window.Endpoint.setup("../../assets");
            } catch {}
        });
    };

    const connectUserToBridge = async (
        page: any,
        user: TestUser,
        bridgeUrl: string,
        solutionId: string,
    ) => {
        await page.evaluate(
            async ({
                bridgeUrl,
                solutionId,
                user,
            }: {
                bridgeUrl: string;
                solutionId: string;
                user: TestUser;
            }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(user.privKey, solutionId, bridgeUrl);
                const streamApi = await Endpoint.createStreamApi(
                    connection,
                    await Endpoint.createEventApi(connection),
                );

                window.streamApi = streamApi;
                window.currentUser = user;
            },
            { bridgeUrl, solutionId, user },
        );
    };

    test("E2E: Three users exchange data streams", async ({ createContextPage, backend, cli }) => {
        test.setTimeout(60_000);
        const page1 = await createContextPage();
        await initPage(page1);
        const users = await setupUsers(page1, cli);

        const page2 = await createContextPage();

        await initPage(page2);

        const page3 = await createContextPage();

        await initPage(page3);

        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page3, users.u3, backend.bridgeUrl, testData.solutionId);

        const contextId = testData.contextId;
        let roomId: StreamRoomId;
        let dataTrackId: string;
        let streamHandle: StreamHandle;
        const testMessage = "test message";

        let resolvePage1: () => void;
        let resolvePage3: () => void;

        const page1Event = new Promise<void>((r) => (resolvePage1 = r));
        const page3Event = new Promise<void>((r) => (resolvePage3 = r));

        // user1 and user3 will wait for message
        await page1.exposeFunction("notifyMessageReceived", () => resolvePage1());
        await page3.exposeFunction("notifyMessageReceived", () => resolvePage3());

        // --- STEP 1: U1 Creates Room & listens for events ---
        await test.step("User 1: Create Room, Join, Wait for 'new streams' events", async () => {
            roomId = await page1.evaluate(
                async ({ contextId, users, StreamEventSelectorType, StreamEventType }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 1");
                    const api = window.streamApi;
                    const usersList = [
                        { userId: users.u1.id, pubKey: users.u1.pubKey },
                        { userId: users.u2.id, pubKey: users.u2.pubKey },
                        { userId: users.u3.id, pubKey: users.u3.pubKey },
                    ];

                    const sId = await api.createStreamRoom(
                        contextId,
                        usersList,
                        usersList,
                        new Uint8Array(),
                        new Uint8Array(),
                    );

                    await api.joinStreamRoom(sId);

                    await api.subscribeFor([
                        await api.buildSubscriptionQuery(
                            StreamEventType.STREAMROOM_UPDATE,
                            StreamEventSelectorType.STREAMROOM_ID,
                            sId,
                        ),
                        await api.buildSubscriptionQuery(
                            StreamEventType.STREAMROOM_DELETE,
                            StreamEventSelectorType.STREAMROOM_ID,
                            sId,
                        ),
                        await api.buildSubscriptionQuery(
                            StreamEventType.STREAM_PUBLISH,
                            StreamEventSelectorType.STREAMROOM_ID,
                            sId,
                        ),
                        await api.buildSubscriptionQuery(
                            StreamEventType.STREAM_UNPUBLISH,
                            StreamEventSelectorType.STREAMROOM_ID,
                            sId,
                        ),
                        await api.buildSubscriptionQuery(
                            StreamEventType.STREAM_JOIN,
                            StreamEventSelectorType.STREAMROOM_ID,
                            sId,
                        ),
                        await api.buildSubscriptionQuery(
                            StreamEventType.STREAM_LEAVE,
                            StreamEventSelectorType.STREAMROOM_ID,
                            sId,
                        ),
                    ]);
                    const eventQueue = await window.Endpoint.getEventQueue();

                    if (!eventQueue) {
                        throw new Error("EventQueue not initialized.");
                    }

                    const w = window as any;

                    w.__eventCollector = {
                        events: [],
                        running: true,
                    };

                    const listenForEvents = async () => {
                        while (w.__eventCollector.running) {
                            try {
                                const event = await eventQueue.waitEvent();
                                w.__eventCollector.events.push(event);
                            } catch (e) {
                                console.error("event listener failed", e);
                                break;
                            }
                        }
                    };
                    void listenForEvents();

                    return sId;
                },
                { contextId, users, StreamEventType, StreamEventSelectorType },
            );
        });

        await test.step("U2: Join and Publish", async () => {
            const result = await page2.evaluate(
                async ({ roomId }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 2");
                    const api = window.streamApi;

                    await api.joinStreamRoom(roomId);

                    const handle = await api.createStream(roomId);

                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: true,
                    });
                    await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
                    const dataTrackId = await api.addStreamTrack(handle, {
                        createDataChannel: true,
                    });
                    await api.publishStream(handle);

                    return { dataTrackId, streamHandle: handle };
                },
                { roomId },
            );
            dataTrackId = result.dataTrackId;
            streamHandle = result.streamHandle;
        });

        await test.step("User 1: Wait for events", async () => {
            await expect
                .poll(
                    async () =>
                        await page1.evaluate(() => {
                            const w = window as any;
                            const events = w.__eventCollector?.events ?? [];
                            return (
                                events
                                    ?.filter((x: any) => x.type === "remoteStreamsChanged")
                                    .some((event: any) =>
                                        event?.data?.streams?.some((stream: any) =>
                                            stream?.tracks?.some(
                                                (track: any) => track?.type === "data",
                                            ),
                                        ),
                                    ) ?? false
                            );
                        }),
                    { timeout: 15_000 },
                )
                .toBe(true);
            const events = await page1.evaluate(() => {
                const w = window as any;
                return w.__eventCollector?.events ?? [];
            });
        });

        test.step("User 1: try to read from data stream", async () => {
            await page1.evaluate(
                async ({ roomId, testMessage }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 1");
                    const api = window.streamApi;

                    const streams = await api.listStreams(roomId);

                    const streamsWithDataTracks = streams.flatMap((stream) =>
                        stream.tracks
                            .filter((track) => track.type === "data")
                            .map((track) => ({
                                streamId: stream.id,
                                streamTrackId: track.mid,
                            })),
                    );

                    await api.subscribeToRemoteStreams(roomId, streamsWithDataTracks);
                    api.addRemoteStreamListener({
                        streamRoomId: roomId,
                        onRemoteData: (data, statusCode) => {
                            const msg = new TextDecoder().decode(data);
                            if (msg === testMessage && statusCode === 0) {
                                // @ts-ignore
                                window.notifyMessageReceived();
                            } else if (statusCode > 0) {
                                throw new Error("non-zero statusCode on decrypt");
                            }
                        },
                    });
                    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10000));
                },
                { roomId, testMessage },
            );
        });

        await test.step("User 3: try to read from data stream", async () => {
            await page3.evaluate(
                async ({ roomId, testMessage }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 3");
                    const api = window.streamApi;
                    await api.joinStreamRoom(roomId);
                    const streams = await api.listStreams(roomId);

                    const streamsWithDataTracks = streams.flatMap((stream) =>
                        stream.tracks
                            .filter((track) => track.type === "data")
                            .map((track) => ({
                                streamId: stream.id,
                                streamTrackId: track.mid,
                            })),
                    );

                    await api.subscribeToRemoteStreams(roomId, streamsWithDataTracks);
                    api.addRemoteStreamListener({
                        streamRoomId: roomId,
                        onRemoteData: (data, statusCode) => {
                            const msg = new TextDecoder().decode(data);
                            if (msg === testMessage && statusCode === 0) {
                                // @ts-ignore
                                window.notifyMessageReceived();
                            } else if (statusCode > 0) {
                                throw new Error("non-zero statusCode on decrypt");
                            }
                        },
                    });
                    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10000));
                },
                { roomId, testMessage },
            );
        });

        await test.step("User 2: try to send data to data stream", async () => {
            await page2.evaluate(
                async ({ dataTrackId, testMessage }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 2");
                    const api = window.streamApi;
                    await api.sendData(dataTrackId as any, new TextEncoder().encode(testMessage));
                },
                { dataTrackId, testMessage },
            );
        });

        await Promise.all([page1Event, page3Event]);
    });
});
