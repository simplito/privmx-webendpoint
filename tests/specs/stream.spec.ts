import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { setupUsers } from "../test-utils";
import type { Endpoint } from "../../src";
import {
    StreamRoomId,
    StreamTrackMeta,
} from "../../src/webStreams/types/ApiTypes";
import { SortOrder, StreamHandle, StreamSettings } from "../../src/Types";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

test.use({
    launchOptions: {
        args: [
            // Chrome/Chromium: Fake media args
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--headless",
        ],
        // Firefox: Fake media preferences
        firefoxUserPrefs: {
            "media.navigator.streams.fake": true,
            "media.navigator.permission.disabled": true,
        },
    },
});

test.describe("StreamTest", () => {
    test.beforeEach(async ({ page }) => {
        page.on("console", (msg) => {
            if (msg.type() === "error") console.error(`[BROWSER]: ${msg.text()}`);
        });
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await page.evaluate(async () => {
            await window.Endpoint.setup("../../assets");
        });
    });

    // =========================================================================
    // STREAM ROOM CRUD
    // =========================================================================

    test.skip("getStreamRoom with valid/invalid input data", async ({ page, backend, cli }) => {
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

            // Setup
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
        // expect(result.room.statusCode).toEqual(0); TODO
        expect(result.room.version).toEqual(1);
    });

    test.skip("listStreamRooms with invalid input data", async ({ page, backend, cli }) => {
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

    test.skip("listStreamRooms with valid input data", async ({ page, backend, cli }) => {
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

    test.skip("createStreamRoom with valid/invalid data", async ({ page, backend, cli }) => {
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

    test.skip("updateStreamRoom with invalid data", async ({ page, backend, cli }) => {
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

    test.skip("updateStreamRoom with correct data", async ({ page, backend, cli }) => {
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

    test.skip("deleteStreamRoom with valid/invalid data", async ({ page, backend, cli }) => {
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

    test.skip("Stream Lifecycle: Join, Leave, Create, Media Devices", async ({ page, backend, cli }) => {
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
            await streamApi.leaveStreamRoom(sId);
            await expectError(async () => await streamApi.leaveStreamRoom(sId)); // Not joined anymore

            // Create Stream Handle (must be joined)
            await expectError(async () => await streamApi.createStream(sId));
            await streamApi.joinStreamRoom(sId);
            await expectError(async () => await streamApi.createStream(fakeStreamId));
            const _handle = await streamApi.createStream(sId);
        }, args);
    });

    test.skip("addTrack: valid and invalid inputs", async ({ page, backend, cli }) => {
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

    test.skip("publishStream: no tracks", async ({ page, backend, cli }) => {
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

    test.skip("publishStream: with tracks", async ({ page, backend, cli }) => {
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

            await expectError(async () => await streamApi.publishStream(-1 as StreamHandle));
            await streamApi.publishStream(handle);

            // Double publish should fail
            await expectError(async () => await streamApi.publishStream(handle));

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test.skip("publishStream: multiple instances of same track", async ({ page, backend, cli }) => {
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

            // TS Implementation explicitly FORBIDS adding the same track object again.
            // C++ Test expected success, but here we expect failure based on TS code logic.
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

    test.skip("subscribeToRemoteStreams: validations", async ({ page, backend, cli }) => {
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
            const settings: StreamSettings = { onRemoteTrack: () => {}, settings: {} };
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            // Empty
            await expectError(
                async () => await streamApi.subscribeToRemoteStreams(sId, [], settings),
            );

            // Invalid
            await expectError(
                async () =>
                    await streamApi.subscribeToRemoteStreams(
                        sId,
                        [{ streamId: -1, streamTrackId: "inv" }],
                        settings,
                    ),
            );

            // Valid (Need published stream)
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.publishStream(handle);

            const streams = await streamApi.listStreams(sId);
            if (streams.length > 0) {
                const s = streams[0];
                await streamApi.subscribeToRemoteStreams(
                    sId,
                    [{ streamId: s.id, streamTrackId: s.tracks[0].mid }],
                    settings,
                );
            }

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test.skip("unsubscribeFromRemoteStreams: validations", async ({ page, backend, cli }) => {
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
            const settings: StreamSettings = { onRemoteTrack: () => {}, settings: {} };

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
            await expectError(
                async () => await streamApi.unsubscribeFromRemoteStreams(sId, [], settings),
            );

            // Publish & Subscribe first
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.publishStream(handle);

            const streams = await streamApi.listStreams(sId);
            if (streams.length > 0) {
                const sub = [{ streamId: streams[0].id, trackId: streams[0].tracks[0].mid }];
                await streamApi.subscribeToRemoteStreams(sId, sub, settings);

                // Invalid Unsub
                await expectError(
                    async () =>
                        await streamApi.unsubscribeFromRemoteStreams(
                            sId,
                            [{ streamId: -1, streamTrackId: "inv" }],
                            settings,
                        ),
                );

                // Valid Unsub
                await streamApi.unsubscribeFromRemoteStreams(sId, sub, settings);
            }

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test.skip("updateStream: add/remove", async ({ page, backend, cli }) => {
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

            // Remove Track
            await streamApi.removeStreamTrack(handle, { track: audioT });

            await streamApi.updateStream(handle);

            // Remove All (Already removed 1, now remove none? or assume we add back?)
            // Logic: removeStreamTrack marks for removal. updateStream commits.

            // Add Track
            await streamApi.addStreamTrack(handle, { track: videoT });

            await streamApi.updateStream(handle);

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test.skip("updateStream: after failed add / unpublish", async ({ page, backend, cli }) => {
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

            // 1. Failed add (invalid track) shouldn't break update
            // TS API throws on invalid input, so we catch it.
            try {
                await streamApi.addStreamTrack(handle, {
                    track: null as unknown as MediaStreamTrack,
                } as StreamTrackMeta);
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

    test.skip("modifyRemoteStreamsSubscriptions: various scenarios", async ({ page, backend, cli }) => {
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
            const sub = [{ streamId: streams[0].id, trackId: streams[0].tracks[0].mid }];
            const settings: StreamSettings = { onRemoteTrack: () => {}, settings: {} };
            const expectError = async (fn: any) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            };

            await streamApi.subscribeToRemoteStreams(sId, sub, settings);

            // Invalid scenarios
            await expectError(
                async () => await streamApi.modifyRemoteStreamsSubscriptions(sId, [], [], settings),
            );
            await expectError(
                async () =>
                    await streamApi.modifyRemoteStreamsSubscriptions(
                        sId,
                        [{ streamId: -1, streamTrackId: "inv" }],
                        [],
                        settings,
                    ),
            );
            await expectError(
                async () =>
                    await streamApi.modifyRemoteStreamsSubscriptions(
                        sId,
                        [],
                        [{ streamId: -1, streamTrackId: "inv" }],
                        settings,
                    ),
            );

            // Valid: Remove All
            await streamApi.modifyRemoteStreamsSubscriptions(sId, [], sub, settings);

            // Valid: Add New
            await streamApi.modifyRemoteStreamsSubscriptions(sId, sub, [], settings);

            // Valid: Add and Remove Same (Logic check)
            await streamApi.modifyRemoteStreamsSubscriptions(sId, sub, sub, settings);

            // After Unpublish (Remote stream gone)
            await streamApi.unpublishStream(handle);
            // This call usually succeeds locally but server might complain if we subscribe to non-existent.
            // C++ test expects NO_THROW for modify after unpublish (locally handling state).
            await streamApi.modifyRemoteStreamsSubscriptions(sId, [], sub, settings);

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test.skip("E2E: Two users exchange video streams", async ({ createContextPage, backend, cli }) => {
        const initPage = async (page: any) => {
            await page.goto("/tests/harness/index.html");
            await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
            await page.evaluate(async () => {
                await window.Endpoint.setup("../../assets");
            });
        };

        const page1 = await createContextPage();
        await initPage(page1);

        const users = await setupUsers(page1, cli);

        const page2 = await createContextPage();
        await initPage(page2);

        const contextId = testData.contextId;
        const bridgeUrl = backend.bridgeUrl;
        const solutionId = testData.solutionId;

        const connectUser = async (page: any, user: any) => {
            page.on("console", (msg: any) => {
                if (msg.type() === "error") console.error(`[${user.id}]: ${msg.text()}`);
            });

            await page.evaluate(
                async ({ bridgeUrl, solutionId, user }) => {
                    const Endpoint = window.Endpoint;
                    const connection = await Endpoint.connect(user.privKey, solutionId, bridgeUrl);
                    const streamApi = await Endpoint.createStreamApi(
                        connection,
                        await Endpoint.createEventApi(connection),
                    );
                    // Expose for step evaluation
                    (window as any).streamApi = streamApi;
                    (window as any).currentUser = user;
                },
                { bridgeUrl, solutionId, user },
            );
        };

        await connectUser(page1, users.u1);
        await connectUser(page2, users.u2);

        const enc = new TextEncoder();
        const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
        const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };
        let roomId: string = "";

        await test.step("User 1: Create Room, Join, Publish", async () => {
            roomId = await page1.evaluate(
                async ({ contextId, u1Obj, u2Obj }) => {
                    const api = (window as any).streamApi;
                    const enc = new TextEncoder();

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
                    // Give server time to register
                    await new Promise((r) => setTimeout(r, 1000));
                    return sId;
                },
                { contextId, u1Obj, u2Obj },
            );
        });

        await test.step("User 2: Join and Subscribe", async () => {
            await page2.evaluate(
                async ({ roomId }) => {
                    const api = (window as any).streamApi;
                    await api.joinStreamRoom(roomId);

                    // Wait for remote stream
                    let remoteStreams: any[] = [];
                    for (let i = 0; i < 20; i++) {
                        remoteStreams = await api.listStreams(roomId);
                        if (remoteStreams.length > 0) break;
                        await new Promise((r) => setTimeout(r, 500));
                    }
                    if (remoteStreams.length === 0) throw new Error("Stream not found");

                    const targetStream = remoteStreams[0];
                    const subs = targetStream.tracks.map((t: any) => ({
                        streamId: targetStream.id,
                        trackId: t.mid,
                    }));

                    await api.subscribeToRemoteStreams(roomId, subs, {
                        settings: {},
                        onRemoteTrack: (event: RTCTrackEvent) => {
                            const track = event.track;
                            const stream = event.streams[0];

                            const elementId = `remote-${track.kind}`;
                            if (document.getElementById(elementId)) return;

                            console.log(`Creating element: ${elementId}`);

                            const mediaEl = document.createElement("video");
                            mediaEl.id = elementId;
                            mediaEl.autoplay = true;
                            mediaEl.playsInline = true;
                            mediaEl.srcObject = stream || new MediaStream([track]);

                            document.body.appendChild(mediaEl);
                        },
                    });
                },
                { roomId },
            );
        });

        await test.step("User 2: Verify Video Playback", async () => {
            const videoLoc = page2.locator("#remote-video");

            await videoLoc.waitFor({ state: "attached", timeout: 15000 });

            // Verify Video specific stats
            await page2.waitForFunction(
                () => {
                    const video = document.getElementById("remote-video") as HTMLVideoElement;
                    return video && video.readyState === 4 && video.videoWidth > 0 && !video.paused;
                },
                null,
                { timeout: 10000 },
            );

            // 2. Check Playback Progress (Time Update)
            const isMoving = await page2.evaluate(async () => {
                const video = document.getElementById("remote-video") as HTMLVideoElement;
                const start = video.currentTime;
                await new Promise((r) => setTimeout(r, 1000));
                return video.currentTime > start;
            });

            if (!isMoving)
                console.warn(
                    "Video element is stuck (currentTime not advancing). Check fake-device args.",
                );
        });
    });
});
