import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as readline from "readline";
import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { setupUsers } from "../test-utils";
import type { Endpoint, StreamApi } from "../../src";

/**
 * Live E2E interop between the C++ SDK's DataChannel implementation and this repo's
 * browser/WASM implementation, over a real negotiated RTCDataChannel through the real
 * Bridge (via the existing `backend`/`cli` fixtures). Complements
 * DataChannelCryptorInterop.test.ts (wire-format-only, no network).
 *
 * Opt-in / dev-only: build `datachannel_interop_client` in privmx-endpoint first, then
 *   PRIVMX_ENDPOINT_NATIVE_BIN=/path/to/build/test/datachannel_interop_client \
 *     npx playwright test streamDataChannelsInterop
 */

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
        streamApi?: StreamApi;
        __dataTrackId?: unknown;
        __onNativeData?: (data: string, statusCode: number) => void;
    }
}

const NATIVE_BIN = process.env.PRIVMX_ENDPOINT_NATIVE_BIN;

test.use({
    launchOptions: {
        args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--headless"],
    },
});

test.describe("StreamDataChannels (native C++ <-> browser interop)", () => {
    test.skip(
        !NATIVE_BIN,
        "PRIVMX_ENDPOINT_NATIVE_BIN not set - build datachannel_interop_client in privmx-endpoint " +
            "and point this env var at the built binary",
    );

    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10_000 });
    });

    function spawnNative(args: string[]): ChildProcessWithoutNullStreams {
        return spawn(NATIVE_BIN!, args, { stdio: ["pipe", "pipe", "pipe"] });
    }

    // The native client's stdout carries both our sync markers ("PUBLISHED"/"READY"/
    // "RECV ...") and the C++ SDK's own verbose PRIVMX TRACE/DEBUG logger lines; only
    // wait for lines that match what we're looking for.
    function waitForLine(
        child: ChildProcessWithoutNullStreams,
        predicate: (line: string) => boolean,
        timeoutMs = 20_000,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const rl = readline.createInterface({ input: child.stdout });
            const timer = setTimeout(() => {
                rl.close();
                reject(new Error("Timed out waiting for expected line from native client"));
            }, timeoutMs);
            const onExit = (code: number | null) => {
                if (code !== 0 && code !== null) {
                    clearTimeout(timer);
                    rl.close();
                    reject(new Error(`native client exited with code ${code}`));
                }
            };
            rl.on("line", (line) => {
                if (predicate(line)) {
                    clearTimeout(timer);
                    child.off("exit", onExit);
                    rl.close();
                    resolve(line);
                }
            });
            child.on("exit", onExit);
        });
    }

    async function createTwoMemberRoom(
        page: any,
        backend: { bridgeUrl: string },
        users: Awaited<ReturnType<typeof setupUsers>>,
    ): Promise<string> {
        return page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users }: any) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const streamApi = await Endpoint.createStreamApi(
                    connection,
                    await Endpoint.createEventApi(connection),
                );
                window.streamApi = streamApi;

                const usersList = [
                    { userId: users.u1.id, pubKey: users.u1.pubKey },
                    { userId: users.u2.id, pubKey: users.u2.pubKey },
                ];
                return await streamApi.createStreamRoom(
                    contextId,
                    usersList,
                    usersList,
                    new Uint8Array(),
                    new Uint8Array(),
                );
            },
            { bridgeUrl: backend.bridgeUrl, solutionId: testData.solutionId, contextId: testData.contextId, users },
        );
    }

    test("native publishes a data track, browser subscribes and decrypts it", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(60_000);
        const users = await setupUsers(page, cli);
        const message = "hello from native cpp client";
        const roomId = await createTwoMemberRoom(page, backend, users);

        const native = spawnNative([
            users.u2.privKey,
            testData.solutionId,
            backend.bridgeUrl,
            testData.contextId,
            roomId,
            "send",
            message,
        ]);

        try {
            await waitForLine(native, (l) => l.trim() === "PUBLISHED");

            let resolveReceived!: (value: { data: string; statusCode: number }) => void;
            const received = new Promise<{ data: string; statusCode: number }>((r) => (resolveReceived = r));
            await page.exposeFunction("__onNativeData", (data: string, statusCode: number) =>
                resolveReceived({ data, statusCode }),
            );

            await page.evaluate(async (roomId: string) => {
                const api = window.streamApi!;
                await api.joinStreamRoom(roomId);
                const streams = await api.listStreams(roomId);
                const streamsWithDataTracks = streams.flatMap((stream) =>
                    stream.tracks
                        .filter((track) => track.type === "data")
                        .map((track) => ({ streamId: stream.id, streamTrackId: track.mid })),
                );
                await api.createSubscriberStream(roomId, streamsWithDataTracks);
                api.addRemoteStreamListener({
                    streamRoomId: roomId,
                    onRemoteData: (data, statusCode) => {
                        window.__onNativeData!(new TextDecoder().decode(data), statusCode);
                    },
                });
            }, roomId);

            // let the subscriber's negotiation settle before telling the native side to send.
            await new Promise((r) => setTimeout(r, 2000));
            native.stdin.write("go\n");

            const result = await received;
            expect(result.statusCode).toBe(0);
            expect(result.data).toBe(message);
        } finally {
            native.kill();
        }
    });

    test("browser publishes a data track, native subscribes and decrypts it", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(60_000);
        const users = await setupUsers(page, cli);
        const message = "hello from browser ts client";
        const roomId = await createTwoMemberRoom(page, backend, users);

        await page.evaluate(async (roomId: string) => {
            const api = window.streamApi!;
            await api.joinStreamRoom(roomId);
            const handle = await api.createStream(roomId);
            const dataTrackId = await api.addStreamTrack(handle, { createDataChannel: true });
            await api.publishStream(handle);
            window.__dataTrackId = dataTrackId;
        }, roomId);

        // let the publish negotiate before the native side subscribes.
        await new Promise((r) => setTimeout(r, 2000));

        const native = spawnNative([
            users.u2.privKey,
            testData.solutionId,
            backend.bridgeUrl,
            testData.contextId,
            roomId,
            "recv",
        ]);

        try {
            await waitForLine(native, (l) => l.trim() === "READY");

            // let the subscriber's negotiation settle before sending.
            await new Promise((r) => setTimeout(r, 2000));
            await page.evaluate(async (message: string) => {
                const api = window.streamApi!;
                await api.sendData(window.__dataTrackId as any, new TextEncoder().encode(message));
            }, message);

            const line = await waitForLine(native, (l) => l.startsWith("RECV "));
            // DataChannelSession.outboundSeq starts at 1 and pre-increments, so the first
            // real message TS ever sends on a fresh session carries seq=2, not seq=1.
            expect(line).toBe(`RECV seq=2 status=0 data=${message}`);
        } finally {
            native.kill();
        }
    });
});
