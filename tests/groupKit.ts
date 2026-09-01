/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Page } from "@playwright/test";
import type { GroupApi, StoreApi } from "../src";
import type { ContainerPolicy, Group, GroupGrantWithKey, UserWithPubKey } from "../src/Types";

/**
 * Browser-side helpers shared by the `*UsingGroups` specs, installed on
 * `window.gk` by {@link installGroupKit}.
 *
 * The C++ `<Module>UsingGroupsTest` fixtures get this for free: a gtest fixture
 * is a class, so `createThreadWithGroups`, `userOf` and friends are just
 * methods. Here every test body is a function serialized into the page, so a
 * closure cannot reach anything defined in the spec file - the helpers have to
 * live in the page itself. `page.goto` in `beforeEach` wipes them, so the
 * install has to follow every navigation.
 */
export interface GroupKit {
    /** `core::Buffer::from(s)`. */
    enc(s: string): Uint8Array;
    /** `buffer.stdString()`, tolerating the empty buffer an undecryptable field carries. */
    dec(u: Uint8Array | undefined): string;
    /** One of `setupUsers`' logins as a container names its members. */
    u(user: { id: string; pubKey: string }): UserWithPubKey;

    /**
     * A grant that names no epoch.
     *
     * `groupEpoch: 0` is what makes the endpoint resolve the group's current
     * epoch from the Bridge, which is the path most of these tests are about -
     * it mirrors the C++ helpers, which leave the field at its default.
     */
    grant(group: Group, role: string): GroupGrantWithKey;
    /** A grant pinned to the epoch the group is at right now. */
    grantAt(group: Group, role: string): GroupGrantWithKey;
    /** {@link grant} over a list, all at the same role. */
    grants(groups: Group[], role?: string): GroupGrantWithKey[];

    /** Creates a Group and returns it fully read back, the way every C++ test starts. */
    mkGroup(
        groupApi: GroupApi,
        contextId: string,
        users: { id: string; pubKey: string }[],
        managers: { id: string; pubKey: string }[],
        tag: string,
    ): Promise<Group>;

    /**
     * `get: "all"` plus an item policy that lets a non-member download
     * ciphertext, so a before/after difference is decryption and not
     * visibility.
     *
     * Every `item` entry is spelled out because the native side deserializes
     * `ItemPolicy` with non-optional fields - a partial one is rejected - and
     * the delete entry is `delete_` there, not `delete`, which is why this is
     * built through a cast.
     */
    readAllPolicy(): ContainerPolicy;
    /** `get: "all"` alone, for the containers that take no item policy. */
    readAllContainerPolicy(): ContainerPolicy;

    /** Fails the test if `fn` resolves; swallows the rejection otherwise. */
    expectError(fn: () => Promise<unknown>): Promise<void>;
    /** Whether `fn` rejected - reported back to Node instead of asserted in the page. */
    caught(fn: () => Promise<unknown>): Promise<boolean>;

    /** Uploads one file, whole payload in a single write, and returns its id. */
    uploadFile(
        storeApi: StoreApi,
        storeId: string,
        publicMeta: string,
        privateMeta: string,
        data: string,
    ): Promise<string>;
    /** Reads a whole file back through a read handle. */
    downloadFile(storeApi: StoreApi, fileId: string, size: number): Promise<string>;
    /**
     * A file that can be locked: only files created with random write support
     * are lockable, and the server rejects an arbitrary string as a resourceId.
     */
    lockableFile(storeApi: StoreApi, storeId: string): Promise<string>;
    /**
     * A lock uuid. The server restricts these to a charset that excludes `:`
     * and `-` and caps them at 60 characters, hence lowercase alphanumeric.
     */
    uuid(): string;
}

declare global {
    interface Window {
        gk: GroupKit;
    }
}

/**
 * Installs {@link GroupKit} on `window.gk`. Call after every `page.goto`.
 */
export async function installGroupKit(page: Page) {
    await page.evaluate(() => {
        const enc = new TextEncoder();
        const dec = new TextDecoder();

        const grantWithEpoch = (group: any, role: string, groupEpoch: number) => ({
            groupId: group.groupId,
            role,
            groupPubKey: group.groupPubKey,
            groupEpoch,
        });

        window.gk = {
            enc: (s: string) => enc.encode(s),
            dec: (u: Uint8Array | undefined) => (u ? dec.decode(u) : ""),
            u: (user: { id: string; pubKey: string }) => ({
                userId: user.id,
                pubKey: user.pubKey,
            }),

            grant: (group: any, role: string) => grantWithEpoch(group, role, 0),
            grantAt: (group: any, role: string) => grantWithEpoch(group, role, group.keyVersion),
            grants: (groups: any[], role = "user") => groups.map((g) => grantWithEpoch(g, role, 0)),

            mkGroup: async (
                groupApi: any,
                contextId: string,
                users: { id: string; pubKey: string }[],
                managers: { id: string; pubKey: string }[],
                tag: string,
            ) => {
                const toUser = (user: { id: string; pubKey: string }) => ({
                    userId: user.id,
                    pubKey: user.pubKey,
                });
                const groupId = await groupApi.createGroup(
                    contextId,
                    users.map(toUser),
                    managers.map(toUser),
                    enc.encode(`${tag}_public`),
                    enc.encode(`${tag}_private`),
                );
                return groupApi.getGroup(groupId);
            },

            readAllPolicy: () =>
                ({
                    get: "all",
                    item: {
                        get: "all",
                        listMy: "all",
                        listAll: "all",
                        create: "user",
                        update: "user",
                        delete_: "user",
                    },
                }) as any,
            readAllContainerPolicy: () => ({ get: "all" }) as any,

            expectError: async (fn: () => Promise<unknown>) => {
                try {
                    await fn();
                } catch {
                    return;
                }
                throw new Error("Expected error");
            },
            caught: async (fn: () => Promise<unknown>) => {
                try {
                    await fn();
                } catch {
                    return true;
                }
                return false;
            },

            uploadFile: async (
                storeApi: any,
                storeId: string,
                publicMeta: string,
                privateMeta: string,
                data: string,
            ) => {
                const payload = enc.encode(data);
                const handle = await storeApi.createFile(
                    storeId,
                    enc.encode(publicMeta),
                    enc.encode(privateMeta),
                    payload.length,
                );
                await storeApi.writeToFile(handle, payload);
                return storeApi.closeFile(handle);
            },
            downloadFile: async (storeApi: any, fileId: string, size: number) => {
                const handle = await storeApi.openFile(fileId);
                const data = await storeApi.readFromFile(handle, size);
                await storeApi.closeFile(handle);
                return dec.decode(data);
            },
            lockableFile: async (storeApi: any, storeId: string) => {
                const handle = await storeApi.createFile(
                    storeId,
                    enc.encode("lock_test_publicMeta"),
                    enc.encode("lock_test_privateMeta"),
                    0,
                    true, // randomWriteSupport
                );
                return storeApi.closeFile(handle);
            },
            uuid: () => {
                const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
                const bytes = new Uint8Array(32);
                window.crypto.getRandomValues(bytes);
                return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
            },
        };
    });
}
