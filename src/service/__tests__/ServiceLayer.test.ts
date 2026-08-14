/**
 * Service-layer unit tests: mock the native layer to verify argument marshalling,
 * post-disconnect invalidation, and the EventQueue/Connection orchestration.
 */
import type { Mock } from "vitest";
import { ThreadApi } from "../ThreadApi.js";
import { StoreApi } from "../StoreApi.js";
import { CryptoApi } from "../CryptoApi.js";
import { EventQueue } from "../EventQueue.js";
import { Connection } from "../Connection.js";
import type { ConnectionServices } from "../Connection.js";
import type { ThreadApiNative } from "../../native/ThreadApiNative.js";
import type { StoreApiNative } from "../../native/StoreApiNative.js";
import type { CryptoApiNative } from "../../native/CryptoApiNative.js";
import type { EventQueueNative } from "../../native/EventQueueNative.js";
import type { ConnectionNative } from "../../native/ConnectionNative.js";

const PTR = 42;

/** Builds a native-layer mock whose listed methods are vi.fn() resolving to `ret`. */
function nativeMock<T>(methods: string[], ret: unknown = undefined): T {
    const obj: Record<string, Mock> = {};
    for (const m of methods) obj[m] = vi.fn().mockResolvedValue(ret);
    return obj as unknown as T;
}

describe("ThreadApi argument marshalling", () => {
    const native = nativeMock<ThreadApiNative>(
        ["createThread", "sendMessage", "listMessages", "deleteMessage"],
        "ok",
    );
    const api = new ThreadApi(native, PTR);
    const m = native as unknown as Record<string, Mock>;

    it("createThread forwards (ptr, [contextId, users, managers, publicMeta, privateMeta, policies])", async () => {
        const users = [{ userId: "u", pubKey: "p" }];
        const pub = new Uint8Array([1]);
        const priv = new Uint8Array([2]);
        await api.createThread("ctx", users, users, pub, priv);
        expect(m.createThread).toHaveBeenCalledWith(PTR, ["ctx", users, users, pub, priv, undefined]);
    });

    it("sendMessage forwards (ptr, [threadId, publicMeta, privateMeta, data])", async () => {
        const data = new Uint8Array([9]);
        await api.sendMessage("tid", new Uint8Array(), new Uint8Array(), data);
        expect(m.sendMessage).toHaveBeenCalledWith(PTR, [
            "tid",
            new Uint8Array(),
            new Uint8Array(),
            data,
        ]);
    });

    it("listMessages forwards (ptr, [threadId, pagingQuery])", async () => {
        const q = { skip: 0, limit: 10, sortOrder: "desc" as const };
        await api.listMessages("tid", q);
        expect(m.listMessages).toHaveBeenCalledWith(PTR, ["tid", q]);
    });
});

describe("StoreApi file workflow marshalling", () => {
    const native = nativeMock<StoreApiNative>(
        ["createFile", "writeToFile", "openFile", "readFromFile", "closeFile"],
        7,
    );
    const api = new StoreApi(native, PTR);
    const m = native as unknown as Record<string, Mock>;

    it("createFile defaults randomWriteSupport to false", async () => {
        const pub = new Uint8Array([1]);
        const priv = new Uint8Array([2]);
        await api.createFile("store", pub, priv, 123);
        expect(m.createFile).toHaveBeenCalledWith(PTR, ["store", pub, priv, 123, false]);
    });

    it("writeToFile defaults truncate to false", async () => {
        const chunk = new Uint8Array([5]);
        await api.writeToFile(7, chunk);
        expect(m.writeToFile).toHaveBeenCalledWith(PTR, [7, chunk, false]);
    });

    it("openFile / readFromFile / closeFile forward handles", async () => {
        await api.openFile("fid");
        expect(m.openFile).toHaveBeenCalledWith(PTR, ["fid"]);
        await api.readFromFile(7, 1024);
        expect(m.readFromFile).toHaveBeenCalledWith(PTR, [7, 1024]);
        await api.closeFile(7);
        expect(m.closeFile).toHaveBeenCalledWith(PTR, [7]);
    });
});

describe("CryptoApi argument order", () => {
    const native = nativeMock<CryptoApiNative>(["signData", "derivePublicKey"], "x");
    const api = new CryptoApi(native, PTR);
    const m = native as unknown as Record<string, Mock>;

    it("signData forwards (ptr, [data, privateKey])", async () => {
        const data = new Uint8Array([1]);
        await api.signData(data, "priv");
        expect(m.signData).toHaveBeenCalledWith(PTR, [data, "priv"]);
    });

    it("derivePublicKey forwards (ptr, [privateKey])", async () => {
        await api.derivePublicKey("priv");
        expect(m.derivePublicKey).toHaveBeenCalledWith(PTR, ["priv"]);
    });
});

describe("EventQueue", () => {
    it("waitEvent dedups concurrent calls into one native wait", async () => {
        let resolveNative: (e: unknown) => void = () => {};
        const native = {
            waitEvent: vi.fn(() => new Promise((r) => (resolveNative = r))),
            emitBreakEvent: vi.fn().mockResolvedValue(undefined),
        } as unknown as EventQueueNative;
        const queue = new EventQueue(native, PTR);

        const a = queue.waitEvent();
        const b = queue.waitEvent();
        expect((native as unknown as Record<string, Mock>).waitEvent).toHaveBeenCalledTimes(1);

        resolveNative({ type: "x" });
        expect(await a).toEqual({ type: "x" });
        expect(await b).toEqual({ type: "x" });

        // After the in-flight wait settles, a fresh wait starts a new native call.
        queue.waitEvent();
        expect((native as unknown as Record<string, Mock>).waitEvent).toHaveBeenCalledTimes(2);
    });
});

describe("Connection teardown", () => {
    it("disconnect closes the session, frees registered APIs, then deletes the connection", async () => {
        const native = nativeMock<ConnectionNative>(["disconnect", "deleteConnection"]);
        // Services are unused on this path (no event manager is created).
        const connection = new Connection(native, PTR, {} as unknown as ConnectionServices);
        const m = native as unknown as Record<string, Mock>;

        // Register a fake API whose native + JS wrapper must be torn down.
        const apiNative = { deleteApi: vi.fn().mockResolvedValue(undefined) };
        const jsApi = { destroyRefs: vi.fn() };
        connection.registerApi("threads", 99, apiNative as never, jsApi as never);

        await connection.disconnect();

        expect(m.disconnect).toHaveBeenCalledWith(PTR, []);
        expect(jsApi.destroyRefs).toHaveBeenCalledTimes(1);
        expect(apiNative.deleteApi).toHaveBeenCalledWith(99);
        expect(m.deleteConnection).toHaveBeenCalledWith(PTR);
    });
});

describe("BaseApi invalidation (shared by every API)", () => {
    it("methods reject after destroyRefs() / disconnect", async () => {
        const native = nativeMock<ThreadApiNative>(["listThreads"]);
        const api = new ThreadApi(native, PTR);
        api.destroyRefs();
        await expect(api.listThreads("ctx", { skip: 0, limit: 1, sortOrder: "desc" })).rejects.toThrow(
            /no longer valid/,
        );
    });
});
