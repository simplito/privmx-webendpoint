import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { setupUsers } from "../test-utils";
import type { Endpoint, StreamApi, Types } from "../../src";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
        streamApi?: StreamApi;
    }
}

test.use({
    launchOptions: {
        args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--headless",
            "--autoplay-policy=no-user-gesture-required",
        ],
    },
});

/**
 * A subscriber whose Stream Room keys went out of date - the update
 * notification carrying a new key never arrived, most often because the
 * connection was out for a while - cannot decrypt anything the publisher sends
 * afterwards. `refreshStreamRoomKeys` fetches the keys again, and the SDK calls
 * it by itself once decryption fails for want of a key.
 *
 * Measured through `framesDecoded` on the inbound RTP stream: it grows only
 * when frames both arrive and decrypt, so it covers the E2EE pipeline.
 */
test.describe("StreamKeyRefresh", () => {
    test.beforeEach(async ({ page }) => {
        // Tee the worker's missing-key reports: they are what the automatic
        // refresh keys off, and nothing else in the page can see them.
        await page.addInitScript(() => {
            const Original = window.Worker;
            (window as unknown as { __missingKeys: number }).__missingKeys = 0;
            (window as unknown as { Worker: unknown }).Worker = class extends Original {
                constructor(url: string | URL, options?: WorkerOptions) {
                    super(url, options);
                    super.addEventListener("message", (e: MessageEvent) => {
                        if (e.data && e.data.type === "missingKey") {
                            (window as unknown as { __missingKeys: number }).__missingKeys++;
                        }
                    });
                }
            };
        });
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("refreshStreamRoomKeys leaves a running subscription alone", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(120000);
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const publisher = await Endpoint.createStreamApi(
                conn1,
                await Endpoint.createEventApi(conn1),
            );
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const subscriber = await Endpoint.createStreamApi(
                conn2,
                await Endpoint.createEventApi(conn2),
            );
            const enc = new TextEncoder();
            const uObjs = [users.u1, users.u2].map((u) => ({ userId: u.id, pubKey: u.pubKey }));
            const sId = await publisher.createStreamRoom(
                contextId,
                uObjs,
                uObjs,
                enc.encode("p"),
                enc.encode("p"),
            );

            const framesDecoded = async () => {
                const pc = (subscriber as any).client.subscriber.pcm.getConnection(
                    sId,
                    "subscriber",
                ).pc as RTCPeerConnection;
                let frames = 0;
                (await pc.getStats()).forEach((report: any) => {
                    if (report.type === "inbound-rtp" && report.kind === "video") {
                        frames += report.framesDecoded ?? 0;
                    }
                });
                return frames;
            };
            const waitFrames = async (above: number, tries = 20) => {
                for (let i = 0; i < tries; i++) {
                    const frames = await framesDecoded();
                    if (frames > above) return frames;
                    await new Promise((r) => setTimeout(r, 500));
                }
                return framesDecoded();
            };
            const listFirst = async (): Promise<Types.StreamInfo> => {
                let list: Types.StreamInfo[] = [];
                for (let i = 0; i < 40 && list.length === 0; i++) {
                    list = await subscriber.listStreams(sId);
                    await new Promise((r) => setTimeout(r, 500));
                }
                return list[0];
            };

            await publisher.joinStreamRoom(sId);
            await subscriber.joinStreamRoom(sId);
            const handle = await publisher.createStream(sId);
            const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            await publisher.addStreamTrack(handle, { track: media.getVideoTracks()[0] });
            await publisher.publishStream(handle);

            const first = await listFirst();
            await subscriber.createSubscriberStream(
                sId,
                first.tracks.map((t) => ({ streamId: first.id, streamTrackId: t.mid })),
            );
            const framesBefore = await waitFrames(0);

            await subscriber.refreshStreamRoomKeys(sId);
            const framesAfter = await waitFrames(framesBefore);

            return { framesBefore, framesAfter };
        }, args);

        expect(result.framesBefore).toBeGreaterThan(0);
        // The room's encryption key is untouched, so the pipeline never pauses.
        expect(result.framesAfter).toBeGreaterThan(result.framesBefore);
    });

    test("a subscriber which lost its keys fetches them again on its own", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(120000);
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const publisher = await Endpoint.createStreamApi(
                conn1,
                await Endpoint.createEventApi(conn1),
            );
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const subscriber = await Endpoint.createStreamApi(
                conn2,
                await Endpoint.createEventApi(conn2),
            );
            const enc = new TextEncoder();
            const uObjs = [users.u1, users.u2].map((u) => ({ userId: u.id, pubKey: u.pubKey }));
            const sId = await publisher.createStreamRoom(
                contextId,
                uObjs,
                uObjs,
                enc.encode("p"),
                enc.encode("p"),
            );

            const framesDecoded = async () => {
                const pc = (subscriber as any).client.subscriber.pcm.getConnection(
                    sId,
                    "subscriber",
                ).pc as RTCPeerConnection;
                let frames = 0;
                (await pc.getStats()).forEach((report: any) => {
                    if (report.type === "inbound-rtp" && report.kind === "video") {
                        frames += report.framesDecoded ?? 0;
                    }
                });
                return frames;
            };
            const waitFrames = async (above: number, tries = 20) => {
                for (let i = 0; i < tries; i++) {
                    const frames = await framesDecoded();
                    if (frames > above) return frames;
                    await new Promise((r) => setTimeout(r, 500));
                }
                return framesDecoded();
            };
            const listFirst = async (): Promise<Types.StreamInfo> => {
                let list: Types.StreamInfo[] = [];
                for (let i = 0; i < 40 && list.length === 0; i++) {
                    list = await subscriber.listStreams(sId);
                    await new Promise((r) => setTimeout(r, 500));
                }
                return list[0];
            };

            await publisher.joinStreamRoom(sId);
            await subscriber.joinStreamRoom(sId);
            const handle = await publisher.createStream(sId);
            const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            await publisher.addStreamTrack(handle, { track: media.getVideoTracks()[0] });
            await publisher.publishStream(handle);

            const first = await listFirst();
            await subscriber.createSubscriberStream(
                sId,
                first.tracks.map((t) => ({ streamId: first.id, streamTrackId: t.mid })),
            );
            const framesBefore = await waitFrames(0);

            // Record what the SDK fetches of its own accord, and the keys the
            // library hands back afterwards.
            const client = (subscriber as any).client;
            const refreshed: string[] = [];
            const originalRefresh = client.refreshStreamRoomKeys.bind(client);
            client.refreshStreamRoomKeys = (streamRoomId: string) => {
                refreshed.push(streamRoomId);
                return originalRefresh(streamRoomId);
            };
            const originalUpdate = client.updateKeys.bind(client);
            let keysRestored = 0;
            let wiped = false;
            client.updateKeys = (streamRoomId: string, keys: unknown[]) => {
                if (wiped && keys.length > 0) keysRestored += keys.length;
                return originalUpdate(streamRoomId, keys);
            };

            // Stand in for the Stream Room update notification which never
            // arrived: the keys this subscriber holds are no longer the ones the
            // frames on the wire are encrypted with.
            await client.updateKeys(sId, []);
            wiped = true;

            for (let i = 0; i < 30 && keysRestored === 0; i++) {
                await new Promise((r) => setTimeout(r, 500));
            }
            const missingKeys = (window as unknown as { __missingKeys: number }).__missingKeys;

            return { sId, framesBefore, keysRestored, refreshed, missingKeys };
        }, args);

        expect(result.framesBefore).toBeGreaterThan(0);
        expect(result.missingKeys).toBeGreaterThan(0);
        expect(result.refreshed).toContain(result.sId);
        // The refresh handed the room's keys back to the WebRTC layer.
        expect(result.keysRestored).toBeGreaterThan(0);
    });
});
