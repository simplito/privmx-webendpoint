import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { setupUsers } from "../test-utils";
import type { Endpoint, StreamApi } from "../../src";
import { StreamRoomId, StreamTrackMeta } from "../../src/webStreams/types/ApiTypes";
import { SortOrder, StreamHandle } from "../../src/Types";

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
        page.on("console", (msg) => {
            console.error(`[BROWSER]: ${msg.text()}`);
        });
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

                window.streamApi = streamApi;
                window.currentUser = user;
            },
            { bridgeUrl, solutionId, user },
        );
    };

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

    test.skip("Stream Lifecycle: Join, Leave, Create, Media Devices", async ({
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

    test.fail("publishStream: to two different rooms", async ({ page, backend, cli }) => {
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


    test.skip("publishStream: publish unpublish publish back using same handle", async ({ page, backend, cli }) => {
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
            await new Promise<void>(resolve => setTimeout(() => {resolve()}, 3000));
            await streamApi.unpublishStream(handle);

            await expectError(async () => {
                await streamApi.publishStream(handle);
            });

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test.fail("publishStream: publish unpublish publish back using new handle", async ({ page, backend, cli }) => {
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
            await streamApi.publishStream(handle);
            await new Promise<void>(resolve => setTimeout(() => {resolve()}, 3000));
            await streamApi.unpublishStream(handle);
            
            // NEW HANDLE
            const handle2 = await streamApi.createStream(sId);
            await streamApi.addStreamTrack(handle2, { track: stream.getAudioTracks()[0] });
            await streamApi.addStreamTrack(handle2, { track: stream.getVideoTracks()[0] });
            await streamApi.publishStream(handle2);
            await new Promise<void>(resolve => setTimeout(() => {resolve()}, 3000));
            await streamApi.unpublishStream(handle2);

            return { success: true };
        }, args);

        expect(result.success).toBe(true);
    });

    test.skip("publishStream: on publish callback", async ({ page, backend, cli }) => {
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

            await streamApi.publishStream(handle, onStateChange => {
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
                async () => await streamApi.subscribeToRemoteStreams(sId, []),
            );

            // Invalid
            await expectError(
                async () =>
                    await streamApi.subscribeToRemoteStreams(
                        sId,
                        [{ streamId: -1, streamTrackId: "inv", onRemoteTrack: () => {} }],
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
                    [{ streamId: s.id, streamTrackId: s.tracks[0].mid, onRemoteTrack: () => {} }],
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
                async () => await streamApi.unsubscribeFromRemoteStreams(sId, []),
            );

            // Publish & Subscribe first
            const handle = await streamApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await streamApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await streamApi.publishStream(handle);

            const streams = await streamApi.listStreams(sId);
            if (streams.length > 0) {
                const sub = [{ streamId: streams[0].id, trackId: streams[0].tracks[0].mid, onRemoteTrack: () => {} }];
                await streamApi.subscribeToRemoteStreams(sId, sub);

                // Invalid Unsub
                await expectError(
                    async () =>
                        await streamApi.unsubscribeFromRemoteStreams(
                            sId,
                            [{ streamId: -1, streamTrackId: "inv" }],
                        ),
                );

                // Valid Unsub
                await streamApi.unsubscribeFromRemoteStreams(sId, sub);
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

            await streamApi.removeStreamTrack(handle, { track: audioT });

            await streamApi.updateStream(handle);

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
            const sub = [{ streamId: streams[0].id, trackId: streams[0].tracks[0].mid, onRemoteTrack: () => {} }];
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
                        [{ streamId: -1, streamTrackId: "inv", onRemoteTrack: () => {} }],
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

    test.skip("E2E: Two users exchange video streams", async ({
        createContextPage,
        backend,
        cli,
    }) => {
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

                    const subs = targetStream.tracks.map((t: any) => ({
                        streamId: targetStream.id,
                        trackId: t.mid,
                        onRemoteTrack: onRemoteTrack
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

            if (!isMoving) console.warn("Video stuck. Check fake-device args.");
        });
    });

    test.skip("E2E: Three users exchange video streams and expect remte streams callbacks separation", async ({
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
                        onRemoteTrack: (event: RTCTrackEvent) => recvTracksFromUser.push(1)    
                    };
                    const sub2 = {
                        streamId: remoteStreams[1].id,
                        onRemoteTrack: (event: RTCTrackEvent) => recvTracksFromUser.push(2)    
                    };
                    await api.subscribeToRemoteStreams(roomId, [sub1, sub2]);
                    await new Promise((r) => setTimeout(r, 5000))
                    // test
                    if (recvTracksFromUser.length > 1) {
                        if (new Set(recvTracksFromUser).size < 2) {
                            throw new Error("Just one callback fired on two subscriptions")
                        }
                    }

                },
                { roomId },
            );
        });        

    });



    test.skip("E2E: Renegotiation - Add Video Mid-Call", async ({
        createContextPage,
        backend,
        cli,
    }) => {
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
            page.on("console", (msg: any) => {
                if (msg.type() === "error") console.error(`[${user.id}]: ${msg.text()}`);
            });
            await page.evaluate(
                async ({ bridgeUrl, solutionId, user }) => {
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

                    let remote: any[] = [];
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
                    const subs = s.tracks.map((t: any) => ({ streamId: s.id, trackId: t.mid, onRemoteTrack: onRemoteTrack }));
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
                        el.id = "remote-video";
                        el.autoplay = true;
                        el.srcObject = e.streams[0] || new MediaStream([e.track]);
                        document.body.appendChild(el);
                    };

                    if (vTrack) {
                        await api.modifyRemoteStreamsSubscriptions(
                            roomId,
                            [{ streamId: remote[0].id, streamTrackId: vTrack.mid, onRemoteTrack }],
                            [],
                        );
                    }
                },
                { roomId },
            );

            const vid = page2.locator("#remote-video");
            await vid.waitFor({ state: "attached", timeout: 10000 });

            await page2.waitForFunction(() => {
                const v = document.getElementById("remote-video") as HTMLVideoElement;
                return v && v.readyState === 4 && v.videoWidth > 0 && !v.paused;
            });
        });
    });

    test.skip("E2E: Edge Case - Page Reload & Recovery", async ({
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

        // --- STEP 2: U2 Subscribes (Old Stream) ---
        const oldStreamId = await page2.evaluate(
            async ({ roomId }) => {
                const api = window.streamApi!;
                await api.joinStreamRoom(roomId);

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

                await api.subscribeToRemoteStreams(
                    roomId,
                    [{ streamId: firstStream.id, streamTrackId: firstStream.tracks[0].mid, onRemoteTrack }],
                );
                return firstStream.id;
            },
            { roomId },
        );

        await page2.locator("#remote-video").waitFor({ state: "attached" });

        // --- STEP 3: RELOAD USER 1 ---
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
            async ({ roomId, oldStreamId }) => {
                const api = window.streamApi!;

                let newStream: any;
                for (let i = 0; i < 60; i++) {
                    const streams = await api.listStreams(roomId);
                    newStream = streams.find((s: any) => s.id !== oldStreamId);
                    if (newStream) break;
                    await new Promise((r) => setTimeout(r, 500));
                }

                if (!newStream) throw new Error("New stream never appeared");

                await api.subscribeToRemoteStreams(
                    roomId,
                    [{ streamId: newStream.id, streamTrackId: newStream.tracks[0].mid, onRemoteTrack: () => {} }],
                );
                return newStream.id;
            },
            { roomId, oldStreamId },
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

    test.skip("E2E: Edge Case - Zombie Publisher (Abrupt Close)", async ({
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

                await api.subscribeToRemoteStreams(
                    roomId,
                    [{ streamId: remote[0].id, streamTrackId: remote[0].tracks[0].mid, onRemoteTrack: onRemoteTrack }],
                );
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
});
