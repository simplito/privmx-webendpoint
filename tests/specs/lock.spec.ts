import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { LockLevel, LockLevelName } from "../../src/Types";
import { setupUsers } from "../test-utils";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

// The core serializes every lock/unlock result with a redundant lowercase name
// alongside the numeric level, so assertions are built through this helper.
const LEVEL_NAME: Record<LockLevel, LockLevelName> = {
    [LockLevel.NONE]: "none",
    [LockLevel.SHARED]: "shared",
    [LockLevel.RESERVED]: "reserved",
    [LockLevel.PENDING]: "pending",
    [LockLevel.EXCLUSIVE]: "exclusive",
};
const lockResult = (success: boolean, currentLevel: LockLevel) => ({
    success,
    currentLevel,
    currentLevelName: LEVEL_NAME[currentLevel],
});

// Mirrors the endpoint's own LockTest.cpp.
//
// Two things drive the shape of these tests:
//   - A lockable resourceId is the fileId of a Store file created WITH random
//     write support; arbitrary strings are rejected server-side. Each test
//     therefore mints one via createStore -> createFile(.., true) -> closeFile.
//   - LockLevel is a value, and the harness loads the standalone bundle (which
//     exports only `Endpoint`), so it is passed in through page.evaluate args.
//
// uuids/resourceIds are restricted to a server-side charset (':' and '-' are
// rejected) and capped at 60 chars, hence the lowercase-alphanumeric uuids.
test.describe("LockTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
    });

    test("lock escalates NONE -> SHARED -> RESERVED -> EXCLUSIVE and never downgrades", async ({
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
            lockLevel: LockLevel,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const storeApi = await Endpoint.createStoreApi(connection);
                const lockApi = await Endpoint.createLockApi(connection);
                const enc = new TextEncoder();
                const userObj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                // Only files with random write support can be locked.
                const storeId = await storeApi.createStore(
                    contextId,
                    [userObj],
                    [userObj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const fileHandle = await storeApi.createFile(
                    storeId,
                    enc.encode("lock_test_publicMeta"),
                    enc.encode("lock_test_privateMeta"),
                    0,
                    true,
                );
                const resourceId = await storeApi.closeFile(fileHandle);
                // uuids share the resourceId charset restrictions; 32 chars like
                // the endpoint's own newUuid() helper.
                const pad = (s: string) => (s + "0".repeat(32)).slice(0, 32);
                const uuid = pad("holder");

                const shared = await lockApi.lock(resourceId, uuid, lockLevel.SHARED);
                // SHARED again - renews the lease, stays SHARED.
                const renewed = await lockApi.lock(resourceId, uuid, lockLevel.SHARED);
                const reserved = await lockApi.lock(resourceId, uuid, lockLevel.RESERVED);
                // RESERVED -> EXCLUSIVE with no other readers present.
                const exclusive = await lockApi.lock(resourceId, uuid, lockLevel.EXCLUSIVE);
                // Asking for a weaker level does not downgrade.
                const weaker = await lockApi.lock(resourceId, uuid, lockLevel.SHARED);

                await lockApi.unlock(resourceId, uuid, lockLevel.NONE);
                return { resourceId, shared, renewed, reserved, exclusive, weaker };
            },
            args,
        );

        expect(result.resourceId).toBeTruthy();
        expect(result.shared).toEqual(lockResult(true, LockLevel.SHARED));
        expect(result.renewed).toEqual(lockResult(true, LockLevel.SHARED));
        expect(result.reserved).toEqual(lockResult(true, LockLevel.RESERVED));
        expect(result.exclusive).toEqual(lockResult(true, LockLevel.EXCLUSIVE));
        // lock() never downgrades - still EXCLUSIVE.
        expect(result.weaker).toEqual(lockResult(true, LockLevel.EXCLUSIVE));
    });

    test("unlock downgrades EXCLUSIVE -> SHARED -> NONE and is a no-op when nothing is held", async ({
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
            lockLevel: LockLevel,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const storeApi = await Endpoint.createStoreApi(connection);
                const lockApi = await Endpoint.createLockApi(connection);
                const enc = new TextEncoder();
                const userObj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                const storeId = await storeApi.createStore(
                    contextId,
                    [userObj],
                    [userObj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const fileHandle = await storeApi.createFile(
                    storeId,
                    enc.encode("p"),
                    enc.encode("p"),
                    0,
                    true,
                );
                const resourceId = await storeApi.closeFile(fileHandle);
                const pad = (s: string) => (s + "0".repeat(32)).slice(0, 32);
                const uuid = pad("holder");
                const unknownUuid = pad("stranger");

                // Straight to EXCLUSIVE is allowed when nobody else holds anything.
                const taken = await lockApi.lock(resourceId, uuid, lockLevel.EXCLUSIVE);
                const toShared = await lockApi.unlock(resourceId, uuid, lockLevel.SHARED);
                const toNone = await lockApi.unlock(resourceId, uuid, lockLevel.NONE);
                // Already released - a no-op, not an error.
                const again = await lockApi.unlock(resourceId, uuid, lockLevel.NONE);
                // A uuid holding nothing - also a no-op.
                const unknown = await lockApi.unlock(resourceId, unknownUuid, lockLevel.SHARED);

                return { taken, toShared, toNone, again, unknown };
            },
            args,
        );

        expect(result.taken).toEqual(lockResult(true, LockLevel.EXCLUSIVE));
        expect(result.toShared).toEqual(lockResult(true, LockLevel.SHARED));
        expect(result.toNone).toEqual(lockResult(true, LockLevel.NONE));
        expect(result.again).toEqual(lockResult(true, LockLevel.NONE));
        expect(result.unknown).toEqual(lockResult(true, LockLevel.NONE));
    });

    test("a writer blocked by a reader parks on PENDING, which then blocks new readers", async ({
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
            lockLevel: LockLevel,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const storeApi = await Endpoint.createStoreApi(connection);
                const lockApi = await Endpoint.createLockApi(connection);
                const enc = new TextEncoder();
                const userObj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                const storeId = await storeApi.createStore(
                    contextId,
                    [userObj],
                    [userObj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const fileHandle = await storeApi.createFile(
                    storeId,
                    enc.encode("p"),
                    enc.encode("p"),
                    0,
                    true,
                );
                const resourceId = await storeApi.closeFile(fileHandle);

                const pad = (s: string) => (s + "0".repeat(32)).slice(0, 32);
                const writerUuid = pad("writer");
                const readerUuid = pad("reader");
                const otherReaderUuid = pad("reader2");

                // RESERVED still admits new readers.
                const reserved = await lockApi.lock(resourceId, writerUuid, lockLevel.RESERVED);
                const reader = await lockApi.lock(resourceId, readerUuid, lockLevel.SHARED);
                // EXCLUSIVE with a reader present - refused, writer parks on PENDING.
                const blocked = await lockApi.lock(resourceId, writerUuid, lockLevel.EXCLUSIVE);
                // PENDING blocks new readers.
                const lateReader = await lockApi.lock(
                    resourceId,
                    otherReaderUuid,
                    lockLevel.SHARED,
                );
                // The reader already inside drains.
                const drained = await lockApi.unlock(resourceId, readerUuid, lockLevel.NONE);
                // PENDING -> EXCLUSIVE.
                const promoted = await lockApi.lock(resourceId, writerUuid, lockLevel.EXCLUSIVE);

                await lockApi.unlock(resourceId, writerUuid, lockLevel.NONE);
                return { reserved, reader, blocked, lateReader, drained, promoted };
            },
            args,
        );

        expect(result.reserved).toEqual(lockResult(true, LockLevel.RESERVED));
        expect(result.reader).toEqual(lockResult(true, LockLevel.SHARED));
        expect(result.blocked).toEqual(lockResult(false, LockLevel.PENDING));
        expect(result.lateReader).toEqual(lockResult(false, LockLevel.NONE));
        expect(result.drained).toEqual(lockResult(true, LockLevel.NONE));
        expect(result.promoted).toEqual(lockResult(true, LockLevel.EXCLUSIVE));
    });

    test("checkReservedLock reports RESERVED-or-higher to observers but not to the holder", async ({
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
            lockLevel: LockLevel,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const storeApi = await Endpoint.createStoreApi(connection);
                const lockApi = await Endpoint.createLockApi(connection);
                const enc = new TextEncoder();
                const userObj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                const storeId = await storeApi.createStore(
                    contextId,
                    [userObj],
                    [userObj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const fileHandle = await storeApi.createFile(
                    storeId,
                    enc.encode("p"),
                    enc.encode("p"),
                    0,
                    true,
                );
                const resourceId = await storeApi.closeFile(fileHandle);

                const pad = (s: string) => (s + "0".repeat(32)).slice(0, 32);
                const holderUuid = pad("holder");
                const observerUuid = pad("observer");
                const check = (uuid: string) => lockApi.checkReservedLock(resourceId, uuid);

                const nothingHeld = await check(observerUuid);
                // SHARED is below RESERVED - does not count.
                await lockApi.lock(resourceId, holderUuid, lockLevel.SHARED);
                const whileShared = await check(observerUuid);
                // RESERVED is reported to everyone but the holder itself.
                await lockApi.lock(resourceId, holderUuid, lockLevel.RESERVED);
                const observerSeesReserved = await check(observerUuid);
                const holderSeesReserved = await check(holderUuid);
                // PENDING and EXCLUSIVE are above RESERVED - they count.
                await lockApi.lock(resourceId, holderUuid, lockLevel.PENDING);
                const whilePending = await check(observerUuid);
                await lockApi.lock(resourceId, holderUuid, lockLevel.EXCLUSIVE);
                const whileExclusive = await check(observerUuid);
                // Downgrading to SHARED clears the writer lock.
                await lockApi.unlock(resourceId, holderUuid, lockLevel.SHARED);
                const afterDowngrade = await check(observerUuid);
                await lockApi.unlock(resourceId, holderUuid, lockLevel.NONE);
                const afterRelease = await check(observerUuid);

                return {
                    nothingHeld,
                    whileShared,
                    observerSeesReserved,
                    holderSeesReserved,
                    whilePending,
                    whileExclusive,
                    afterDowngrade,
                    afterRelease,
                };
            },
            args,
        );

        expect(result.nothingHeld).toBe(false);
        expect(result.whileShared).toBe(false);
        expect(result.observerSeesReserved).toBe(true);
        // The holder does not see its own reserved lock.
        expect(result.holderSeesReserved).toBe(false);
        expect(result.whilePending).toBe(true);
        expect(result.whileExclusive).toBe(true);
        expect(result.afterDowngrade).toBe(false);
        expect(result.afterRelease).toBe(false);
    });

    test("a lock held by one user is visible to and blocks another user", async ({
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
            lockLevel: LockLevel,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const Endpoint = window.Endpoint;
                const enc = new TextEncoder();

                // u1 owns the resource and grants u2 access, so both can lock it.
                const c1 = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const store1 = await Endpoint.createStoreApi(c1);
                const lock1 = await Endpoint.createLockApi(c1);
                const u1Obj = { userId: users.u1.id, pubKey: users.u1.pubKey };
                const u2Obj = { userId: users.u2.id, pubKey: users.u2.pubKey };

                const storeId = await store1.createStore(
                    contextId,
                    [u1Obj, u2Obj],
                    [u1Obj, u2Obj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const fileHandle = await store1.createFile(
                    storeId,
                    enc.encode("p"),
                    enc.encode("p"),
                    0,
                    true,
                );
                const resourceId = await store1.closeFile(fileHandle);

                const pad = (s: string) => (s + "0".repeat(32)).slice(0, 32);
                const firstUuid = pad("holder1");
                const secondUuid = pad("holder2");
                const firstTake = await lock1.lock(resourceId, firstUuid, lockLevel.EXCLUSIVE);

                // Lock state lives server side, so a second connection sees it.
                const c2 = await Endpoint.connect(users.u2.privKey, solutionId, bridgeUrl);
                const lock2 = await Endpoint.createLockApi(c2);

                const otherSeesIt = await lock2.checkReservedLock(resourceId, secondUuid);
                const contendedExclusive = await lock2.lock(
                    resourceId,
                    secondUuid,
                    lockLevel.EXCLUSIVE,
                );
                // An EXCLUSIVE holder blocks readers too.
                const contendedShared = await lock2.lock(
                    resourceId,
                    secondUuid,
                    lockLevel.SHARED,
                );

                // The first holder kept its lock through the failed attempts.
                const stillHeld = await lock1.lock(resourceId, firstUuid, lockLevel.EXCLUSIVE);
                await lock1.unlock(resourceId, firstUuid, lockLevel.NONE);

                // Now the second holder gets it.
                const afterRelease = await lock2.lock(
                    resourceId,
                    secondUuid,
                    lockLevel.EXCLUSIVE,
                );
                await lock2.unlock(resourceId, secondUuid, lockLevel.NONE);

                return {
                    firstTake,
                    otherSeesIt,
                    contendedExclusive,
                    contendedShared,
                    stillHeld,
                    afterRelease,
                };
            },
            args,
        );

        expect(result.firstTake).toEqual(lockResult(true, LockLevel.EXCLUSIVE));
        expect(result.otherSeesIt).toBe(true);
        // Refused against another holder's EXCLUSIVE - the caller holds nothing.
        expect(result.contendedExclusive).toEqual(lockResult(false, LockLevel.NONE));
        expect(result.contendedShared).toEqual(lockResult(false, LockLevel.NONE));
        expect(result.stillHeld).toEqual(lockResult(true, LockLevel.EXCLUSIVE));
        expect(result.afterRelease).toEqual(lockResult(true, LockLevel.EXCLUSIVE));
    });

    test("invalid resourceIds, uuids and out-of-range lock levels are rejected", async ({
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
            lockLevel: LockLevel,
        };

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const storeApi = await Endpoint.createStoreApi(connection);
                const lockApi = await Endpoint.createLockApi(connection);
                const enc = new TextEncoder();
                const userObj = { userId: users.u1.id, pubKey: users.u1.pubKey };

                const storeId = await storeApi.createStore(
                    contextId,
                    [userObj],
                    [userObj],
                    enc.encode("p"),
                    enc.encode("p"),
                );
                const fileHandle = await storeApi.createFile(
                    storeId,
                    enc.encode("p"),
                    enc.encode("p"),
                    0,
                    true,
                );
                const resourceId = await storeApi.closeFile(fileHandle);
                // A plain file (no random write support) cannot be locked.
                const plainHandle = await storeApi.createFile(
                    storeId,
                    enc.encode("p"),
                    enc.encode("p"),
                    0,
                );
                const plainFileId = await storeApi.closeFile(plainHandle);

                const pad = (s: string) => (s + "0".repeat(32)).slice(0, 32);
                const uuid = pad("holder");
                const threw = async (fn: () => Promise<unknown>) => {
                    try {
                        await fn();
                        return false;
                    } catch {
                        return true;
                    }
                };

                return {
                    // A Context ID is not a lockable resource.
                    notAFile: await threw(() => lockApi.lock(contextId, uuid, lockLevel.SHARED)),
                    // A real file, but without random write support.
                    noRandomWrite: await threw(() =>
                        lockApi.lock(plainFileId, uuid, lockLevel.SHARED),
                    ),
                    // Out of the allowed charset.
                    badCharset: await threw(() =>
                        lockApi.lock("resource:id", uuid, lockLevel.SHARED),
                    ),
                    // Too long (max 60).
                    tooLong: await threw(() =>
                        lockApi.lock("a".repeat(61), uuid, lockLevel.SHARED),
                    ),
                    badUuid: await threw(() => lockApi.lock(resourceId, "uuid:1", lockLevel.SHARED)),
                    // lock() only acquires, it never releases.
                    lockNone: await threw(() => lockApi.lock(resourceId, uuid, lockLevel.NONE)),
                    lockOutOfEnum: await threw(() =>
                        lockApi.lock(resourceId, uuid, 99 as LockLevel),
                    ),
                    // unlock() only downgrades to NONE or SHARED.
                    unlockReserved: await threw(() =>
                        lockApi.unlock(resourceId, uuid, lockLevel.RESERVED),
                    ),
                    unlockExclusive: await threw(() =>
                        lockApi.unlock(resourceId, uuid, lockLevel.EXCLUSIVE),
                    ),
                    unlockOutOfEnum: await threw(() =>
                        lockApi.unlock(resourceId, uuid, 99 as LockLevel),
                    ),
                    checkNotAFile: await threw(() => lockApi.checkReservedLock(contextId, uuid)),
                };
            },
            args,
        );

        for (const [label, didThrow] of Object.entries(result)) {
            expect(didThrow, `${label} should reject`).toBe(true);
        }
    });

    test("connection.getLockApi() resolves the same cached instance as the factory", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            users,
        };

        const identities = await page.evaluate(async ({ bridgeUrl, solutionId, users }) => {
            const Endpoint = window.Endpoint;
            const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
            const lockApi = await connection.getLockApi();

            return {
                sameAsFactory: lockApi === (await Endpoint.createLockApi(connection)),
                stableAcrossCalls: lockApi === (await connection.getLockApi()),
            };
        }, args);

        expect(identities.sameAsFactory).toBe(true);
        expect(identities.stableAcrossCalls).toBe(true);
    });

    test("lock methods reject after the connection is disconnected", async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);
        const args = {
            bridgeUrl: backend.bridgeUrl,
            solutionId: testData.solutionId,
            users,
            lockLevel: LockLevel,
        };

        const threw = await page.evaluate(
            async ({ bridgeUrl, solutionId, users, lockLevel }) => {
                const Endpoint = window.Endpoint;
                const connection = await Endpoint.connect(users.u1.privKey, solutionId, bridgeUrl);
                const lockApi = await Endpoint.createLockApi(connection);

                await connection.disconnect();

                try {
                    await lockApi.lock(
                        "aaaaaaaaaaaaaaaaaaaaaaaa",
                        "bbbbbbbbbbbbbbbbbbbbbbbb",
                        lockLevel.SHARED,
                    );
                    return false;
                } catch {
                    return true;
                }
            },
            args,
        );

        expect(threw).toBe(true);
    });
});
