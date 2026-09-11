import { Connection } from "../Connection.js";
import { GroupApi } from "../GroupApi.js";
import { groupGrant } from "../groupGrant.js";
import type { Group, PagingList, UserInfo } from "../../Types.js";

const group = {
    groupId: "g1",
    groupPubKey: "PUBKEY",
    keyVersion: 7,
} as Group;

describe("groupGrant", () => {
    test("copies the four fields a container checks", () => {
        expect(groupGrant(group, "user")).toEqual({
            groupId: "g1",
            role: "user",
            groupPubKey: "PUBKEY",
            groupEpoch: 7,
        });
    });

    test("carries the role through", () => {
        expect(groupGrant(group, "manager").role).toBe("manager");
    });
});

describe("GroupApi.grantFor", () => {
    /** Drives the method against a fake `getGroup`, with no native layer. */
    const grantFor = (role?: "user" | "manager") =>
        GroupApi.prototype.grantFor.call(
            { getGroup: async () => group } as never,
            "g1",
            role as never,
        );

    test("reads the Group and builds the grant, as a user by default", async () => {
        await expect(grantFor()).resolves.toEqual({
            groupId: "g1",
            role: "user",
            groupPubKey: "PUBKEY",
            groupEpoch: 7,
        });
    });

    test("takes the manager role", async () => {
        await expect(grantFor("manager")).resolves.toHaveProperty("role", "manager");
    });
});

/** Drives `resolveUsers` against a fake `listContextUsers`, with no native layer. */
function contextOf(userIds: string[]) {
    const all: UserInfo[] = userIds.map((userId) => ({
        user: { userId, pubKey: `key-of-${userId}` },
        isActive: true,
    }));
    const calls: number[] = [];
    const fake = {
        async listContextUsers(_contextId: string, q: { skip: number; limit: number }) {
            calls.push(q.skip);
            return {
                totalAvailable: all.length,
                readItems: all.slice(q.skip, q.skip + q.limit),
            } as PagingList<UserInfo>;
        },
    };
    const resolve = (contextId: string, ids?: string[]) =>
        Connection.prototype.resolveUsers.call(fake as never, contextId, ids);
    return { resolve, calls };
}

describe("Connection.resolveUsers", () => {
    test("returns the users in the order asked for", async () => {
        const { resolve } = contextOf(["alice", "bob", "dana"]);
        await expect(resolve("ctx", ["dana", "alice"])).resolves.toEqual([
            { userId: "dana", pubKey: "key-of-dana" },
            { userId: "alice", pubKey: "key-of-alice" },
        ]);
    });

    test("returns everyone when no ids are given", async () => {
        const { resolve } = contextOf(["alice", "bob"]);
        expect(await resolve("ctx")).toHaveLength(2);
    });

    test("throws on an id the Context does not know", async () => {
        const { resolve } = contextOf(["alice"]);
        await expect(resolve("ctx", ["alice", "ghost"])).rejects.toThrow(/ghost/);
    });

    test("pages past the first hundred", async () => {
        const many = Array.from({ length: 250 }, (_, i) => `u${i}`);
        const { resolve, calls } = contextOf(many);
        const users = await resolve("ctx", ["u0", "u249"]);
        expect(users.map((u) => u.userId)).toEqual(["u0", "u249"]);
        expect(calls).toEqual([0, 100, 200]);
    });
});
