import {
    fileReadable,
    fileWritable,
    openFileHandle,
    openGroupFile,
    progressStream,
    sealGroupFile,
    sealGroupFileAnonymously,
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
    const sealing = new Map<number, { size: number; sealed: number }>();
    const opening = new Map<number, { at: number }>();
    let nextHandle = 1;
    const feeds: number[] = [];
    const anonymousBegins: { groupId: string; groupPubKey: string; size: number }[] = [];

    const api = {
        async beginFileEncryption(_groupId: string, size: number) {
            const handle = nextHandle++;
            sealing.set(handle, { size, sealed: 0 });
            return handle;
        },
        async beginFileEncryptionAnonymously(groupId: string, groupPubKey: string, size: number) {
            anonymousBegins.push({ groupId, groupPubKey, size });
            return api.beginFileEncryption(groupId, size);
        },
        async encryptFileChunk(handle: number, chunk: Uint8Array) {
            sealing.get(handle)!.sealed += chunk.length;
            return flip(chunk);
        },
        async finishFileEncryption(handle: number) {
            const state = sealing.get(handle)!;
            if (state.sealed !== state.size) throw new Error("declared size not written");
            return new Uint8Array([1, 2, 3]);
        },
        async beginFileDecryption(_envelope: Uint8Array) {
            const handle = nextHandle++;
            opening.set(handle, { at: 0 });
            return handle;
        },
        async seekInEncryptedFile(handle: number, position: number) {
            const at = Math.floor(position / 100) * 100; // whole internal chunks only
            opening.get(handle)!.at = at;
            return at;
        },
        async decryptFileChunk(_handle: number, chunk: Uint8Array) {
            feeds.push(chunk.length);
            return flip(chunk);
        },
        async finishFileDecryption() {
            return { groupId: "g", authorPubKey: "", type: 2, complete: true };
        },
    };
    return { api: api as unknown as GroupFileApi, feeds, anonymousBegins };
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
    test("the anonymous sealer takes the anonymous path", async () => {
        const { api, anonymousBegins } = fakeGroup();
        const sealer = sealGroupFileAnonymously(api, {
            groupId: "g",
            groupPubKey: "PUBKEY",
            size: 10,
        });
        await collect(new Blob([bytes(10) as BlobPart]).stream().pipeThrough(sealer));
        await sealer.envelope;
        expect(anonymousBegins).toEqual([{ groupId: "g", groupPubKey: "PUBKEY", size: 10 }]);
    });

    test("seals a file and yields the envelope after the stream closes", async () => {
        const { api } = fakeGroup();
        const data = bytes(250);
        const sealer = sealGroupFile(api, { groupId: "g", size: data.length });
        const sealed = await collect(new Blob([data as BlobPart]).stream().pipeThrough(sealer));
        expect(await sealer.envelope).toEqual(new Uint8Array([1, 2, 3]));
        expect(sealed).toEqual(data.map((b) => b ^ 0xff));
    });

    test("a short upload fails the envelope rather than passing silently", async () => {
        const { api } = fakeGroup();
        const sealer = sealGroupFile(api, { groupId: "g", size: 999 });
        await expect(
            collect(new Blob([bytes(10) as BlobPart]).stream().pipeThrough(sealer)),
        ).rejects.toThrow("declared size not written");
        await expect(sealer.envelope).rejects.toThrow("declared size not written");
    });

    test("an aborted seal rejects the envelope instead of hanging", async () => {
        const { api } = fakeGroup();
        const sealer = sealGroupFile(api, { groupId: "g", size: 100 });
        void sealer.readable.cancel();
        await sealer.writable.abort(new Error("gone"));
        await expect(sealer.envelope).rejects.toThrow("gone");
    });

    test("opens a range and reports where the ciphertext must be read from", async () => {
        const { api } = fakeGroup();
        const plain = bytes(1000);
        const cipher = plain.map((b) => b ^ 0xff);

        const reader = await openGroupFile(api, new Uint8Array([1]), { from: 250, length: 20 });
        expect(reader.ciphertextOffset).toBe(200); // start of the chunk holding byte 250

        const out = await collect(
            new Blob([cipher.slice(reader.ciphertextOffset) as BlobPart])
                .stream()
                .pipeThrough(reader.stream),
        );
        expect(out.length).toBe(20);
        expect((await reader.info).complete).toBe(true);
    });

    test("feeds larger than the 4 MiB limit are split", async () => {
        const { api, feeds } = fakeGroup();
        const reader = await openGroupFile(api, new Uint8Array([1]));
        const big = new Uint8Array(9 * 1_048_576);
        await collect(new Blob([big as BlobPart]).stream().pipeThrough(reader.stream));
        expect(Math.max(...feeds)).toBeLessThanOrEqual(4 * 1_048_576);
    });
});
