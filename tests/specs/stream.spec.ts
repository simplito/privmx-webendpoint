import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { setupUsers } from "../test-utils";
import type { Endpoint, StreamApi, Types } from "../../src";
import { StreamRoomId, StreamTrackInit } from "../../src/webStreams/types/ApiTypes";
import { SortOrder, StreamHandle, StreamInfo } from "../../src/Types";
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

    // =========================================================================
    // STREAM ROOM CRUD
    // =========================================================================

    test("getStreamRoom with valid/invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const eventApi = await Endpoint.createEventApi(connection);
            const streamApi = await Endpoint.createStreamApi(connection, eventApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Invalid ID
            await expectError(async () => await streamApi.getStreamRoom(contextId as StreamRoomId));

            // Valid ID
            const room = await streamApi.getStreamRoom(sId);
            return { room, sId };
        }, args);

        expect(result.room.streamRoomId).toEqual(result.sId);
        expect(result.room.statusCode).toEqual(0);
        expect(result.room.version).toEqual(1);
    });

    test("listStreamRooms with invalid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const eventApi = await Endpoint.createEventApi(connection);
            const streamApi = await Endpoint.createStreamApi(connection, eventApi);
            const sId = await streamApi.createStreamRoom(
                contextId,
                [{ userId: users.u1.id, pubKey: users.u1.pubKey }],
                [{ userId: users.u1.id, pubKey: users.u1.pubKey }],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(
                async () =>
                    await streamApi.listStreamRooms(sId, { skip: 0, limit: 1, sortOrder: "desc" }),
            ); // Bad context
            await expectError(
                async () =>
                    await streamApi.listStreamRooms(contextId, {
                        skip: 0,
                        limit: -1,
                        sortOrder: "desc",
                    }),
            );
            await expectError(
                async () =>
                    await streamApi.listStreamRooms(contextId, {
                        skip: 0,
                        limit: 0,
                        sortOrder: "desc",
                    }),
            );
            // @ts-ignore
            await expectError(
                async () =>
                    await streamApi.listStreamRooms(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "invalid" as SortOrder,
                    }),
            );
            // @ts-ignore
            await expectError(
                async () =>
                    await streamApi.listStreamRooms(contextId, {
                        skip: 0,
                        limit: 1,
                        sortOrder: "desc",
                        lastId: contextId,
                    }),
            );
        }, args);
    });

    test("listStreamRooms with valid input data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const eventApi = await Endpoint.createEventApi(connection);
            const streamApi = await Endpoint.createStreamApi(connection, eventApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const ids: string[] = [];
            for (let i = 0; i < 3; i++) {
                ids.push(
                    await streamApi.createStreamRoom(
                        contextId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode(`p${i}`),
                        enc.encode(`p${i}`),
                    ),
                );
            }

            const list1 = await streamApi.listStreamRooms(contextId, {
                skip: 4,
                limit: 1,
                sortOrder: "desc",
            });
            const list2 = await streamApi.listStreamRooms(contextId, {
                skip: 0,
                limit: 1,
                sortOrder: "desc",
            });
            const list3 = await streamApi.listStreamRooms(contextId, {
                skip: 1,
                limit: 3,
                sortOrder: "asc",
            });

            return { list1, list2, list3, ids };
        }, args);

        expect(result.list1.readItems).toHaveLength(0);
        expect(result.list2.readItems).toHaveLength(1);
        expect(result.list2.readItems[0].streamRoomId).toEqual(result.ids[2]);
        expect(result.list3.readItems.length).toBeGreaterThanOrEqual(2);
    });

    test("createStreamRoom with valid/invalid data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const eventApi = await Endpoint.createEventApi(connection);
            const streamApi = await Endpoint.createStreamApi(connection, eventApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            // Diff users/managers
            const sId1 = await streamApi.createStreamRoom(
                contextId,
                [u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const r1 = await streamApi.getStreamRoom(sId1);

            // Same users/managers
            const sId2 = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const r2 = await streamApi.getStreamRoom(sId2);

            return { r1, r2 };
        }, args);

        expect(result.r1.users[0]).toEqual(users.u2.id);
        expect(result.r1.managers[0]).toEqual(users.u1.id);

        expect(result.r2.users[0]).toEqual(users.u1.id);
        expect(result.r2.managers[0]).toEqual(users.u1.id);
    });

    test("updateStreamRoom with invalid data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const eventApi = await Endpoint.createEventApi(connection);
            const streamApi = await Endpoint.createStreamApi(connection, eventApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(
                async () =>
                    await streamApi.updateStreamRoom(
                        "invalid" as StreamRoomId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await streamApi.updateStreamRoom(
                        sId,
                        [{ userId: u1Obj.userId, pubKey: u2Obj.pubKey }],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await streamApi.updateStreamRoom(
                        sId,
                        [u1Obj],
                        [{ userId: u1Obj.userId, pubKey: u2Obj.pubKey }],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await streamApi.updateStreamRoom(
                        sId,
                        [u1Obj],
                        [],
                        enc.encode("p"),
                        enc.encode("p"),
                        1,
                        false,
                        false,
                    ),
            );
            await expectError(
                async () =>
                    await streamApi.updateStreamRoom(
                        sId,
                        [u1Obj],
                        [u1Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                        99,
                        false,
                        false,
                    ),
            );
        }, args);
    });

    test("updateStreamRoom with correct data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const eventApi = await Endpoint.createEventApi(connection);
            const streamApi = await Endpoint.createStreamApi(connection, eventApi);
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            // New Users
            await streamApi.updateStreamRoom(
                sId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                1,
                false,
                false,
            );
            const r2 = await streamApi.getStreamRoom(sId);

            // New Managers
            await streamApi.updateStreamRoom(
                sId,
                [u1Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
                2,
                false,
                false,
            );
            const r3 = await streamApi.getStreamRoom(sId);

            // Less Users
            await streamApi.updateStreamRoom(
                sId,
                [u1Obj],
                [u1Obj, u2Obj],
                enc.encode("p"),
                enc.encode("p"),
                3,
                false,
                false,
            );
            const r4 = await streamApi.getStreamRoom(sId);

            // Force update
            await streamApi.updateStreamRoom(
                sId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
                99,
                true,
                false,
            );
            const r5 = await streamApi.getStreamRoom(sId);

            return { r2, r3, r4, r5 };
        }, args);

        expect(result.r2.users).toHaveLength(2);
        expect(result.r3.managers).toHaveLength(2);
        expect(result.r4.users).toHaveLength(1);
        expect(result.r5.version).toBe(5);
    });

    test("deleteStreamRoom with valid/invalid data", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(
                conn1,
                await Endpoint.createEventApi(conn1),
            );

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStreamApi(
                conn2,
                await Endpoint.createEventApi(conn2),
            );

            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const sId = await api1.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(async () => await api1.deleteStreamRoom(contextId as StreamRoomId));

            // Unauthorized delete (User 2)
            await expectError(async () => await api2.deleteStreamRoom(sId));

            // Valid Delete
            await api1.deleteStreamRoom(sId);
            await expectError(async () => await api1.getStreamRoom(sId));
        }, args);
    });

    // =========================================================================
    // STREAM HANDLE / TRACKS
    // =========================================================================

    test("Stream Lifecycle: Join, Leave, Create, Media Devices", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const connection2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const streamApi2 = await Endpoint.createStreamApi(
                connection2,
                await Endpoint.createEventApi(connection2),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            const fakeStreamId = contextId as StreamRoomId;

            // List Streams (Valid/Invalid)
            await expectError(async () => await streamApi.listStreams(fakeStreamId));
            await streamApi.listStreams(sId);

            // Join/Leave
            await expectError(async () => await streamApi.joinStreamRoom(fakeStreamId));
            await streamApi.joinStreamRoom(sId);
            await streamApi.joinStreamRoom(sId); // Idempotent check

            await expectError(async () => await streamApi.leaveStreamRoom(fakeStreamId));
            // U2 Joins for keepalive
            await streamApi2.joinStreamRoom(sId);
            await streamApi.leaveStreamRoom(sId);
            await expectError(async () => await streamApi.leaveStreamRoom(sId)); // Not joined anymore

            // Create Stream Handle (must be joined)
            await expectError(async () => await streamApi.createStream(sId));
            await streamApi.joinStreamRoom(sId);
            await expectError(async () => await streamApi.createStream(fakeStreamId));
            const _handle = await streamApi.createStream(sId);
        }, args);
    });

    test("addTrack: valid and invalid inputs", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const handle = await streamApi.createStream(sId);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            const audioTrack = stream.getAudioTracks()[0];
            const videoTrack = stream.getVideoTracks()[0];

            // Valid Track  s
            await expectError(
                async () =>
                    await streamApi.addStreamTrack(-1 as StreamHandle, { track: audioTrack }),
            );
            await streamApi.addStreamTrack(handle, { track: audioTrack });

            await expectError(
                async () =>
                    await streamApi.addStreamTrack(-1 as StreamHandle, { track: videoTrack }),
            );

            await streamApi.addStreamTrack(handle, { track: videoTrack });

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("publishStream: no tracks", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const handle = await streamApi.createStream(sId);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await expectError(async () => await streamApi.publishStream(-1 as StreamHandle));
            await expectError(async () => await streamApi.publishStream(handle)); // Handle with no tracks

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("publishStream: with tracks", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const handle = await streamApi.createStream(sId);
            const expectError = async (action: string, fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error(`Expected error ${action}`);
            };

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });

            await expectError(
                "Publish stream with invalid handle",
                async () => await streamApi.publishStream(-1 as StreamHandle),
            );
            await streamApi.publishStream(handle);

            // Double publish should fail
            await expectError("Double publish", async () => await streamApi.publishStream(handle));

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("publishStream: to two different rooms", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);

            const handle = await streamApi.createStream(sId);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
            await streamApi.publishStream(handle);

            ///// ROOM 2 /////
            const sId2 = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId2);

            const handle2 = await streamApi.createStream(sId2);

            await streamApi.addStreamTrack(handle2, { track: stream.getAudioTracks()[0] });
            await streamApi.addStreamTrack(handle2, { track: stream.getVideoTracks()[0] });
            await streamApi.publishStream(handle2);

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("publishStream: on publish callback", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const handle = await streamApi.createStream(sId);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });

            const publishStates: string[] = [];

            await streamApi.publishStream(handle, (onStateChange) => {
                publishStates.push(onStateChange);
            });

            for (let retries = 0; retries < 3; ++retries) {
                if (publishStates.length === 0) {
                    await new Promise((r) => setTimeout(r, 3000));
                } else {
                    break;
                }
            }

            if (publishStates.length === 0) {
                throw new Error("Did not receive state change on publishStream() callback..");
            }
            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("publishStream: publish unpublish publish back using same handle", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;

            // Setup User 1 (The Publisher)
            const connection1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(
                connection1,
                await Endpoint.createEventApi(connection1),
            );
            // Setup User 2 (The Watcher/Publisher - keeps room alive)
            const connection2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStreamApi(
                connection2,
                await Endpoint.createEventApi(connection2),
            );

            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const sId = await api1.createStreamRoom(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj, u2Obj], // Made u2 a manager as well to ensure publish rights
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            // User 2 joins AND publishes to keep the room alive
            await api2.joinStreamRoom(sId);
            const u2Handle = await api2.createStream(sId);
            const u2Stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true,
            });
            await api2.addStreamTrack(u2Handle, { track: u2Stream.getAudioTracks()[0] });
            await api2.addStreamTrack(u2Handle, { track: u2Stream.getVideoTracks()[0] });
            await api2.publishStream(u2Handle);
            // User 1 operations
            await api1.joinStreamRoom(sId);
            const handle = await api1.createStream(sId);

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            await api1.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api1.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });

            // Publish
            await api1.publishStream(handle);
            await new Promise<void>((resolve) => setTimeout(resolve, 3000));

            // Unpublish
            await api1.unpublishStream(handle);

            // Expect Error when publishing on the same destroyed handle
            await expectError(async () => {
                await api1.publishStream(handle);
            });

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("publishStream: publish unpublish publish back using new handle", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(45000); // Give enough time for multiple 3s waits

        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;

            // Setup User 1
            const connection1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api1 = await Endpoint.createStreamApi(
                connection1,
                await Endpoint.createEventApi(connection1),
            );

            // Setup User 2 (The Watcher/Publisher)
            const connection2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const api2 = await Endpoint.createStreamApi(
                connection2,
                await Endpoint.createEventApi(connection2),
            );

            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const sId = await api1.createStreamRoom(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj, u2Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            // User 2 joins AND publishes to keep the room alive
            await api2.joinStreamRoom(sId);
            const u2Handle = await api2.createStream(sId);
            const u2Stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true,
            });
            await api2.addStreamTrack(u2Handle, { track: u2Stream.getAudioTracks()[0] });
            await api2.addStreamTrack(u2Handle, { track: u2Stream.getVideoTracks()[0] });
            await api2.publishStream(u2Handle);

            await api1.joinStreamRoom(sId);

            // --- FIRST HANDLE ---
            const handle1 = await api1.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            await api1.addStreamTrack(handle1, { track: stream.getAudioTracks()[0] });
            await api1.addStreamTrack(handle1, { track: stream.getVideoTracks()[0] });

            await api1.publishStream(handle1);
            await new Promise<void>((resolve) => setTimeout(resolve, 3000));
            await api1.unpublishStream(handle1);

            await api1.leaveStreamRoom(sId);
            await api1.joinStreamRoom(sId);

            // --- NEW HANDLE ---
            const handle2 = await api1.createStream(sId);
            await api1.addStreamTrack(handle2, { track: stream.getAudioTracks()[0] });
            await api1.addStreamTrack(handle2, { track: stream.getVideoTracks()[0] });

            await api1.publishStream(handle2);
            await new Promise<void>((resolve) => setTimeout(resolve, 3000));
            await api1.unpublishStream(handle2);

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("publishStream: multiple instances of same track", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const track = stream.getAudioTracks()[0];

            await streamApi.addStreamTrack(handle, { track: track });

            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };
            await expectError(async () => await streamApi.addStreamTrack(handle, { track: track }));

            await streamApi.publishStream(handle);
            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("subscribeToRemoteStreams: validations", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Empty
            await expectError(async () => await streamApi.subscribeToRemoteStreams(sId, []));

            // Invalid
            await expectError(
                async () =>
                    await streamApi.subscribeToRemoteStreams(sId, [
                        { streamId: -1, streamTrackId: "inv" },
                    ]),
            );

            // Valid (Need published stream)
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.publishStream(handle);

            const streams = await streamApi.listStreams(sId);
            if (streams.length > 0) {
                const s = streams[0];
                await streamApi.subscribeToRemoteStreams(sId, [
                    { streamId: s.id, streamTrackId: s.tracks[0].mid },
                ]);
            }

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("unsubscribeFromRemoteStreams: validations", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Empty
            await expectError(async () => await streamApi.unsubscribeFromRemoteStreams(sId, []));

            // Publish & Subscribe first
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.publishStream(handle);

            const streams = await streamApi.listStreams(sId);
            if (streams.length > 0) {
                const sub = [{ streamId: streams[0].id, trackId: streams[0].tracks[0].mid }];
                await streamApi.subscribeToRemoteStreams(sId, sub);

                // Invalid Unsub
                await expectError(
                    async () =>
                        await streamApi.unsubscribeFromRemoteStreams(sId, [
                            { streamId: -1, streamTrackId: "inv" },
                        ]),
                );

                // Valid Unsub
                await streamApi.unsubscribeFromRemoteStreams(sId, sub);
            }

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("updateStream: add/remove", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            const audioT = stream.getAudioTracks()[0];
            const videoT = stream.getVideoTracks()[0];

            await streamApi.addStreamTrack(handle, { track: audioT });
            await streamApi.publishStream(handle);

            await streamApi.removeStreamTrack(handle, { track: audioT });

            await streamApi.updateStream(handle);

            await streamApi.addStreamTrack(handle, { track: videoT });

            await streamApi.updateStream(handle);

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("updateStream: after failed add / unpublish", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioT = stream.getAudioTracks()[0];
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await streamApi.addStreamTrack(handle, { track: audioT });
            await streamApi.publishStream(handle);
            await new Promise((resolve) => setTimeout(resolve, 3000));

            try {
                await streamApi.addStreamTrack(handle, {
                    track: null as unknown as MediaStreamTrack,
                } as StreamTrackInit);
            } catch {}
            await streamApi.updateStream(handle);

            // 2. Update after Unpublish (Should Fail)
            await streamApi.unpublishStream(handle);

            // Try to add track to unpublished stream -> Fail
            await expectError(
                async () => await streamApi.addStreamTrack(handle, { track: audioT }),
            );
            // Try to update unpublished stream -> Fail
            await expectError(async () => await streamApi.updateStream(handle));

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test.skip("modifyRemoteStreamsSubscriptions: various scenarios", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const streamApi = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const sId = await streamApi.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                new TextEncoder().encode("p"),
                new TextEncoder().encode("p"),
            );

            await streamApi.joinStreamRoom(sId);
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.publishStream(handle);

            const streams = await streamApi.listStreams(sId);
            if (streams.length === 0) return { success: true };
            const sub = [
                {
                    streamId: streams[0].id,
                    trackId: streams[0].tracks[0].mid,
                    onRemoteTrack: () => {},
                },
            ];
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await streamApi.subscribeToRemoteStreams(sId, sub);

            // Invalid scenarios
            await expectError(
                async () => await streamApi.modifyRemoteStreamsSubscriptions(sId, [], []),
            );
            await expectError(
                async () =>
                    await streamApi.modifyRemoteStreamsSubscriptions(
                        sId,
                        [{ streamId: -1, streamTrackId: "inv" }],
                        [],
                    ),
            );
            await expectError(
                async () =>
                    await streamApi.modifyRemoteStreamsSubscriptions(
                        sId,
                        [],
                        [{ streamId: -1, streamTrackId: "inv" }],
                    ),
            );

            // Valid: Remove All
            await streamApi.modifyRemoteStreamsSubscriptions(sId, [], sub);

            // Valid: Add New
            await streamApi.modifyRemoteStreamsSubscriptions(sId, sub, []);

            // Valid: Add and Remove Same (Logic check)
            await streamApi.modifyRemoteStreamsSubscriptions(sId, sub, sub);

            // After Unpublish (Remote stream gone)
            await streamApi.unpublishStream(handle);

            await streamApi.modifyRemoteStreamsSubscriptions(sId, [], sub);

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test("E2E: Two users exchange video streams", async ({ createContextPage, backend, cli }) => {
        const page1 = await createContextPage();
        await initPage(page1);
        const users = await setupUsers(page1, cli);

        const page2 = await createContextPage();
        await initPage(page2);

        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        const contextId = testData.contextId;
        let roomId: StreamRoomId;

        // --- STEP 1: U1 Creates Room & Publishes ---
        await test.step("User 1: Create Room, Join, Publish", async () => {
            roomId = await page1.evaluate(
                async ({ contextId, users }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 1");
                    const api = window.streamApi;
                    const enc = new TextEncoder();

                    const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                    const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

                    const sId = await api.createStreamRoom(
                        contextId,
                        [u1Obj, u2Obj],
                        [u1Obj, u2Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    );

                    await api.joinStreamRoom(sId);
                    const handle = await api.createStream(sId);

                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: true,
                    });
                    await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
                    await api.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });

                    await api.publishStream(handle);
                    await new Promise((r) => setTimeout(r, 1000));
                    return sId;
                },
                { contextId, users },
            );
        });

        // --- STEP 2: U2 Subscribes ---
        await test.step("User 2: Join and Subscribe", async () => {
            await page2.evaluate(
                async ({ roomId }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 2");
                    const api = window.streamApi;

                    await api.joinStreamRoom(roomId);

                    let remoteStreams: any[] = [];
                    for (let i = 0; i < 20; i++) {
                        remoteStreams = await api.listStreams(roomId);
                        if (remoteStreams.length > 0) break;
                        await new Promise((r) => setTimeout(r, 500));
                    }
                    if (remoteStreams.length === 0) throw new Error("Stream not found");

                    const targetStream = remoteStreams[0];

                    const onRemoteTrack = (event: RTCTrackEvent) => {
                        const track = event.track;
                        const stream = event.streams[0];
                        const elementId = `remote-${track.kind}`;

                        if (document.getElementById(elementId)) return;

                        const mediaEl = document.createElement("video");
                        mediaEl.id = elementId;
                        mediaEl.autoplay = true;
                        mediaEl.playsInline = true;
                        mediaEl.srcObject = stream || new MediaStream([track]);
                        document.body.appendChild(mediaEl);
                    };

                    api.addRemoteStreamListener({
                        onRemoteStreamTrack: onRemoteTrack,
                        streamRoomId: roomId,
                    });
                    const subs = targetStream.tracks.map((t: any) => ({
                        streamId: targetStream.id,
                        streamTrackId: t.mid,
                    }));

                    await api.subscribeToRemoteStreams(roomId, subs);
                },
                { roomId },
            );
        });

        // --- STEP 3: Verify ---
        await test.step("User 2: Verify Video Playback", async () => {
            const videoLoc = page2.locator("#remote-video");
            await videoLoc.waitFor({ state: "attached", timeout: 15000 });

            await page2.waitForFunction(
                () => {
                    const video = document.getElementById("remote-video") as HTMLVideoElement;
                    return video && video.readyState === 4 && video.videoWidth > 0 && !video.paused;
                },
                null,
                { timeout: 10000 },
            );

            const isMoving = await page2.evaluate(async () => {
                const video = document.getElementById("remote-video") as HTMLVideoElement;
                const start = video.currentTime;
                await new Promise((r) => setTimeout(r, 1000));
                return video.currentTime > start;
            });

            if (!isMoving) throw new Error("Video stuck");
        });
    });

    test("E2E: Three users exchange video streams and expect remte streams callbacks separation", async ({
        createContextPage,
        backend,
        cli,
    }) => {
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

        // --- STEP 1: U1 Creates Room & Publishes ---
        await test.step("User 1: Create Room, Join, Publish", async () => {
            roomId = await page1.evaluate(
                async ({ contextId, users }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 1");
                    const api = window.streamApi;
                    const enc = new TextEncoder();

                    const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                    const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
                    const u3Obj = { userId: users.u3.id, pubKey: users.u3.pubKey };

                    const accessList = [u1Obj, u2Obj, u3Obj];

                    const sId = await api.createStreamRoom(
                        contextId,
                        accessList,
                        accessList,
                        enc.encode("p"),
                        enc.encode("p"),
                    );

                    await api.joinStreamRoom(sId);
                    const handle = await api.createStream(sId);

                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: true,
                    });
                    await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
                    await api.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });

                    await api.publishStream(handle);
                    await new Promise((r) => setTimeout(r, 1000));
                    return sId;
                },
                { contextId, users },
            );
        });

        // --- STEP 2: U2 publishes ---
        await test.step("User 2: Publishes", async () => {
            await page2.evaluate(
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
                    await api.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });

                    await api.publishStream(handle);
                    await new Promise((r) => setTimeout(r, 1000));
                },
                { roomId },
            );
        });

        await test.step("User 3: Join and Subscribe", async () => {
            await page3.evaluate(
                async ({ roomId }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 2");
                    const api = window.streamApi;

                    await api.joinStreamRoom(roomId);

                    let remoteStreams: any[] = [];
                    for (let i = 0; i < 20; i++) {
                        remoteStreams = await api.listStreams(roomId);
                        if (remoteStreams.length > 0) break;
                        await new Promise((r) => setTimeout(r, 500));
                    }
                    if (remoteStreams.length === 0) throw new Error("Stream not found");

                    let recvTracksFromUser: number[] = [];

                    const sub1 = {
                        streamId: remoteStreams[0].id,
                        onRemoteTrack: (event: RTCTrackEvent) => recvTracksFromUser.push(1),
                    };
                    const sub2 = {
                        streamId: remoteStreams[1].id,
                        onRemoteTrack: (event: RTCTrackEvent) => recvTracksFromUser.push(2),
                    };
                    await api.subscribeToRemoteStreams(roomId, [sub1, sub2]);
                    await new Promise((r) => setTimeout(r, 5000));
                    // test
                    if (recvTracksFromUser.length > 1) {
                        if (new Set(recvTracksFromUser).size < 2) {
                            throw new Error("Just one callback fired on two subscriptions");
                        }
                    }
                },
                { roomId },
            );
        });
    });

    test("E2E: Renegotiation - Add Video Mid-Call", async ({ createContextPage, backend, cli }) => {
        const page1 = await createContextPage();
        const page2 = await createContextPage();

        const initPage = async (p: any) => {
            await p.goto("/tests/harness/index.html");
            await p.waitForFunction(() => window.wasmReady === true);
            await p.evaluate(async () => {
                try {
                    await window.Endpoint.setup("../../assets");
                } catch {}
            });
        };
        await initPage(page1);
        await initPage(page2);

        const users = await setupUsers(page1, cli);
        const { u1, u2 } = users;

        const connect = async (page: any, user: any) => {
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
                    const conn = await window.Endpoint.connect(user.privKey, solutionId, bridgeUrl);
                    const streamApi = await window.Endpoint.createStreamApi(
                        conn,
                        await window.Endpoint.createEventApi(conn),
                    );
                    window.streamApi = streamApi;
                },
                { bridgeUrl: backend.bridgeUrl, solutionId: testData.solutionId, user },
            );
        };
        await connect(page1, u1);
        await connect(page2, u2);

        let roomId: StreamRoomId;

        // --- STEP 1: U1 Publishes AUDIO ONLY ---
        await test.step("Phase 1: Audio Only", async () => {
            roomId = await page1.evaluate(
                async ({ contextId, u1, u2 }) => {
                    const api = window.streamApi!;
                    const enc = new TextEncoder();
                    const u1Obj = { userId: u1.id, pubKey: u1.pubKey };
                    const u2Obj = { userId: u2.id, pubKey: u2.pubKey };

                    const sId = await api.createStreamRoom(
                        contextId,
                        [u1Obj, u2Obj],
                        [u1Obj, u2Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    );
                    await api.joinStreamRoom(sId);
                    const handle = await api.createStream(sId);

                    window.myHandle = handle;

                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: false,
                    });
                    await api.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
                    await api.publishStream(handle);
                    return sId;
                },
                { contextId: testData.contextId, u1, u2 },
            );
        });

        // --- STEP 2: U2 Subscribes ---
        await test.step("Phase 2: Subscribe to Audio", async () => {
            await page2.evaluate(
                async ({ roomId }) => {
                    const api = window.streamApi!;
                    await api.joinStreamRoom(roomId);

                    let remote: StreamInfo[] = [];
                    for (let i = 0; i < 10; i++) {
                        remote = await api.listStreams(roomId);
                        if (remote.length > 0) break;
                        await new Promise((r) => setTimeout(r, 500));
                    }

                    const onRemoteTrack = (event: RTCTrackEvent) => {
                        const el = document.createElement(
                            event.track.kind === "video" ? "video" : "audio",
                        );
                        el.id = `remote-${event.track.kind}`;
                        el.autoplay = true;
                        if (event.streams[0]) el.srcObject = event.streams[0];
                        else el.srcObject = new MediaStream([event.track]);
                        document.body.appendChild(el);
                    };

                    const s = remote[0];

                    api.addRemoteStreamListener({
                        onRemoteStreamTrack: onRemoteTrack,
                        streamRoomId: roomId,
                    });
                    const subs = s.tracks
                        .filter((x) => x.type === "audio")
                        .map((t) => ({ streamId: s.id, streamTrackId: t.mid }));
                    await api.subscribeToRemoteStreams(roomId, subs);
                },
                { roomId },
            );

            await page2.locator("#remote-audio").waitFor({ state: "attached" });
            await expect(page2.locator("#remote-video")).toHaveCount(0);
        });

        // --- STEP 3: U1 Adds Video (Renegotiation) ---
        await test.step("Phase 3: Add Video Track", async () => {
            await page1.evaluate(async () => {
                const api = window.streamApi!;

                if (window.myHandle === undefined) throw new Error("Handle lost (undefined)");

                const handle = window.myHandle;

                const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const vTrack = vStream.getVideoTracks()[0];

                await api.addStreamTrack(handle, { track: vTrack });
                await api.updateStream(handle);
            });
            await page1.waitForTimeout(2000);
        });

        // --- STEP 4: U2 Updates Subscription ---
        await test.step("Phase 4: Receive Video", async () => {
            await page2.evaluate(
                async ({ roomId }) => {
                    const api = window.streamApi!;

                    const remote = await api.listStreams(roomId);
                    const vTrack = remote[0].tracks.find((t: any) => t.type === "video");

                    const onRemoteTrack = (e: any) => {
                        const el = document.createElement("video");
                        el.id = "remote-video-2";
                        el.autoplay = true;
                        el.srcObject = e.streams[0] || new MediaStream([e.track]);
                        document.body.appendChild(el);
                    };

                    api.addRemoteStreamListener({
                        onRemoteStreamTrack: onRemoteTrack,
                        streamRoomId: roomId,
                        streamId: remote[0].id as Types.StreamId,
                    });

                    if (vTrack) {
                        await api.modifyRemoteStreamsSubscriptions(
                            roomId,
                            [{ streamId: remote[0].id, streamTrackId: vTrack.mid }],
                            [],
                        );
                    }
                },
                { roomId },
            );

            const vid = page2.locator("#remote-video-2");
            await vid.waitFor({ state: "attached", timeout: 10000 });

            await page2.waitForFunction(() => {
                const v = document.getElementById("remote-video-2") as HTMLVideoElement;
                return v && v.readyState === 4 && v.videoWidth > 0 && !v.paused;
            });
        });
    });

    test("E2E: Edge Case - Page Reload & Recovery", async ({ createContextPage, backend, cli }) => {
        test.setTimeout(90000);

        const page1 = await createContextPage();
        const page2 = await createContextPage();

        await initPage(page1);
        await initPage(page2);

        const users = await setupUsers(page1, cli);

        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        // --- STEP 1: INITIAL CALL ---
        const roomId = await page1.evaluate(
            async ({ contextId, users }) => {
                const api = window.streamApi!;
                const enc = new TextEncoder();
                const uObjs = [users.u1, users.u2].map((u: any) => ({
                    userId: u.id,
                    pubKey: u.pubKey,
                }));

                const sId = await api.createStreamRoom(
                    contextId,
                    uObjs,
                    uObjs,
                    enc.encode("p"),
                    enc.encode("p"),
                );
                await api.joinStreamRoom(sId);
                const handle = await api.createStream(sId);
                const s = await navigator.mediaDevices.getUserMedia({ video: true });
                await api.addStreamTrack(handle, { track: s.getVideoTracks()[0] });
                await api.publishStream(handle);
                return sId;
            },
            { contextId: testData.contextId, users },
        );

        // --- STEP 2: U2 Subscribes AND Publishes (Keep-Alive) ---
        const { oldStreamId, initialStreamIds } = await page2.evaluate(
            async ({ roomId }) => {
                const api = window.streamApi!;
                await api.joinStreamRoom(roomId);

                // 1. Wait for U1's stream (Since U2 hasn't published yet, it's the only one)
                let remote: any[] = [];
                while (remote.length === 0) {
                    remote = await api.listStreams(roomId);
                    await new Promise((r) => setTimeout(r, 200));
                }

                const firstStream = remote[0];
                const onRemoteTrack = (e: RTCTrackEvent) => {
                    let v = document.getElementById("remote-video") as HTMLVideoElement;
                    if (!v) {
                        v = document.createElement("video");
                        v.id = "remote-video";
                        v.autoplay = true;
                        v.playsInline = true;
                        document.body.appendChild(v);
                    }
                    v.srcObject = e.streams[0];
                };

                api.addRemoteStreamListener({
                    onRemoteStreamTrack: onRemoteTrack,
                    streamRoomId: roomId,
                    streamId: firstStream.id as Types.StreamId,
                });
                await api.subscribeToRemoteStreams(roomId, [
                    { streamId: firstStream.id, streamTrackId: firstStream.tracks[0].mid },
                ]);

                // 3. User 2 PUBLISHES to keep the room alive during U1's crash/reload
                const u2Handle = await api.createStream(roomId);
                const u2Stream = await navigator.mediaDevices.getUserMedia({ video: true });
                await api.addStreamTrack(u2Handle, { track: u2Stream.getVideoTracks()[0] });
                await api.publishStream(u2Handle);

                // 4. Record all stream IDs so we know what to ignore in Step 5
                let allStreams = await api.listStreams(roomId);
                while (allStreams.length < 2) {
                    allStreams = await api.listStreams(roomId);
                    await new Promise((r) => setTimeout(r, 200));
                }

                return {
                    oldStreamId: firstStream.id,
                    initialStreamIds: allStreams.map((s) => s.id),
                };
            },
            { roomId },
        );

        await page2.locator("#remote-video").waitFor({ state: "attached" });

        // --- STEP 3: RELOAD USER 1 ---
        // Room stays alive because User 2 is actively publishing
        await page1.reload();
        await initPage(page1);
        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);

        // --- STEP 4: RE-PUBLISH ---
        await page1.evaluate(
            async ({ roomId }) => {
                const api = window.streamApi!;
                await api.joinStreamRoom(roomId);
                const handle = await api.createStream(roomId);
                const s = await navigator.mediaDevices.getUserMedia({ video: true });
                await api.addStreamTrack(handle, { track: s.getVideoTracks()[0] });
                await api.publishStream(handle);
                await new Promise((r) => setTimeout(r, 2000));
            },
            { roomId },
        );

        // --- STEP 5: VERIFY RECOVERY ---
        const expectedNewStreamId = await page2.evaluate(
            async ({ roomId, initialStreamIds }) => {
                const api = window.streamApi!;

                let newStream: any;
                for (let i = 0; i < 60; i++) {
                    const streams = await api.listStreams(roomId);
                    newStream = streams.find((s: any) => !initialStreamIds.includes(s.id));
                    if (newStream) break;
                    await new Promise((r) => setTimeout(r, 500));
                }
                const onRemoteTrack = (e: RTCTrackEvent) => {
                    let v = document.getElementById("remote-video") as HTMLVideoElement;
                    if (!v) {
                        v = document.createElement("video");
                        v.id = "remote-video";
                        v.autoplay = true;
                        v.playsInline = true;
                        document.body.appendChild(v);
                    }
                    v.srcObject = e.streams[0];
                };
                if (!newStream) throw new Error("New stream never appeared");
                api.addRemoteStreamListener({
                    onRemoteStreamTrack: onRemoteTrack,
                    streamRoomId: roomId,
                    streamId: newStream.id as Types.StreamId,
                });
                await api.subscribeToRemoteStreams(roomId, [
                    { streamId: newStream.id, streamTrackId: newStream.tracks[0].mid },
                ]);
                return newStream.id;
            },
            { roomId, initialStreamIds },
        );

        await page2.waitForFunction(
            (expectedIdNum) => {
                const v = document.getElementById("remote-video") as HTMLVideoElement;

                if (!v || !v.srcObject) return false;

                const currentStreamId = (v.srcObject as MediaStream).id;
                const expectedIdStr = String(expectedIdNum);
                return currentStreamId === expectedIdStr && v.readyState === 4 && !v.paused;
            },
            expectedNewStreamId,
            { timeout: 30000 },
        );
    });

    test("E2E: Edge Case - Zombie Publisher (Abrupt Close)", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        const page1 = await createContextPage();
        const page2 = await createContextPage();

        await initPage(page1);
        await initPage(page2);
        const users = await setupUsers(page1, cli);

        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        // U1 Publishes
        const roomId = await page1.evaluate(
            async ({ contextId, users }) => {
                const api = window.streamApi!;
                const enc = new TextEncoder();
                const uObjs = [users.u1, users.u2].map((u: any) => ({
                    userId: u.id,
                    pubKey: u.pubKey,
                }));

                const sId = await api.createStreamRoom(
                    contextId,
                    uObjs,
                    uObjs,
                    enc.encode("p"),
                    enc.encode("p"),
                );
                await api.joinStreamRoom(sId);
                const handle = await api.createStream(sId);
                const s = await navigator.mediaDevices.getUserMedia({ video: true });
                await api.addStreamTrack(handle, { track: s.getVideoTracks()[0] });
                await api.publishStream(handle);
                return sId;
            },
            { contextId: testData.contextId, users },
        );

        // U2 Subscribes
        await page2.evaluate(
            async ({ roomId }) => {
                const api = window.streamApi!;
                window.remoteTracksCount = 0;

                await api.joinStreamRoom(roomId);
                let remote: any[] = [];
                while (remote.length === 0) {
                    remote = await api.listStreams(roomId);
                    await new Promise((r) => setTimeout(r, 200));
                }

                const onRemoteTrack = (e: any) => {
                    if (window.remoteTracksCount !== undefined) window.remoteTracksCount++;

                    e.track.onended = () => {
                        window.trackEnded = true;
                    };
                };

                api.addRemoteStreamListener({
                    onRemoteStreamTrack: onRemoteTrack,
                    streamRoomId: roomId,
                    streamId: remote[0].id as Types.StreamId,
                });
                await api.subscribeToRemoteStreams(roomId, [
                    { streamId: remote[0].id, streamTrackId: remote[0].tracks[0].mid },
                ]);
            },
            { roomId },
        );

        await page2.waitForFunction(() => (window.remoteTracksCount || 0) > 0);

        await page1.close();

        // Verify Cleanup
        await page2.waitForFunction(
            async ({ roomId }) => {
                if (!window.streamApi) return false;
                const api = window.streamApi;
                const remote = await api.listStreams(roomId);
                const trackEnded = window.trackEnded === true;
                return remote.length === 0 || trackEnded;
            },
            { roomId },
            { timeout: 30000 },
        );
    });

    test("Stream Room Lifecycle: Auto-close after all users leave (Two Browsers)", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        // Extended timeout because we wait for server-side room closure (usually ~10-30s)
        test.setTimeout(60000);

        // 1. Setup Environment
        const page1 = await createContextPage();
        const page2 = await createContextPage();

        await initPage(page1);
        await initPage(page2);

        // 2. Setup Users & Connections
        // We use page1 to generate keys/users via CLI helper
        const users = await setupUsers(page1, cli);

        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        const contextId = testData.contextId;
        let roomId: StreamRoomId;

        // --- STEP 1: Create Room (User 1) ---
        roomId = await page1.evaluate(
            async ({ contextId, users }) => {
                const api = window.streamApi!;
                const enc = new TextEncoder();

                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

                const sId = await api.createStreamRoom(
                    contextId,
                    [u1Obj, u2Obj],
                    [u1Obj],
                    enc.encode("LifecycleTest"),
                    enc.encode("LifecycleTest"),
                );

                // Verify initial state
                const room = await api.getStreamRoom(sId);
                if (room.closed) throw new Error("Room should be initially OPEN");

                return sId;
            },
            { contextId, users },
        );

        // --- STEP 2: Join Both Users ---
        await test.step("Join Users", async () => {
            // User 1 Joins
            await page1.evaluate(
                async ({ roomId }) => {
                    await window.streamApi!.joinStreamRoom(roomId);
                },
                { roomId },
            );

            // User 2 Joins
            await page2.evaluate(
                async ({ roomId }) => {
                    await window.streamApi!.joinStreamRoom(roomId);
                },
                { roomId },
            );
        });

        // --- STEP 3: Publish Stream (User 1) ---
        // This ensures the room is "active" with media flowing
        await test.step("Publish Stream", async () => {
            await page1.evaluate(
                async ({ roomId }) => {
                    const api = window.streamApi!;
                    const handle = await api.createStream(roomId);
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
                    await api.publishStream(handle);
                },
                { roomId },
            );
        });

        // --- STEP 4: Both Users Leave ---
        await test.step("Leave Users", async () => {
            await page1.evaluate(
                async ({ roomId }) => {
                    await window.streamApi!.leaveStreamRoom(roomId);
                },
                { roomId },
            );

            await page2.evaluate(
                async ({ roomId }) => {
                    await window.streamApi!.leaveStreamRoom(roomId);
                },
                { roomId },
            );
        });

        // --- STEP 5: Wait & Verify Closure ---
        await test.step("Verify Room Closure", async () => {
            // We use page1 to poll status (assuming API client is still valid after leave)
            // If strictly disconnected, we might need a fresh connection or check via HTTP if available.
            // Assuming `getStreamRoom` works without being inside the room (which is standard).
            const isClosed = await page1.evaluate(
                async ({ roomId }) => {
                    const api = window.streamApi!;
                    const start = Date.now();

                    // Poll for up to 30 seconds
                    while (Date.now() - start < 30000) {
                        try {
                            const room = await api.getStreamRoom(roomId);
                            if (room.closed) {
                                return true;
                            }
                        } catch (e) {
                            console.warn("Error fetching room info:", e);
                        }
                        // Wait 2s between checks
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                    return false;
                },
                { roomId },
            );

            if (!isClosed) {
                throw new Error(`Room ${roomId} did not close automatically within 30 seconds.`);
            }
        });
    });

    test("Security: Room lifecycle (Active -> Abandoned -> Closed) enforces locks", async ({
        page,
        backend,
        cli,
    }) => {
        // Increase timeout to accommodate server-side auto-close delay (usually ~15s)
        test.setTimeout(60000);

        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;

            // --- HELPER: Expect Action to Fail ---
            const expectFailure = async (actionName: string, promise: Promise<any>) => {
                try {
                    await promise;
                } catch {
                    return;
                }
                throw new Error(`[FAIL] ${actionName} SUCCEEDED but should have been BLOCKED.`);
            };

            // 1. Setup & Connect
            const conn = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api = await Endpoint.createStreamApi(conn, await Endpoint.createEventApi(conn));
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            // 2. Create Room
            const sId = await api.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("lifecycle-test"),
                enc.encode("lifecycle-test"),
            );

            // 3. Make it ACTIVE (Publish Stream)
            await api.joinStreamRoom(sId);

            const handle = await api.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
            await api.publishStream(handle);

            // Wait a moment to ensure server registers the activity
            await new Promise((r) => setTimeout(r, 2000));

            // 4. Abandon Room (Leave)
            await api.leaveStreamRoom(sId);

            // 5. Wait for Server Auto-Close (Polling)
            const start = Date.now();
            let isClosed = false;

            // Wait up to 45s for the background job to run
            while (Date.now() - start < 45000) {
                const room = await api.getStreamRoom(sId);
                if (room.closed) {
                    isClosed = true;
                    break;
                }
                await new Promise((r) => setTimeout(r, 2000));
            }

            if (!isClosed)
                throw new Error("Timeout: Room did not close automatically after being abandoned.");

            // =========================================================
            // 6. VERIFY SECURITY LOCKS (The "Restricted Actions")
            // =========================================================

            // A. Attempt to LIST STREAMS (Explicit check in server code)
            await expectFailure("List Streams", api.listStreams(sId));

            // B. Attempt to JOIN (The gatekeeper for Publish/Subscribe)
            // Server: ensureActiveStreamRoom -> throws STREAM_ROOM_CLOSED
            await expectFailure("Join Room", api.joinStreamRoom(sId));

            // C. Attempt to SUBSCRIBE (Direct call check)
            // Server: subscribeToRemoteStreams -> ensureActiveStreamRoom -> throws STREAM_ROOM_CLOSED
            // We pass dummy args just to hit the server check
            await expectFailure("Subscribe", api.subscribeToRemoteStreams(sId, []));

            // Note: We cannot test "Publish" directly here because `publishStream` requires
            // a valid `handle` from `createStream`, which requires `joinStreamRoom` to succeed first.
            // Since `joinStreamRoom` fails (Test B), `publishStream` is effectively unreachable
            // and thus secured.

            return { success: true };
        }, args);
    });

    test("Stream Room Cleanup: Independent closure of multiple rooms (Single User)", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(90000); // Generous timeout for multiple server-side sweeps

        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api = await Endpoint.createStreamApi(conn, await Endpoint.createEventApi(conn));
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const createAndActivateRoom = async (name: string) => {
                const sId = await api.createStreamRoom(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode(name),
                    enc.encode(name),
                );
                await api.joinStreamRoom(sId);
                const handle = await api.createStream(sId);
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
                await api.publishStream(handle);
                return sId;
            };

            // 1. Create 3 distinct rooms
            const roomA = await createAndActivateRoom("Room-A-To-Close");
            const roomB = await createAndActivateRoom("Room-B-To-Close");
            const roomC = await createAndActivateRoom("Room-C-To-Keep");

            // Wait a moment for server to register all publishers
            await new Promise((r) => setTimeout(r, 2000));

            // 2. Abandon Room A and Room B, but stay in Room C
            await api.leaveStreamRoom(roomA);
            await api.leaveStreamRoom(roomB);

            // 3. Poll for cleanup (Wait up to 45s)
            const start = Date.now();
            let aClosed = false;
            let bClosed = false;

            while (Date.now() - start < 45000) {
                const rA = await api.getStreamRoom(roomA);
                const rB = await api.getStreamRoom(roomB);

                if (rA.closed) aClosed = true;
                if (rB.closed) bClosed = true;

                if (aClosed && bClosed) break;

                await new Promise((r) => setTimeout(r, 2000));
            }

            if (!aClosed || !bClosed) {
                throw new Error(
                    `Timeout: Failed to close target rooms. Room A closed: ${aClosed}, Room B closed: ${bClosed}`,
                );
            }

            // 4. Verify Room C is still OPEN
            const rC = await api.getStreamRoom(roomC);
            if (rC.closed) {
                throw new Error(
                    "FAIL: Room C was closed by the server, but it should have remained open!",
                );
            }

            return true;
        }, args);
    });
    test("Stream Room Cleanup: Room stays open until the LAST user leaves (Multi-User)", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        test.setTimeout(90000);

        const page1 = await createContextPage();
        const page2 = await createContextPage();

        await initPage(page1);
        await initPage(page2);

        const users = await setupUsers(page1, cli);
        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        let sharedRoomId: StreamRoomId;
        let controlRoomId: StreamRoomId;

        // --- STEP 1: U1 creates two rooms ---
        await test.step("Setup Rooms", async () => {
            const ids = await page1.evaluate(
                async ({ contextId, users }) => {
                    const api = window.streamApi!;
                    const enc = new TextEncoder();
                    const uObjs = [users.u1, users.u2].map((u: any) => ({
                        userId: u.id,
                        pubKey: u.pubKey,
                    }));

                    // Shared room (both will join)
                    const sId1 = await api.createStreamRoom(
                        contextId,
                        uObjs,
                        uObjs,
                        enc.encode("Shared"),
                        enc.encode("Shared"),
                    );
                    // Control room (only U2 will join)
                    const sId2 = await api.createStreamRoom(
                        contextId,
                        uObjs,
                        uObjs,
                        enc.encode("Control"),
                        enc.encode("Control"),
                    );

                    return { sharedRoomId: sId1, controlRoomId: sId2 };
                },
                { contextId: testData.contextId, users },
            );

            sharedRoomId = ids.sharedRoomId;
            controlRoomId = ids.controlRoomId;
        });

        // --- STEP 2: Join AND Publish logic ---
        await test.step("Populate Rooms (Both Users Publish)", async () => {
            // U1 joins and PUBLISHES in Shared Room
            await page1.evaluate(
                async ({ sharedRoomId }) => {
                    const api = window.streamApi!;
                    await api.joinStreamRoom(sharedRoomId);

                    const handle = await api.createStream(sharedRoomId);
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
                    await api.publishStream(handle);
                },
                { sharedRoomId },
            );

            // U2 joins and PUBLISHES in BOTH rooms
            await page2.evaluate(
                async ({ sharedRoomId, controlRoomId }) => {
                    const api = window.streamApi!;
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });

                    // 1. Publish to Shared Room
                    await api.joinStreamRoom(sharedRoomId);
                    const handleShared = await api.createStream(sharedRoomId);
                    await api.addStreamTrack(handleShared, { track: stream.getVideoTracks()[0] });
                    await api.publishStream(handleShared);

                    // 2. Publish to Control Room
                    await api.joinStreamRoom(controlRoomId);
                    const handleControl = await api.createStream(controlRoomId);
                    await api.addStreamTrack(handleControl, { track: stream.getVideoTracks()[0] });
                    await api.publishStream(handleControl);
                },
                { sharedRoomId, controlRoomId },
            );
        });

        // --- STEP 3: U1 Leaves Shared Room (Should NOT close) ---
        await test.step("User 1 leaves, Room stays open", async () => {
            await page1.evaluate(
                async ({ sharedRoomId }) => {
                    await window.streamApi!.leaveStreamRoom(sharedRoomId);
                },
                { sharedRoomId },
            );

            await page1.waitForTimeout(20000); // Give the 15s job time to run

            // Verify it is STILL OPEN because U2 is inside and publishing
            const isClosed = await page2.evaluate(
                async ({ sharedRoomId }) => {
                    return (await window.streamApi!.getStreamRoom(sharedRoomId)).closed;
                },
                { sharedRoomId },
            );

            if (isClosed)
                throw new Error("FAIL: Shared room closed prematurely while U2 was still inside!");
        });

        // --- STEP 4: U2 Leaves Shared Room (Should NOW close) ---
        await test.step("User 2 leaves, Room closes", async () => {
            await page2.evaluate(
                async ({ sharedRoomId }) => {
                    await window.streamApi!.leaveStreamRoom(sharedRoomId);
                },
                { sharedRoomId },
            );

            const isClosed = await page2.evaluate(
                async ({ sharedRoomId }) => {
                    const start = Date.now();
                    while (Date.now() - start < 30000) {
                        if ((await window.streamApi!.getStreamRoom(sharedRoomId)).closed)
                            return true;
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                    return false;
                },
                { sharedRoomId },
            );

            if (!isClosed)
                throw new Error("FAIL: Shared room did not close after the last user (U2) left.");
        });

        // --- STEP 5: Verify Control Room is untouched ---
        await test.step("Verify Control Room is still open", async () => {
            const isControlClosed = await page2.evaluate(
                async ({ controlRoomId }) => {
                    return (await window.streamApi!.getStreamRoom(controlRoomId)).closed;
                },
                { controlRoomId },
            );

            if (isControlClosed)
                throw new Error("FAIL: Control room was incorrectly closed by the cleanup job!");
        });
    });

    test("Stream Room Cleanup: Abrupt disconnect (hangup) triggers auto-close", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        test.setTimeout(90000);

        // --- SETUP ---
        const page1 = await createContextPage();
        await initPage(page1);
        const users = await setupUsers(page1, cli);

        // User connects on Device 1
        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);

        // --- STEP 1: Connect, Join, and Publish (Device 1) ---
        const roomId = await page1.evaluate(
            async ({ contextId, users }) => {
                const api = window.streamApi!;
                const enc = new TextEncoder();
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Create Room
                const sId = await api.createStreamRoom(
                    contextId,
                    [u1Obj],
                    [u1Obj],
                    enc.encode("HangupTest"),
                    enc.encode("HangupTest"),
                );

                // Join & Publish Media
                await api.joinStreamRoom(sId);
                const handle = await api.createStream(sId);
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
                await api.publishStream(handle);

                return sId;
            },
            { contextId: testData.contextId, users },
        );

        // Give the server a moment to fully register the publisher state
        await page1.waitForTimeout(2000);

        // --- STEP 2: Abrupt Hangup (Browser Crash/Close) ---
        // We close the page abruptly. NO leaveStreamRoom is called.
        // This drops the WebSocket connection instantly.
        await page1.close();

        // --- STEP 3: Reconnect & Verify (Device 2) ---
        // User opens a new tab or restarts the app
        const page2 = await createContextPage();
        await initPage(page2);

        await connectUserToBridge(page2, users.u1, backend.bridgeUrl, testData.solutionId);

        // --- STEP 4: Poll for server-side cleanup ---

        const isClosed = await page2.evaluate(
            async ({ roomId }) => {
                const api = window.streamApi!;
                const start = Date.now();

                // Poll for up to 20 seconds
                while (Date.now() - start < 20000) {
                    try {
                        const room = await api.getStreamRoom(roomId);
                        if (room.closed) {
                            return true;
                        }
                    } catch (e) {
                        console.warn("Error fetching room info:", e);
                    }
                    // Check every 2 seconds
                    await new Promise((r) => setTimeout(r, 2000));
                }
                return false;
            },
            { roomId },
        );

        if (!isClosed) {
            throw new Error(
                `Room ${roomId} did not close automatically after an abrupt disconnect within 45 seconds. The cleanup job may have failed.`,
            );
        }
    });

    test("Lifecycle: Graceful leave by multiple non-publishing users closes room", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        test.setTimeout(90000);

        const page1 = await createContextPage();
        const page2 = await createContextPage();
        const page3 = await createContextPage(); // Observer page

        await initPage(page1);
        await initPage(page2);
        await initPage(page3);

        const users = await setupUsers(page1, cli);
        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page3, users.u3, backend.bridgeUrl, testData.solutionId);

        let roomId: StreamRoomId;

        // 1. U1 creates the room
        await test.step("Create Room", async () => {
            roomId = await page1.evaluate(
                async ({ contextId, users }) => {
                    const api = window.streamApi!;
                    const uObjs = [users.u1, users.u2, users.u3].map((u: any) => ({
                        userId: u.id,
                        pubKey: u.pubKey,
                    }));

                    return await api.createStreamRoom(
                        contextId,
                        uObjs,
                        uObjs,
                        new TextEncoder().encode("GracefulLeave"),
                        new TextEncoder().encode("GracefulLeave"),
                    );
                },
                { contextId: testData.contextId, users },
            );
        });

        // 2. U1 and U2 Join (No Publishing)
        await test.step("Users Join", async () => {
            await page1.evaluate(
                async ({ roomId }) => await window.streamApi!.joinStreamRoom(roomId),
                { roomId },
            );
            await page2.evaluate(
                async ({ roomId }) => await window.streamApi!.joinStreamRoom(roomId),
                { roomId },
            );
        });

        // 3. U1 Leaves. Room should stay open because U2 is still there.
        await test.step("U1 Leaves, Room stays open", async () => {
            await page1.evaluate(
                async ({ roomId }) => await window.streamApi!.leaveStreamRoom(roomId),
                { roomId },
            );

            await page1.waitForTimeout(20000); // Give the 15s job time to run

            const isClosed = await page3.evaluate(
                async ({ roomId }) => (await window.streamApi!.getStreamRoom(roomId)).closed,
                { roomId },
            );

            if (isClosed)
                throw new Error("FAIL: Room closed prematurely while U2 was still inside!");
        });

        // 4. U2 Leaves. Room should now close.
        await test.step("U2 Leaves, Room closes", async () => {
            await page2.evaluate(
                async ({ roomId }) => await window.streamApi!.leaveStreamRoom(roomId),
                { roomId },
            );

            const isClosed = await page3.evaluate(
                async ({ roomId }) => {
                    const start = Date.now();
                    while (Date.now() - start < 30000) {
                        if ((await window.streamApi!.getStreamRoom(roomId)).closed) return true;
                        await new Promise((r) => setTimeout(r, 2000));
                    }
                    return false;
                },
                { roomId },
            );

            if (!isClosed)
                throw new Error("FAIL: Room did not close after the last user (U2) left.");
        });
    });

    test("Lifecycle: Abrupt tab close without publishing triggers auto-close", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        test.setTimeout(90000);

        const page1 = await createContextPage();
        const page2 = await createContextPage(); // Observer page

        await initPage(page1);
        await initPage(page2);

        const users = await setupUsers(page1, cli);
        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        // Create and Join (No Publish)
        const roomId = await page1.evaluate(
            async ({ contextId, users }) => {
                const api = window.streamApi!;
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

                const sId = await api.createStreamRoom(
                    contextId,
                    [u1Obj, u2Obj],
                    [u1Obj],
                    new TextEncoder().encode("AbruptClose"),
                    new TextEncoder().encode("AbruptClose"),
                );

                await api.joinStreamRoom(sId);
                return sId;
            },
            { contextId: testData.contextId, users },
        );

        await page1.waitForTimeout(2000); // Let server register the join

        // Abrupt Close
        await page1.close();

        // Poll from Observer
        const isClosed = await page2.evaluate(
            async ({ roomId }) => {
                const start = Date.now();
                while (Date.now() - start < 30000) {
                    const room = await window.streamApi!.getStreamRoom(roomId);
                    if (room.closed) return true;
                    await new Promise((r) => setTimeout(r, 2000));
                }
                return false;
            },
            { roomId },
        );

        if (!isClosed)
            throw new Error(
                "FAIL: Room did not auto-close after lurker's tab was abruptly closed.",
            );
    });

    test("Lifecycle: Page close triggers auto-close", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        test.setTimeout(30_000);

        const page1 = await createContextPage();
        const page2 = await createContextPage(); // Observer page

        await initPage(page1);
        await initPage(page2);

        const users = await setupUsers(page1, cli);
        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        // 1. Create and Join (No Publish)
        const roomId = await page1.evaluate(
            async ({ contextId, users }) => {
                const api = window.streamApi!;
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

                const sId = await api.createStreamRoom(
                    contextId,
                    [u1Obj, u2Obj],
                    [u1Obj],
                    new TextEncoder().encode("LidCloseTest"),
                    new TextEncoder().encode("LidCloseTest"),
                );

                await api.joinStreamRoom(sId);
                return sId;
            },
            { contextId: testData.contextId, users },
        );

        await page1.waitForTimeout(2000);

        // Simulate page close
        await page1.close();

        const isClosed = await page2.evaluate(
            async ({ roomId }) => {
                const start = Date.now();
                while (Date.now() - start < 30_000) {
                    const room = await window.streamApi!.getStreamRoom(roomId);
                    if (room.closed) return true;
                    await new Promise((r) => setTimeout(r, 3000));
                }
                return false;
            },
            { roomId },
        );

        if (!isClosed) {
            throw new Error("FAIL: Room did not auto-close after lurker lost network connection.");
        }
    });

    test("E2E: invalid subscription", async ({ createContextPage, backend, cli }) => {
        const page1 = await createContextPage();
        await initPage(page1);
        const users = await setupUsers(page1, cli);

        const page2 = await createContextPage();
        await initPage(page2);

        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        const contextId = testData.contextId;
        let roomId: StreamRoomId;

        // --- STEP 1: U1 Creates Room & Publishes ---
        await test.step("User 1: Create Room, Join, Publish", async () => {
            roomId = await page1.evaluate(
                async ({ contextId, users }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 1");
                    const api = window.streamApi;
                    const enc = new TextEncoder();

                    const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                    const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

                    const sId = await api.createStreamRoom(
                        contextId,
                        [u1Obj, u2Obj],
                        [u1Obj, u2Obj],
                        enc.encode("p"),
                        enc.encode("p"),
                    );

                    await api.joinStreamRoom(sId);
                    const handle = await api.createStream(sId);

                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                        video: true,
                    });
                    await api.addStreamTrack(handle, { track: stream.getVideoTracks()[0] });
                    await api.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });

                    await api.publishStream(handle);
                    await new Promise((r) => setTimeout(r, 1000));
                    return sId;
                },
                { contextId, users },
            );
        });

        // --- STEP 2: U2 Subscribes ---
        await test.step("User 2: Join and invalid subscribe Subscribe, valid subscribe", async () => {
            await page2.evaluate(
                async ({ roomId }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 2");
                    const api = window.streamApi;

                    await api.joinStreamRoom(roomId);

                    let remoteStreams: any[] = [];
                    for (let i = 0; i < 20; i++) {
                        remoteStreams = await api.listStreams(roomId);
                        if (remoteStreams.length > 0) break;
                        await new Promise((r) => setTimeout(r, 500));
                    }
                    if (remoteStreams.length === 0) throw new Error("Stream not found");

                    const targetStream = remoteStreams[0];

                    const onRemoteTrack = (event: RTCTrackEvent) => {
                        const track = event.track;
                        const stream = event.streams[0];
                        const elementId = `remote-${track.kind}`;

                        if (document.getElementById(elementId)) return;

                        const mediaEl = document.createElement("video");
                        mediaEl.id = elementId;
                        mediaEl.autoplay = true;
                        mediaEl.playsInline = true;
                        mediaEl.srcObject = stream || new MediaStream([track]);
                        document.body.appendChild(mediaEl);
                    };

                    api.addRemoteStreamListener({
                        onRemoteStreamTrack: onRemoteTrack,
                        streamRoomId: roomId,
                    });
                    const invalidSubs = [{ streamId: 99, streamTrackId: "invalid" }];
                    const expectError = async (fn: any) => {
                        try {
                            await fn();
                        } catch {
                            return;
                        }
                        throw new Error("Expected error");
                    };
                    await expectError(
                        async () => await api.subscribeToRemoteStreams(roomId, invalidSubs),
                    );
                    const subs = targetStream.tracks.map((t: any) => ({
                        streamId: targetStream.id,
                        streamTrackId: t.mid,
                    }));
                    await api.subscribeToRemoteStreams(roomId, subs);
                },
                { roomId },
            );
        });
    });

    test("E2E: Two users exchange video streams - second expect to receive 'remoteStreamsChanged' event", async ({
        createContextPage,
        backend,
        cli,
    }) => {
        test.setTimeout(60_000);
        const page1 = await createContextPage();
        await initPage(page1);
        const users = await setupUsers(page1, cli);

        const page2 = await createContextPage();

        await initPage(page2);

        await connectUserToBridge(page1, users.u1, backend.bridgeUrl, testData.solutionId);
        await connectUserToBridge(page2, users.u2, backend.bridgeUrl, testData.solutionId);

        const contextId = testData.contextId;
        let roomId: StreamRoomId;

        // --- STEP 1: U1 Creates Room & Publishes ---
        await test.step("User 1: Create Room, Join, Wait for 'new streams' events", async () => {
            roomId = await page1.evaluate(
                async ({ contextId, users, StreamEventSelectorType, StreamEventType }) => {
                    if (!window.streamApi) throw new Error("StreamApi not ready on Page 1");
                    const api = window.streamApi;
                    const enc = new TextEncoder();

                    const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                    const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

                    const sId = await api.createStreamRoom(
                        contextId,
                        [u1Obj, u2Obj],
                        [u1Obj, u2Obj],
                        enc.encode("p"),
                        enc.encode("p"),
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

        // --- STEP 2: U2 Subscribes ---
        await test.step("User 2: Join and Publish", async () => {
            await page2.evaluate(
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
                    await api.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });

                    await api.publishStream(handle);
                },
                { roomId },
            );
        });

        await test.step("User 1: Wait for events", async () => {
            await expect
                .poll(
                    async () =>
                        await page1.evaluate((expectedType) => {
                            const w = window as any;
                            const events = w.__eventCollector?.events ?? [];
                            return events.some((e: any) => e.type === expectedType);
                        }, "remoteStreamsChanged"),
                    { timeout: 15_000 },
                )
                .toBe(true);
            const events = await page1.evaluate(() => {
                const w = window as any;
                return w.__eventCollector?.events ?? [];
            });
        });
    });
});
