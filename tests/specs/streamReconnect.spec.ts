import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import { setupUsers } from "../test-utils";
import type { Endpoint, StreamApi } from "../../src";

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
        firefoxUserPrefs: {
            "media.navigator.streams.fake": true,
            "media.navigator.permission.disabled": true,
        },
    },
});

/**
 * Covers the ICE-restart surface added for endpoint rc-2.8: the
 * `connected`/`reconnecting`/`lost` callback of `joinStreamRoom`, the new
 * `restartSubscriberIce` signalling call, and `setNewOfferOnReconfigure` now
 * applying the media server's answer instead of discarding it.
 *
 * The restarts are driven here through the same two primitives
 * `ReconnectManager` uses, rather than by breaking the network: a real
 * Wi-Fi → LTE switch cannot be reproduced against the dockerised Bridge
 * without also killing its WebSocket.
 */
test.describe("StreamReconnectTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("joinStreamRoom reports the room as connected once media flows", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(60000);
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
            const api = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const enc = new TextEncoder();
            const sId = await api.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            const states: string[] = [];
            await api.joinStreamRoom(sId, (state) => states.push(state));

            const handle = await api.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await api.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api.publishStream(handle);

            for (let i = 0; i < 60 && !states.includes("connected"); i++) {
                await new Promise((r) => setTimeout(r, 500));
            }
            return { states };
        }, args);

        expect(result.states).toContain("connected");
        expect(result.states).not.toContain("lost");
    });

    test("restartSubscriberIce renegotiates the subscriber connection", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(90000);
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            // Internal access: the restart primitives are driven by ReconnectManager,
            // which the public API deliberately does not expose.
            const peerConnection = (api: any, roomId: string, type: string) => {
                const manager = type === "publisher" ? api.client.publisher : api.client.subscriber;
                return manager.pcm.getConnection(roomId, type);
            };
            const ufrag = (sdp?: string | null) => sdp?.match(/a=ice-ufrag:(\S+)/)?.[1];
            const waitForState = async (pc: RTCPeerConnection, state: string) => {
                for (let i = 0; i < 60 && pc.connectionState !== state; i++) {
                    await new Promise((r) => setTimeout(r, 500));
                }
                return pc.connectionState;
            };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const publisherApi = await Endpoint.createStreamApi(
                conn1,
                await Endpoint.createEventApi(conn1),
            );
            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const subscriberApi = await Endpoint.createStreamApi(
                conn2,
                await Endpoint.createEventApi(conn2),
            );

            const enc = new TextEncoder();
            const uObjs = [users.u1, users.u2].map((u) => ({ userId: u.id, pubKey: u.pubKey }));
            const sId = await publisherApi.createStreamRoom(
                contextId,
                uObjs,
                uObjs,
                enc.encode("p"),
                enc.encode("p"),
            );

            // U1 publishes audio.
            await publisherApi.joinStreamRoom(sId);
            const handle = await publisherApi.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await publisherApi.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await publisherApi.publishStream(handle);

            // U2 subscribes to it and waits for the remote track.
            const subscriberStates: string[] = [];
            await subscriberApi.joinStreamRoom(sId, (state) => subscriberStates.push(state));

            let remote: Awaited<ReturnType<typeof subscriberApi.listStreams>> = [];
            for (let i = 0; i < 60 && remote.length === 0; i++) {
                remote = await subscriberApi.listStreams(sId);
                await new Promise((r) => setTimeout(r, 500));
            }
            if (remote.length === 0) throw new Error("Published stream never appeared");

            let remoteTrack: MediaStreamTrack | undefined;
            subscriberApi.addRemoteStreamListener({
                streamRoomId: sId,
                onRemoteStreamTrack: (event) => (remoteTrack = event.track),
            });
            const subscriberPcStates: string[] = [];
            await subscriberApi.createSubscriberStream(
                sId,
                remote[0].tracks.map((t) => ({ streamId: remote[0].id, streamTrackId: t.mid })),
                (state) => subscriberPcStates.push(state),
            );

            const subConn = peerConnection(subscriberApi, sId, "subscriber");
            const stateBefore = await waitForState(subConn.pc, "connected");
            const offerUfragBefore = ufrag(subConn.pc.currentRemoteDescription?.sdp);
            const answerUfragBefore = ufrag(subConn.pc.currentLocalDescription?.sdp);
            const sessionIdBefore = subConn.sessionId;

            // The media server owns the subscriber's offer, so the restart is asked
            // for; the offer it produces comes back through the WebRTC layer and the
            // library sends our answer on, all before this call resolves.
            await (subscriberApi as any).client.restartSubscriberIce(sId);

            const stateAfter = await waitForState(subConn.pc, "connected");
            return {
                stateBefore,
                stateAfter,
                offerUfragBefore,
                offerUfragAfter: ufrag(subConn.pc.currentRemoteDescription?.sdp),
                answerUfragBefore,
                answerUfragAfter: ufrag(subConn.pc.currentLocalDescription?.sdp),
                sessionIdBefore,
                sessionIdAfter: peerConnection(subscriberApi, sId, "subscriber").sessionId,
                remoteTrackState: remoteTrack?.readyState,
                subscriberStates,
                subscriberPcStates,
            };
        }, args);

        expect(result.stateBefore).toBe("connected");
        // The media server restarted ICE: its offer carries fresh credentials, and
        // RFC 8829 §5.3.2 requires our answer to carry fresh ones too.
        expect(result.offerUfragAfter).toBeTruthy();
        expect(result.offerUfragAfter).not.toEqual(result.offerUfragBefore);
        expect(result.answerUfragAfter).not.toEqual(result.answerUfragBefore);
        // The restart re-delivers the media server session through updateSessionId
        // (the Bridge keeps the same one), so the connection stays addressable.
        expect(result.sessionIdAfter).toBeGreaterThan(-1);
        expect(result.sessionIdAfter).toEqual(result.sessionIdBefore);
        expect(result.stateAfter).toBe("connected");
        expect(result.remoteTrackState).toBe("live");
        expect(result.subscriberStates).not.toContain("lost");
        // The subscriber connection now reports its own raw state, which it did
        // not before: its peer connection is created without a stream handle, so
        // StateChangeDispatcher never saw it.
        expect(result.subscriberPcStates).toContain("connected");
    });

    test("setNewOfferOnReconfigure applies the answer to the publisher connection", async ({
        page,
        backend,
        cli,
    }) => {
        test.setTimeout(90000);
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            contextId: testData.contextId,
            users,
        };

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const ufrag = (sdp?: string | null) => sdp?.match(/a=ice-ufrag:(\S+)/)?.[1];
            const waitForState = async (pc: RTCPeerConnection, state: string) => {
                for (let i = 0; i < 60 && pc.connectionState !== state; i++) {
                    await new Promise((r) => setTimeout(r, 500));
                }
                return pc.connectionState;
            };

            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const api = await Endpoint.createStreamApi(
                connection,
                await Endpoint.createEventApi(connection),
            );
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const enc = new TextEncoder();
            const sId = await api.createStreamRoom(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("p"),
                enc.encode("p"),
            );

            const states: string[] = [];
            await api.joinStreamRoom(sId, (state) => states.push(state));
            const handle = await api.createStream(sId);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await api.addStreamTrack(handle, { track: stream.getAudioTracks()[0] });
            await api.publishStream(handle);

            const client = (api as any).client;
            const conn = client.publisher.pcm.getConnection(sId, "publisher");
            const stateBefore = await waitForState(conn.pc, "connected");
            const offerUfragBefore = ufrag(conn.pc.currentLocalDescription?.sdp);
            const answerUfragBefore = ufrag(conn.pc.currentRemoteDescription?.sdp);

            // We own the publisher's offer, so the restart is driven from here -
            // exactly what ReconnectManager does when the publisher transport dies.
            // The session id is the one delivered through updateSessionId.
            conn.pc.restartIce();
            const offer = await conn.pc.createOffer();
            await conn.pc.setLocalDescription(offer);
            await client.setNewOfferOnReconfigure(conn.sessionId, {
                sdp: offer.sdp,
                type: "offer",
            });

            const stateAfter = await waitForState(conn.pc, "connected");
            return {
                sessionId: conn.sessionId,
                stateBefore,
                stateAfter,
                offerUfragBefore,
                offerUfragAfter: ufrag(conn.pc.currentLocalDescription?.sdp),
                answerUfragBefore,
                answerUfragAfter: ufrag(conn.pc.currentRemoteDescription?.sdp),
                signalingState: conn.pc.signalingState,
                states,
            };
        }, args);

        expect(result.sessionId).toBeGreaterThan(-1);
        expect(result.stateBefore).toBe("connected");
        expect(result.offerUfragAfter).not.toEqual(result.offerUfragBefore);
        // The answer was applied by the library, not discarded: without it the
        // connection would be stuck in have-local-offer with the old credentials.
        expect(result.signalingState).toBe("stable");
        expect(result.answerUfragAfter).toBeTruthy();
        expect(result.answerUfragAfter).not.toEqual(result.answerUfragBefore);
        expect(result.stateAfter).toBe("connected");
        expect(result.states).not.toContain("lost");
    });
});
