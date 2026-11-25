import {
    fileReadable,
    fileWritable,
    openFileHandle,
    openGroupFile,
    progressStream,
    sealGroupFile,
    takeStream,
    uploadFile,
    type FileReadApi,
    type FileWriteApi,
    type GroupFileApi,
} from "../fileStreams.js";

const bytes = (n: number, seed = 0) =>
    new Uint8Array(Array.from({ length: n }, (_, i) => (i + seed) % 251));

const collect = async (stream: ReadableStream<Uint8Array>) => {
    const chunks = await readAll(stream);
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    chunks.reduce((off, c) => (out.set(c, off), off + c.length), 0);
    return out;
};

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return chunks;
        chunks.push(value);
    }
}

/** A Store that keeps files in memory and mimics the real read/write contract. */
function fakeStore() {
    const files = new Map<string, Uint8Array>();
    const writes = new Map<number, { storeId: string; parts: Uint8Array[] }>();
    const reads = new Map<number, { data: Uint8Array; at: number }>();
    let nextHandle = 1;
    const closed: number[] = [];

    const api = {
        async createFile(storeId: string) {
            const handle = nextHandle++;
            writes.set(handle, { storeId, parts: [] });
            return handle;
        },
        async writeToFile(handle: number, chunk: Uint8Array) {
            writes.get(handle)!.parts.push(chunk);
        },
        async openFile(fileId: string) {
            const handle = nextHandle++;
            reads.set(handle, { data: files.get(fileId)!, at: 0 });
            return handle;
        },
        async readFromFile(handle: number, length: number) {
            const state = reads.get(handle)!;
            const slice = state.data.slice(state.at, state.at + length);
            state.at += slice.length;
            return slice;
        },
        async seekInFile(handle: number, position: number) {
            reads.get(handle)!.at = position;
        },
        async deleteFile(fileId: string) {
            files.delete(fileId);
        },
        async closeFile(handle: number) {
            closed.push(handle);
            const write = writes.get(handle);
            if (!write) {
                reads.delete(handle);
                return "";
            }
            const total = write.parts.reduce((n, p) => n + p.length, 0);
            const joined = new Uint8Array(total);
            write.parts.reduce((off, p) => (joined.set(p, off), off + p.length), 0);
            const fileId = `file-${handle}`;
            files.set(fileId, joined);
            writes.delete(handle);
            return fileId;
        },
    };
    return { api: api as unknown as FileReadApi & FileWriteApi, files, closed };
}

/** A Group whose "cipher" is a reversible byte flip, chunked at 100 bytes. */
function fakeGroup() {
    const flip = (b: Uint8Array) => b.map((x) => x ^ 0xff);
    let nextHandle = 1;
    const feeds: number[] = [];
    const finished: number[] = [];
    const aborted: number[] = [];

    const api: GroupFileApi = {
        async abortFile(handle) {
            aborted.push(handle);
        },
        async encryptFileChunk(_handle, chunk) {
            return flip(chunk);
        },
        async finishFileEncryption(handle) {
            finished.push(handle);
            return new Uint8Array([1, 2, 3]);
        },
        async seekInEncryptedFile(_handle, position) {
            return Math.floor(position / 100) * 100; // whole internal chunks only
        },
        async getFileCipherRange(_handle, from, to) {
            const offset = Math.floor(from / 100) * 100;
            return { offset, length: Math.ceil(to / 100) * 100 - offset };
        },
        async decryptFileChunk(_handle, chunk) {
            feeds.push(chunk.length);
            return flip(chunk);
        },
        async finishFileDecryption() {
            return { epoch: 1, size: 1000, complete: true, sharedWith: { groups: [], users: [] } };
        },
    };
    return { api, feeds, finished, aborted, begin: () => Promise.resolve(nextHandle++) };
}

describe("progressStream / takeStream", () => {
    test("progress reports a running total and passes bytes through", async () => {
        const seen: number[] = [];
        const src = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(bytes(10));
                c.enqueue(bytes(5));
                c.close();
            },
        });
        const out = await collect(src.pipeThrough(progressStream((n: number) => seen.push(n))));
        expect(seen).toEqual([10, 15]);
        expect(out.length).toBe(15);
    });

    test("take stops at the limit even mid-chunk", async () => {
        const src = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(bytes(10));
                c.enqueue(bytes(10));
                c.close();
            },
        });
        const out = await collect(src.pipeThrough(takeStream(14)));
        expect(out.length).toBe(14);
    });
});

describe("store files", () => {
    test("round-trips a file and closes every handle", async () => {
        const { api, closed } = fakeStore();
        const data = bytes(2500);

        const { stream, fileId } = fileWritable(api, { storeId: "s1", size: data.length });
        await new Blob([data as BlobPart]).stream().pipeTo(stream);
        const id = await fileId;

        const read = await collect(fileReadable(api, id, { chunkSize: 1000 }));
        expect(read).toEqual(data);
        expect(closed.length).toBe(2); // the write handle and the read handle
    });

    test("reads a range without touching the rest", async () => {
        const { api } = fakeStore();
        const data = bytes(1000);
        const { stream, fileId } = fileWritable(api, { storeId: "s", size: data.length });
        await new Blob([data as BlobPart]).stream().pipeTo(stream);

        const part = await collect(
            fileReadable(api, await fileId, { from: 400, length: 50, chunkSize: 32 }),
        );
        expect(part).toEqual(data.slice(400, 450));
    });

    test("an aborted upload commits nothing and rejects the id", async () => {
        const { api, files, closed } = fakeStore();
        const { stream, fileId } = fileWritable(api, { storeId: "s", size: 100 });
        const writer = stream.getWriter();
        await writer.write(bytes(10));
        await writer.abort(new Error("user cancelled"));

        await expect(fileId).rejects.toThrow("user cancelled");
        expect(files.size).toBe(0);
        expect(closed.length).toBe(1); // handle released, not committed
    });

    test("openStoreFile releases the handle on close", async () => {
        const { api, closed } = fakeStore();
        const { stream, fileId } = fileWritable(api, { storeId: "s", size: 100 });
        await new Blob([bytes(100) as BlobPart]).stream().pipeTo(stream);

        const file = await openFileHandle(api as never, await fileId);
        await file.seek(90);
        expect((await file.read(10)).length).toBe(10);
        await file.close();
        await file.close(); // idempotent
        expect(closed.length).toBe(2);
    });

    test("uploadFile reports progress and returns the id", async () => {
        const { api, files } = fakeStore();
        const seen: number[] = [];
        const file = new File([bytes(300) as BlobPart], "a.bin");
        const id = await uploadFile(api, {
            storeId: "s",
            file,
            onProgress: (n: number) => seen.push(n),
        });
        expect(files.get(id)!.length).toBe(300);
        expect(seen.at(-1)).toBe(300);
    });
});

