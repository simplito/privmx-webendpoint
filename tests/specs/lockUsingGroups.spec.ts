import { test } from "../fixtures";
import { expect } from "@playwright/test";
import { testData } from "../datasets/testData";
import type { Endpoint } from "../../src";
import { LockLevel } from "../../src/Types";
import { setupUsers } from "../test-utils";
import { installGroupKit } from "../groupKit";

declare global {
    interface Window {
        Endpoint: typeof Endpoint;
        wasmReady: boolean;
    }
}

// Port of the endpoint's own LockUsingGroupsTest.cpp.
//
// LockApi itself knows nothing about groups - it locks a resource id and holds
// no keys. What it does inherit is the Store's access check: a lock is only
// granted to a caller who may write the file, so whether a grantee group's
// member can lock is decided by the same policy that decides whether they can
// write. Every test below therefore mints a Store, grants it to a group, and
// asks what the grantee can lock.
//
// A lockable resourceId is the fileId of a Store file created WITH random write
// support; arbitrary strings are rejected server-side. `LockLevel` is a value,
// and the harness loads the standalone bundle (which exports only `Endpoint`),
// so it is passed in through page.evaluate args.
test.describe("LockUsingGroupsTest", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/tests/harness/index.html");
        await page.waitForFunction(() => window.wasmReady === true, null, { timeout: 10000 });
        await installGroupKit(page);
    });

    const argsFor = (backend: { bridgeUrl: string }, users: any) => ({
        bridgeUrl: backend.bridgeUrl,
        solutionId: testData.solutionId,
        contextId: testData.contextId,
        users,
        lockLevel: LockLevel,
    });

    test("lock via a group manager grant", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                // user_2 is a group member but not a direct member of the Store, so
                // the lock can only be granted through the grant.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("lock_group_public"),
                    gk.enc("lock_group_private"),
                    undefined,
                    gk.grants([group2], "manager"),
                );
                const resourceId = await gk.lockableFile(storeApi1, storeId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const lockApi2 = await window.Endpoint.createLockApi(conn2);
                const uuid = gk.uuid();

                const shared = await lockApi2.lock(resourceId, uuid, lockLevel.SHARED);
                const exclusive = await lockApi2.lock(resourceId, uuid, lockLevel.EXCLUSIVE);
                const released = await lockApi2.unlock(resourceId, uuid, lockLevel.NONE);

                return { resourceId, shared, exclusive, released };
            },
            argsFor(backend, users),
        );

        expect(result.resourceId).toBeTruthy();
        expect(result.shared.success).toBe(true);
        expect(result.shared.currentLevel).toEqual(LockLevel.SHARED);
        expect(result.exclusive.success).toBe(true);
        expect(result.exclusive.currentLevel).toEqual(LockLevel.EXCLUSIVE);
        expect(result.released.success).toBe(true);
        expect(result.released.currentLevel).toEqual(LockLevel.NONE);
    });

    test('lock on its own file via a group "user" grant', async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                // "user" is the weaker grant, and the default item policy is
                // "itemOwner&user,manager" - enough for the file this caller
                // created itself.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("lock_group_public"),
                    gk.enc("lock_group_private"),
                    undefined,
                    gk.grants([group2], "user"),
                );

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const storeApi2 = await window.Endpoint.createStoreApi(conn2);
                const lockApi2 = await window.Endpoint.createLockApi(conn2);
                // user_2 creates the file, so it owns it.
                const resourceId = await gk.lockableFile(storeApi2, storeId);
                const uuid = gk.uuid();

                const exclusive = await lockApi2.lock(resourceId, uuid, lockLevel.EXCLUSIVE);
                await lockApi2.unlock(resourceId, uuid, lockLevel.NONE);

                return { resourceId, exclusive };
            },
            argsFor(backend, users),
        );

        expect(result.resourceId).toBeTruthy();
        expect(result.exclusive.success).toBe(true);
        expect(result.exclusive.currentLevel).toEqual(LockLevel.EXCLUSIVE);
    });

    test('lock on another user\'s file is denied for a group "user" grant', async ({
        page,
        backend,
        cli,
    }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                // Same grant, someone else's file: "itemOwner&user,manager" is
                // satisfied by neither half. This is the policy talking, not the
                // group - a direct member with the same role fares the same.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("lock_group_public"),
                    gk.enc("lock_group_private"),
                    undefined,
                    gk.grants([group2], "user"),
                );
                const resourceId = await gk.lockableFile(storeApi1, storeId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const lockApi2 = await window.Endpoint.createLockApi(conn2);
                const rejected = await gk.caught(() =>
                    lockApi2.lock(resourceId, gk.uuid(), lockLevel.SHARED),
                );

                return { rejected };
            },
            argsFor(backend, users),
        );

        expect(result.rejected).toBe(true);
    });

    test("checkReservedLock via a group grant", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const lockApi1 = await window.Endpoint.createLockApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("lock_group_public"),
                    gk.enc("lock_group_private"),
                    undefined,
                    gk.grants([group2], "manager"),
                );
                const resourceId = await gk.lockableFile(storeApi1, storeId);

                const holderUuid = gk.uuid();
                const held = await lockApi1.lock(resourceId, holderUuid, lockLevel.RESERVED);

                // The lock is server-side state: the group member sees the direct
                // member's writer lock and is held off.
                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const lockApi2 = await window.Endpoint.createLockApi(conn2);
                const observerUuid = gk.uuid();
                const reservedWhileHeld = await lockApi2.checkReservedLock(
                    resourceId,
                    observerUuid,
                );
                const blocked = await lockApi2.lock(resourceId, observerUuid, lockLevel.EXCLUSIVE);

                await lockApi1.unlock(resourceId, holderUuid, lockLevel.NONE);

                const reservedAfterRelease = await lockApi2.checkReservedLock(
                    resourceId,
                    observerUuid,
                );
                const granted = await lockApi2.lock(resourceId, observerUuid, lockLevel.EXCLUSIVE);
                await lockApi2.unlock(resourceId, observerUuid, lockLevel.NONE);

                return {
                    held,
                    reservedWhileHeld,
                    blocked,
                    reservedAfterRelease,
                    granted,
                };
            },
            argsFor(backend, users),
        );

        expect(result.held.success).toBe(true);
        expect(result.reservedWhileHeld).toBe(true);
        expect(result.blocked.success).toBe(false);
        expect(result.reservedAfterRelease).toBe(false);
        expect(result.granted.success).toBe(true);
        expect(result.granted.currentLevel).toEqual(LockLevel.EXCLUSIVE);
    });

    test("lock is denied for a caller in no granted group", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                // user_3 is in neither the Store's roster nor the granted group.
                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("lock_group_public"),
                    gk.enc("lock_group_private"),
                    undefined,
                    gk.grants([group2], "manager"),
                );
                const resourceId = await gk.lockableFile(storeApi1, storeId);

                const conn3 = await window.Endpoint.connect(
                    users.u3.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const lockApi3 = await window.Endpoint.createLockApi(conn3);
                const uuid = gk.uuid();

                return {
                    lockRejected: await gk.caught(() =>
                        lockApi3.lock(resourceId, uuid, lockLevel.SHARED),
                    ),
                    checkRejected: await gk.caught(() =>
                        lockApi3.checkReservedLock(resourceId, uuid),
                    ),
                };
            },
            argsFor(backend, users),
        );

        expect(result.lockRejected).toBe(true);
        expect(result.checkRejected).toBe(true);
    });

    test("lock is lost after the grant is revoked", async ({ page, backend, cli }) => {
        const users = await setupUsers(page, cli);

        const result = await page.evaluate(
            async ({ bridgeUrl, solutionId, contextId, users, lockLevel }) => {
                const gk = window.gk;
                const conn1 = await window.Endpoint.connect(
                    users.u1.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const groupApi1 = await window.Endpoint.createGroupApi(conn1);
                const storeApi1 = await window.Endpoint.createStoreApi(conn1);
                const u1 = gk.u(users.u1);

                const group2 = await gk.mkGroup(
                    groupApi1,
                    contextId,
                    [users.u1, users.u2],
                    [users.u1],
                    "group_2",
                );
                const storeId = await storeApi1.createStore(
                    contextId,
                    [u1],
                    [u1],
                    gk.enc("lock_group_public"),
                    gk.enc("lock_group_private"),
                    undefined,
                    gk.grants([group2], "manager"),
                );
                const resourceId = await gk.lockableFile(storeApi1, storeId);

                const conn2 = await window.Endpoint.connect(
                    users.u2.privKey,
                    solutionId,
                    bridgeUrl,
                );
                const lockApi2 = await window.Endpoint.createLockApi(conn2);
                const uuid = gk.uuid();
                const beforeRevocation = await lockApi2.lock(resourceId, uuid, lockLevel.SHARED);
                await lockApi2.unlock(resourceId, uuid, lockLevel.NONE);

                const granted = await storeApi1.getStore(storeId);
                await storeApi1.updateStore(
                    storeId,
                    [u1],
                    [u1],
                    gk.enc("lock_group_revoked_public"),
                    gk.enc("lock_group_revoked_private"),
                    granted.version,
                    false,
                    false,
                    undefined,
                    [],
                );

                const afterRejected = await gk.caught(() =>
                    lockApi2.lock(resourceId, uuid, lockLevel.SHARED),
                );

                return { grantedGroups: granted.groups.length, beforeRevocation, afterRejected };
            },
            argsFor(backend, users),
        );

        expect(result.grantedGroups).toEqual(1);
        expect(result.beforeRevocation.success).toBe(true);
        expect(result.beforeRevocation.currentLevel).toEqual(LockLevel.SHARED);
        expect(result.afterRejected).toBe(true);
    });
});
