/**
 * GroupApi's roster calls that are neither an addition nor a removal, the
 * rules and the log, and the two Connection calls a key change needs: what
 * reaches the core, and what comes back. One check per method.
 */

import { describe, expect, it, vi, type Mock } from "vitest";
import { GroupApi } from "../GroupApi.js";
import { Connection } from "../Connection.js";
import type { GroupApiNative } from "../../native/GroupApiNative.js";
import type { ConnectionNative } from "../../native/ConnectionNative.js";
import type { ConnectionServices } from "../Connection.js";

const PTR = 7;

function setup(returns: Record<string, unknown> = {}) {
    const native: Record<string, Mock> = {};
    for (const m of ["reseatGroupMembers", "setGroupRoles", "updateGroupRules", "getGroupLog"]) {
        native[m] = vi.fn().mockResolvedValue(returns[m]);
    }
    return { api: new GroupApi(native as unknown as GroupApiNative, PTR), native };
}

describe("GroupApi roster calls", () => {
    it("reseatGroupMembers forwards the members and returns the epoch it made", async () => {
        const { api, native } = setup({ reseatGroupMembers: 5 });
        await expect(api.reseatGroupMembers("g1", ["bob"])).resolves.toBe(5);
        expect(native.reseatGroupMembers).toHaveBeenCalledWith(PTR, ["g1", ["bob"]]);
    });

    it("setGroupRoles forwards each member with its role", async () => {
        const { api, native } = setup();
        const changes = [
            { userId: "bob", role: "manager" as const },
            { userId: "carol", role: "user" as const },
        ];
        await api.setGroupRoles("g1", changes);
        expect(native.setGroupRoles).toHaveBeenCalledWith(PTR, ["g1", changes]);
    });

    it("updateGroupRules sends only the rules named", async () => {
        const { api, native } = setup();
        await api.updateGroupRules("g1", { removeMembers: "user" });
        expect(native.updateGroupRules).toHaveBeenCalledWith(PTR, [
            "g1",
            { removeMembers: "user" },
        ]);
    });

    it("getGroupLog maps the core's keyVersion to epoch and keeps the rest", async () => {
        const entry = {
            seq: 3,
            kind: "reseat",
            author: "alice",
            authorPubKey: "PK",
            date: 1700000000000,
            keyVersion: 2,
            rosterVersion: 4,
            addedUsers: [] as string[],
            addedManagers: [] as string[],
            removed: ["bob"],
        };
        const { api, native } = setup({ getGroupLog: { totalAvailable: 3, readItems: [entry] } });
        const query = { skip: 0, limit: 1, sortOrder: "desc" as const };
        const page = await api.getGroupLog("g1", query);
        expect(native.getGroupLog).toHaveBeenCalledWith(PTR, ["g1", query]);
        expect(page.totalAvailable).toBe(3);
        const { keyVersion, ...rest } = entry;
        expect(page.readItems).toEqual([{ ...rest, epoch: keyVersion }]);
        expect(page.readItems[0]).not.toHaveProperty("keyVersion");
    });
});

describe("Connection key-change calls", () => {
    function connection() {
        const native = {
            renewIdentity: vi.fn().mockResolvedValue(undefined),
            acceptKeyChange: vi.fn().mockResolvedValue(undefined),
            useKeyContinuity: vi.fn().mockResolvedValue(undefined),
        };
        return {
            conn: new Connection(
                native as unknown as ConnectionNative,
                PTR,
                {} as ConnectionServices,
            ),
            native,
        };
    }

    it("renewIdentity forwards the previous key", async () => {
        const { conn, native } = connection();
        await conn.renewIdentity("WIF");
        expect(native.renewIdentity).toHaveBeenCalledWith(PTR, ["WIF"]);
    });

    it("useKeyContinuity is a call of its own: nothing turns it on by default", async () => {
        const { conn, native } = connection();
        expect(native.useKeyContinuity).not.toHaveBeenCalled();
        await conn.useKeyContinuity();
        expect(native.useKeyContinuity).toHaveBeenCalledWith(PTR, []);
    });

    it("acceptKeyChange names the Context, the user, and the keys in order: previous, then new", async () => {
        const { conn, native } = connection();
        await conn.acceptKeyChange("ctx", "bob", "OLD", "NEW");
        expect(native.acceptKeyChange).toHaveBeenCalledWith(PTR, ["ctx", "bob", "OLD", "NEW"]);
    });
});