describe("group files", () => {
    test("seals a file of any size and yields the envelope after the stream closes", async () => {
        const { api, begin, finished } = fakeGroup();
        const data = bytes(250);
        const sealer = sealGroupFile(api, begin());
        const sealed = await collect(new Blob([data as BlobPart]).stream().pipeThrough(sealer));
        expect(await sealer.envelope).toEqual(new Uint8Array([1, 2, 3]));
        expect(sealed).toEqual(data.map((b) => b ^ 0xff));
        expect(finished).toEqual([1]);
    });

    test("a file that cannot be begun fails the envelope rather than passing silently", async () => {
        const { api } = fakeGroup();
        const sealer = sealGroupFile(api, Promise.reject(new Error("not a member")));
        await expect(
            collect(new Blob([bytes(10) as BlobPart]).stream().pipeThrough(sealer)),
        ).rejects.toThrow("not a member");
        await expect(sealer.envelope).rejects.toThrow();
    });

    test("a sealer never written to still handles a failed begin, and its envelope says so", async () => {
        const { api } = fakeGroup();
        const unhandled = vi.fn();
        process.on("unhandledRejection", unhandled);
        const sealer = sealGroupFile(api, Promise.reject(new Error("not a member")));
        await expect(sealer.envelope).rejects.toThrow("not a member");
        await new Promise((r) => setTimeout(r, 0));
        process.off("unhandledRejection", unhandled);
        expect(unhandled).not.toHaveBeenCalled();
    });

    test("an aborted seal rejects the envelope instead of hanging", async () => {
        const { api, begin } = fakeGroup();
        const sealer = sealGroupFile(api, begin());
        void sealer.readable.cancel();
        await sealer.writable.abort(new Error("gone"));
        await expect(sealer.envelope).rejects.toThrow("gone");
    });

    test("a file given up on releases its handle: a cancelled or failed seal, a bad chunk, a cancelled read", async () => {
        const { api, begin, aborted } = fakeGroup();
        const cancelled = sealGroupFile(api, begin()); // handle 1
        void cancelled.readable.cancel();
        await cancelled.writable.abort(new Error("gone"));

        api.finishFileEncryption = () => Promise.reject(new Error("key")); // the core keeps the handle open
        await expect(collect(new Blob([bytes(10) as BlobPart]).stream().pipeThrough(sealGroupFile(api, begin())))).rejects.toThrow("key");

        api.decryptFileChunk = () => Promise.reject(new Error("corrupted"));
        const bad = await openGroupFile(api, 3);
        await expect(collect(new Blob([bytes(10) as BlobPart]).stream().pipeThrough(bad.stream))).rejects.toThrow("corrupted");
        await expect(bad.info).rejects.toThrow("corrupted");

        const dropped = await openGroupFile(api, 4);
        await dropped.stream.writable.abort(new Error("user"));

        api.seekInEncryptedFile = () => Promise.reject(new Error("range"));
        await expect(openGroupFile(api, 5, { from: 10 })).rejects.toThrow("range");

        await new Promise((r) => setTimeout(r, 0));
        expect(new Set(aborted)).toEqual(new Set([1, 2, 3, 4, 5]));
    });

    test("opens a range and reports which ciphertext bytes hold it", async () => {
        const { api } = fakeGroup();
        const plain = bytes(1000);
        const cipher = plain.map((b) => b ^ 0xff);

        const reader = await openGroupFile(api, 1, { from: 250, length: 20 });
        expect(reader.cipherRange).toEqual({ offset: 200, length: 100 }); // the chunk holding 250..270

        const { offset, length } = reader.cipherRange;
        const out = await collect(
            new Blob([cipher.slice(offset, offset + length!) as BlobPart])
                .stream()
                .pipeThrough(reader.stream),
        );
        expect(out.length).toBe(20);
        expect((await reader.info).size).toBe(1000);
    });

    test("an open-ended range runs to the end of the ciphertext; no range is the whole file", async () => {
        const { api } = fakeGroup();
        expect((await openGroupFile(api, 1, { from: 250 })).cipherRange).toEqual({ offset: 200 });
        expect((await openGroupFile(api, 2)).cipherRange).toEqual({ offset: 0 });
    });

    test("feeds larger than the 4 MiB limit are split", async () => {
        const { api, feeds } = fakeGroup();
        const reader = await openGroupFile(api, 1);
        const big = new Uint8Array(9 * 1_048_576);
        await collect(new Blob([big as BlobPart]).stream().pipeThrough(reader.stream));
        expect(Math.max(...feeds)).toBeLessThanOrEqual(4 * 1_048_576);
    });
});
