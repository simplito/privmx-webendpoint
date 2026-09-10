import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { setupUsers } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        PrivmxWebEndpoint: { groupGrant: (group: any, role: string) => any };
        wasmReady: boolean;
    }
}

// The paths the README teaches that nothing else runs end to end: the two grant
// helpers, the id-to-key lookup, and the one-call file upload. Their unit tests
// use fakes, so this is where they meet the real core and a real Bridge.
test.describe("README API paths", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    const argsFor = (backend: { bridgeUrl: string }, users: any) => ({
        bridgeUrl: backend.bridgeUrl,
        solutionId: testData.solutionId,
        contextId: testData.contextId,
        users,
    });

    test("grantFor produces a grant a container honours", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const dec = new TextDecoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const groupApi1 = await Endpoint.createGroupApi(conn1);
            const threadApi1 = await Endpoint.createThreadApi(conn1);

            const groupId = await groupApi1.createGroup(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("{}"),
                enc.encode("{}"),
            );

            // The README's one-liner, and the hand-built grant beside it.
            const grant = await groupApi1.grantFor(groupId);
            const group = await groupApi1.getGroup(groupId);
            const byHand = window.PrivmxWebEndpoint.groupGrant(group, "user");

            // u2 is named nowhere on the Thread: only the grant can let them in.
            const threadId = await threadApi1.createThread(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("{}"),
                enc.encode("{}"),
                undefined,
                [grant],
            );
            await threadApi1.sendMessage(
                threadId,
                new Uint8Array(),
                new Uint8Array(),
                enc.encode("through the grant"),
            );

            const conn2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
            const threadApi2 = await Endpoint.createThreadApi(conn2);
            const page1 = await threadApi2.listMessages(threadId, {
                skip: 0,
                limit: 10,
                sortOrder: "desc",
            });

            return {
                grant,
                byHand,
                readByGroupMember: page1.readItems.map((m) => ({
                    statusCode: m.statusCode,
                    text: dec.decode(m.data),
                })),
            };
        }, argsFor(backend, users));

        // grantFor is getGroup plus the four fields, so both roads meet.
        expect(result.grant).toEqual(result.byHand);
        expect(result.grant.role).toEqual("user");
        expect(result.grant.groupEpoch).toEqual(1);

        // And the grant is the only reason u2 can read this Thread.
        expect(result.readByGroupMember).toEqual([
            { statusCode: 0, text: "through the grant" },
        ]);
    });

    test("resolveUsers turns container ids into users with keys", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
            const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

            const conn = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const threadApi = await Endpoint.createThreadApi(conn);
            const threadId = await threadApi.createThread(
                contextId,
                [u1Obj, u2Obj],
                [u1Obj],
                enc.encode("{}"),
                enc.encode("{}"),
            );
            const thread = await threadApi.getThread(threadId);

            const resolved = await conn.resolveUsers(contextId, thread.users);
            let refusedUnknown = "";
            try {
                await conn.resolveUsers(contextId, ["nobody-here"]);
            } catch (e) {
                refusedUnknown = (e as Error).message;
            }

            return { ids: thread.users, resolved, refusedUnknown };
        }, argsFor(backend, users));

        // Same people, same order, now carrying their public keys.
        expect(result.resolved.map((u) => u.userId)).toEqual(result.ids);
        expect(result.resolved.find((u) => u.userId === users.u1.id)?.pubKey).toEqual(
            users.u1.pubKey,
        );
        expect(result.refusedUnknown).toMatch(/nobody-here/);
    });

    test("uploadFile and fileReadable round-trip a file", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(async ({ bridgeUrl, solutionId, contextId, users }) => {
            const Endpoint = window.Endpoint;
            const enc = new TextEncoder();
            const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };

            const conn = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const storeApi = await Endpoint.createStoreApi(conn);
            const storeId = await storeApi.createStore(
                contextId,
                [u1Obj],
                [u1Obj],
                enc.encode("{}"),
                enc.encode("{}"),
            );

            // Every byte says where it is, so a ranged read is checkable.
            const size = 300 * 1024;
            const bytes = new Uint8Array(size);
            for (let i = 0; i < size; i++) bytes[i] = 48 + (i % 10);
            const file = new File([bytes], "probe.txt");

            const progress: number[] = [];
            const fileId = await storeApi.uploadFile({
                storeId,
                file,
                onProgress: (sent) => progress.push(sent),
            });

            const whole = new Uint8Array(
                await new Response(storeApi.fileReadable(fileId)).arrayBuffer(),
            );
            const slice = await new Response(
                storeApi.fileReadable(fileId, { from: 1000, length: 10, chunkSize: 4096 }),
            ).text();

            const handle = await storeApi.openFileHandle(fileId);
            await handle.seek(size - 4);
            const tail = new TextDecoder().decode(await handle.read(4));
            await handle.close();

            return {
                lastProgress: progress.at(-1),
                sameLength: whole.length === size,
                identical: whole.every((b, i) => b === bytes[i]),
                slice,
                expectedSlice: new TextDecoder().decode(bytes.slice(1000, 1010)),
                tail,
                expectedTail: new TextDecoder().decode(bytes.slice(size - 4)),
            };
        }, argsFor(backend, users));

        expect(result.lastProgress).toEqual(300 * 1024);
        expect(result.sameLength).toBe(true);
        expect(result.identical).toBe(true);
        expect(result.slice).toEqual(result.expectedSlice);
        expect(result.tail).toEqual(result.expectedTail);
    });
});
