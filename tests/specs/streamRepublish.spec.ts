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
 * A republishes into the same Stream Room (unpublishStream → createStream →
 * publishStream) while B stays subscribed.
 *
 * The media server hands the new publication the **same stream id**, so nothing
 * in B's view of the room changes and no application has a reason to act - but
 * B's subscription is no longer attached to anything and no media arrives. The
 * subscription has to be sent again; until something does that, B stays blind.
 *
 * Measured through `framesDecoded` on the inbound RTP stream: it grows only when
 * frames both arrive and decrypt, so it covers the E2EE pipeline too.
 */
test.describe("StreamRepublish", () => {
    test.beforeEach(async ({ page }) => {
        // Tee the E2EE worker's error reports: the SDK logger is silent by
        // default, and a recycled receiver used to make the worker report
        // "InvalidStateError" for the transform torn off under it.
        await page.addInitScript(() => {
            const Original = window.Worker;
            (window as unknown as { __workerErrors: string[] }).__workerErrors = [];
            (window as unknown as { Worker: unknown }).Worker = class extends Original {
                constructor(url: string | URL, options?: WorkerOptions) {
                    super(url, options);
                    super.addEventListener("message", (e: MessageEvent) => {
                        if (e.data && e.data.type === "error") {
                            (window as unknown as { __workerErrors: string[] }).__workerErrors.push(
                                String(e.data.data),
                            );
                        }
                    });
                }
            };
        });
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    // The subscription is not re-attached on its own, and nothing in listStreams
    // says so - the SDK refuses the quiet failure instead, and says how to fix it.
    test("adding a republished stream without redoing it is refused", async ({
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

            const publish = async () => {
                const handle = await publisher.createStream(sId);
                const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                await publisher.addStreamTrack(handle, { track: s.getVideoTracks()[0] });
                await publisher.publishStream(handle);
                return handle;
            };
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
            const handle = await publish();
            const first = await listFirst();
            const subHandle = await subscriber.createSubscriberStream(
                sId,
                first.tracks.map((t) => ({ streamId: first.id, streamTrackId: t.mid })),
            );
            const framesBefore = await waitFrames(0);

            await publisher.unpublishStream(handle);
            await new Promise((r) => setTimeout(r, 2000));
            await publish();
            const second = await listFirst();
            const framesStalled = await waitFrames(framesBefore, 12);

            // Adding it back alone looks reasonable and would deliver nothing.
            let rejection: { name?: string; code?: number } = {};
            try {
                await subscriber.updateSubscriberStream(
                    subHandle,
                    second.tracks.map((t) => ({ streamId: second.id, streamTrackId: t.mid })),
                    [],
                );
            } catch (e) {
                rejection = { name: (e as Error).name, code: (e as { code?: number }).code };
            }

            return { framesBefore, framesStalled, rejection };
        }, args);

        expect(result.framesBefore).toBeGreaterThan(0);
        // Nothing is delivered until the subscription is remade. The counter is
        // per inbound RTP stream, and the one it was counting is gone, so this
        // drops to zero rather than merely stopping.
        expect(result.framesStalled).toBeLessThanOrEqual(result.framesBefore);
        expect(result.rejection.name).toBe("StreamRequiresResubscriptionException");
        // 0x80033 - the code the C++ core uses for it.
        expect(result.rejection.code).toBe(0x80033);
    });

    // Unsubscribing takes the remote tracks away just like a republish does, so
    // the SDK announces its own removals to itself. A Stream carrying both audio
    // and video brings several `removetrack` events, none of which may be taken
    // for the media server dropping us, or an ordinary resubscribe is refused.
    //
    // Against the media server the removals land while `updateSubscriberStream`
    // is still waiting, so this passes on the mishandling it guards as well -
    // the window is a matter of timing and the unit tests are what pin it down.
    // What this test does show is that the whole path still carries media.
    test("a stream unsubscribed by hand can be subscribed to again", async ({
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
            const subsOf = (s: Types.StreamInfo) =>
                s.tracks.map((t) => ({ streamId: s.id, streamTrackId: t.mid }));

            await publisher.joinStreamRoom(sId);
            await subscriber.joinStreamRoom(sId);
            const handle = await publisher.createStream(sId);
            const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            // Both kinds, because they share one MediaStream on the receiving end.
            await publisher.addStreamTrack(handle, { track: media.getVideoTracks()[0] });
            await publisher.addStreamTrack(handle, { track: media.getAudioTracks()[0] });
            await publisher.publishStream(handle);

            const stream = await listFirst();
            const subHandle = await subscriber.createSubscriberStream(sId, subsOf(stream));
            const framesBefore = await waitFrames(0);

            await subscriber.updateSubscriberStream(subHandle, [], subsOf(stream));
            // Give the renegotiation time to take the tracks away.
            await new Promise((r) => setTimeout(r, 3000));

            let rejection: { name?: string; code?: number } | undefined;
            try {
                await subscriber.updateSubscriberStream(subHandle, subsOf(stream), []);
            } catch (e) {
                rejection = { name: (e as Error).name, code: (e as { code?: number }).code };
            }
            const framesAtResubscribe = await framesDecoded();
            const framesAfter = rejection ? 0 : await waitFrames(framesAtResubscribe, 30);

            return {
                trackCount: stream.tracks.length,
                framesBefore,
                framesAtResubscribe,
                framesAfter,
                rejection,
            };
        }, args);

        expect(result.trackCount).toBe(2);
        expect(result.framesBefore).toBeGreaterThan(0);
        expect(result.rejection).toBeUndefined();
        expect(result.framesAfter).toBeGreaterThan(result.framesAtResubscribe);
    });

    test("re-issuing the subscription restores media after a republish", async ({
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

            const publish = async () => {
                const handle = await publisher.createStream(sId);
                const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                await publisher.addStreamTrack(handle, { track: s.getVideoTracks()[0] });
                await publisher.publishStream(handle);
                return handle;
            };
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
            const subsOf = (s: Types.StreamInfo) =>
                s.tracks.map((t) => ({ streamId: s.id, streamTrackId: t.mid }));

            await publisher.joinStreamRoom(sId);
            await subscriber.joinStreamRoom(sId);
            const handle = await publish();
            const first = await listFirst();
            const subHandle = await subscriber.createSubscriberStream(sId, subsOf(first));
            const framesBefore = await waitFrames(0);

            await publisher.unpublishStream(handle);
            await new Promise((r) => setTimeout(r, 2000));
            await publish();
            const second = await listFirst();
            const framesStalled = await waitFrames(framesBefore, 6);

            // What the recovery costs: the very same subscription, sent again.
            await subscriber.updateSubscriberStream(subHandle, subsOf(second), subsOf(first));
            const framesRecovered = await waitFrames(framesStalled, 20);

            return {
                sameStreamId: first.id === second.id,
                framesBefore,
                framesStalled,
                framesRecovered,
                workerErrors: (window as unknown as { __workerErrors: string[] }).__workerErrors,
            };
        }, args);

        expect(result.framesBefore).toBeGreaterThan(0);
        // The stream id is reused, which is why nothing in the application's
        // view of the room changes and no application acts on its own.
        expect(result.sameStreamId).toBe(true);
        expect(result.framesRecovered).toBeGreaterThan(result.framesStalled);
        // `ontrack` fires again on the receiver the SFU recycled; keeping its
        // existing transform means the worker has nothing to complain about.
        expect(result.workerErrors).toEqual([]);
    });
});
