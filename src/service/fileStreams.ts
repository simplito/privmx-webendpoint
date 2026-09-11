/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Files as Web Streams - the machinery behind `GroupApi.sealFile`,
 * `GroupApi.sealFileAnonymously`, `GroupApi.openFile`, `StoreApi.uploadFile`
 * and friends.
 *
 * The chunked file APIs are the contract with the WASM core and stay as they
 * are; this wraps them in `ReadableStream` / `WritableStream` /
 * `TransformStream` so a transfer is something you describe once rather than a
 * pump loop written again in every app. Three things come with the stream types
 * and are not free in a hand-written loop: **backpressure** (a slow sink
 * throttles the producer, which is what keeps a large file from exhausting the
 * WASM heap), **cancellation** through one `AbortSignal` for the whole chain,
 * and composition with everything else that speaks streams - `File.stream()`,
 * `Response.body`, `FileSystemWritableFileStream`.
 *
 * The crypto already runs on the WASM worker threads; these wrappers do not move
 * work off the main thread, they only shape how the bytes get there.
 *
 * Everything here takes the API it works on as an argument. That is the shape
 * the class methods delegate to - call those instead.
 */
import type { DecryptedFileInfo } from "../Types.js";

/** What sealing and opening Group files needs. @internal */
export interface GroupFileApi {
    beginFileEncryption(groupId: string, size: number): Promise<number>;
    beginFileEncryptionAnonymously(
        groupId: string,
        groupPubKey: string,
        size: number,
    ): Promise<number>;
    encryptFileChunk(handle: number, chunk: Uint8Array): Promise<Uint8Array>;
    finishFileEncryption(handle: number): Promise<Uint8Array>;
    beginFileDecryption(envelope: Uint8Array): Promise<number>;
    decryptFileChunk(handle: number, chunk: Uint8Array): Promise<Uint8Array>;
    seekInEncryptedFile(handle: number, position: number): Promise<number>;
    finishFileDecryption(handle: number): Promise<DecryptedFileInfo>;
}

/** What reading a container file needs. @internal */
export interface FileReadApi {
    openFile(fileId: string): Promise<number>;
    readFromFile(handle: number, length: number): Promise<Uint8Array>;
    closeFile(handle: number): Promise<string>;
    seekInFile?(handle: number, position: number): Promise<void>;
}

/**
 * Anything with a size and a stream: a browser `File`, a `Blob`, or your own
 * object. Named structurally because `File` in the Store API means a *stored*
 * file, not the browser type.
 */
export interface FileLike {
    /** Total size in bytes - declared to the container before the first chunk. */
    readonly size: number;
    /** The content, as a stream that can be read once. */
    stream(): ReadableStream<Uint8Array>;
}

/** What writing a Store file needs. @internal */
export interface FileWriteApi {
    createFile(
        storeId: string,
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        size: number,
    ): Promise<number>;
    writeToFile(handle: number, chunk: Uint8Array): Promise<void>;
    closeFile(handle: number): Promise<string>;
    deleteFile(fileId: string): Promise<void>;
}

/**
 * `Transformer.cancel` exists in every browser this SDK supports, but not in
 * the DOM types this package is built against.
 */
interface CancellableTransformer {
    cancel?: (reason: unknown) => void;
}

/** Read size used when nothing else is specified. */
export const DEFAULT_CHUNK_SIZE = 1_048_576;

/** `GroupApi.decryptFileChunk` rejects anything larger, so feeds are split at this. */
const MAX_DECRYPT_CHUNK = 4 * 1_048_576;

/**
 * Counts bytes as they pass through, unchanged.
 *
 * Insert it anywhere in a pipeline to report progress - before an encryption
 * stream to measure plaintext, after it to measure what actually goes on the
 * wire.
 *
 * @param {(bytesSoFar: number) => void} onProgress called after every chunk with
 *   the running total; compare it against a size you already know
 * @returns {TransformStream<Uint8Array, Uint8Array>} pass-through stream
 */
export function progressStream(
    onProgress: (bytesSoFar: number) => void,
): TransformStream<Uint8Array, Uint8Array> {
    let total = 0;
    return new TransformStream({
        transform(chunk, controller) {
            total += chunk.length;
            onProgress(total);
            controller.enqueue(chunk);
        },
    });
}

/**
 * Passes through at most `limit` bytes, then ends the stream.
 *
 * Useful after a ranged read: a seeked decryption yields whole internal chunks,
 * so the tail usually runs past what you asked for.
 *
 * @param {number} limit maximum number of bytes to emit
 * @returns {TransformStream<Uint8Array, Uint8Array>} truncating stream
 */
export function takeStream(limit: number): TransformStream<Uint8Array, Uint8Array> {
    let left = limit;
    return new TransformStream({
        transform(chunk, controller) {
            if (left <= 0) return;
            const piece = chunk.length <= left ? chunk : chunk.slice(0, left);
            left -= piece.length;
            controller.enqueue(piece);
            if (left <= 0) controller.terminate();
        },
    });
}

// --- Store / Inbox files ---------------------------------------------------

/**
 * Reads a Store (or Inbox) file as a stream.
 *
 * The handle is opened when the stream is first pulled from and closed when it
 * ends, is cancelled, or errors - including when a `pipeTo` is aborted - so
 * there is no handle to leak.
 *
 * @param {FileReadApi} api `StoreApi` or `InboxApi`
 * @param {string} fileId ID of the file to read
 * @param {object} [opts] `from` - plaintext offset to start at (needs a
 *   `seekInFile`-capable api); `length` - stop after this many bytes;
 *   `chunkSize` - bytes per read, default 1 MiB
 * @returns {ReadableStream<Uint8Array>} the file's decrypted content
 * @example
 * const text = await new Response(storeFileReadable(store, fileId)).text();
 */
export function fileReadable(
    api: FileReadApi,
    fileId: string,
    opts: { from?: number; length?: number; chunkSize?: number } = {},
): ReadableStream<Uint8Array> {
    const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    let handle: number | undefined;
    let left = opts.length ?? Infinity;

    const source = new ReadableStream<Uint8Array>({
        async start() {
            handle = await api.openFile(fileId);
            if (opts.from) {
                if (!api.seekInFile) throw new Error("this API cannot seek in files");
                await api.seekInFile(handle, opts.from);
            }
        },
        async pull(controller) {
            const want = Math.min(chunkSize, left);
            const chunk = await api.readFromFile(handle!, want);
            if (chunk.length === 0) {
                controller.close();
                await api.closeFile(handle!);
                handle = undefined;
                return;
            }
            left -= chunk.length;
            controller.enqueue(chunk);
            if (left <= 0) {
                controller.close();
                await api.closeFile(handle!);
                handle = undefined;
            }
        },
        async cancel() {
            if (handle !== undefined) await api.closeFile(handle);
            handle = undefined;
        },
    });
    return source;
}

/**
 * Creates a Store file and returns a stream to write it into.
 *
 * The file is committed - and becomes visible to other members - when the
 * stream closes; `fileId` resolves then. Aborting the stream deletes whatever
 * was committed on the way out and rejects `fileId`, so a cancelled upload
 * leaves no truncated file behind.
 *
 * `size` is declared up front, as `StoreApi.createFile` requires: write exactly
 * that many bytes.
 *
 * @param {StoreApi} api the Store API
 * @param {object} opts `storeId`, total `size` in bytes, and optional
 *   `publicMeta` (unencrypted!) / `privateMeta`
 * @returns {{stream: WritableStream<Uint8Array>, fileId: Promise<string>}} sink
 *   to pipe into, and the ID the commit produced
 * @example
 * const { stream, fileId } = storeFileWritable(store, { storeId, size: file.size });
 * await file.stream().pipeTo(stream);
 * console.log("committed as", await fileId);
 */
export function fileWritable(
    api: FileWriteApi,
    opts: { storeId: string; size: number; publicMeta?: Uint8Array; privateMeta?: Uint8Array },
): StoreFileWriter {
    let handle: number | undefined;
    let settle: (id: string) => void;
    let fail: (e: unknown) => void;
    const fileId = new Promise<string>((resolve, reject) => {
        settle = resolve;
        fail = reject;
    });
    // Nobody may await `fileId` before the pipe finishes; without this the
    // rejection on abort would be unhandled and crash the page.
    fileId.catch(() => {});

    const stream = new WritableStream<Uint8Array>({
        async start() {
            handle = await api.createFile(
                opts.storeId,
                opts.publicMeta ?? new Uint8Array(),
                opts.privateMeta ?? new Uint8Array(),
                opts.size,
            );
        },
        async write(chunk) {
            await api.writeToFile(handle!, chunk);
        },
        async close() {
            settle(await api.closeFile(handle!));
            handle = undefined;
        },
        async abort(reason) {
            // `closeFile` on a write handle *commits*, so aborting has to undo
            // that - otherwise a cancelled upload leaves a truncated file
            // behind, visible to every member of the Store.
            if (handle !== undefined) {
                const partial = await api.closeFile(handle).catch(() => "");
                if (partial) await api.deleteFile(partial).catch(() => {});
            }
            handle = undefined;
            fail(reason);
        },
    });
    return { stream, fileId };
}

/** The two halves of a streamed upload: where to write, and what it became. */
export interface StoreFileWriter {
    /** Pipe the file into this. Closing it commits; aborting it deletes the part written. */
    stream: WritableStream<Uint8Array>;
    /** Resolves with the committed file's ID, or rejects if the upload was aborted. */
    fileId: Promise<string>;
}

/** An open Store file handle that closes itself at the end of its scope. */
export interface StoreFileHandle {
    /** The raw handle, for calls this wrapper does not cover. */
    readonly handle: number;
    /** Reads up to `length` bytes from the cursor; shorter near the end of the file. */
    read(length?: number): Promise<Uint8Array>;
    /** Moves the cursor to an absolute plaintext offset. */
    seek(position: number): Promise<void>;
    /** Releases the handle. Safe to call twice. */
    close(): Promise<void>;
}

/**
 * Opens a Store file for reading and hands back a handle that closes itself.
 *
 * On a runtime with `Symbol.asyncDispose` the handle is disposable, so
 * `await using` releases it on the way out of the scope - including on a throw.
 * Elsewhere, call {@link StoreFileHandle.close}.
 *
 * @param {StoreApi} api the Store API
 * @param {string} fileId ID of the file to open
 * @returns {Promise<StoreFileHandle>} the open handle
 * @example
 * await using f = await openStoreFile(store, fileId);
 * await f.seek(1 << 20);
 * const head = await f.read(64);
 */
export async function openFileHandle(
    api: FileReadApi & { seekInFile(handle: number, position: number): Promise<void> },
    fileId: string,
): Promise<StoreFileHandle> {
    const handle = await api.openFile(fileId);
    let open = true;
    const file: StoreFileHandle = {
        handle,
        read: (length = DEFAULT_CHUNK_SIZE) => api.readFromFile(handle, length),
        seek: (position) => api.seekInFile(handle, position),
        async close() {
            if (!open) return;
            open = false;
            await api.closeFile(handle);
        },
    };
    // `lib` here stops at es2021, so the symbol is wired at runtime rather than
    // typed; consumers compiling with esnext.disposable get `await using`.
    const asyncDispose = (Symbol as { asyncDispose?: symbol }).asyncDispose;
    if (asyncDispose)
        (file as unknown as Record<symbol, unknown>)[asyncDispose] = () => file.close();
    return file;
}

// --- Group envelopes -------------------------------------------------------

/**
 * A `TransformStream` that seals a file for a Group: plaintext in, ciphertext
 * out, with the envelope available once the stream has been closed.
 *
 * Keep both. The ciphertext is the file; {@link envelope} is the small header
 * naming the Group, the key version, the author and the size, and without it
 * nobody can open the ciphertext - not even a member of the Group.
 */
export class GroupFileSealer extends TransformStream<Uint8Array, Uint8Array> {
    /** Resolves when the stream closes; rejects if sealing failed. */
    readonly envelope: Promise<Uint8Array>;

    /**
     * Built by {@link sealGroupFile} or {@link sealGroupFileAnonymously}.
     * @internal
     */
    constructor(begin: Promise<number>, api: GroupFileApi) {
        let settle: (e: Uint8Array) => void;
        let fail: (e: unknown) => void;
        const envelope = new Promise<Uint8Array>((resolve, reject) => {
            settle = resolve;
            fail = reject;
        });
        envelope.catch(() => {}); // nobody awaits it before the pipe finishes

        // `cancel` is part of Transformer but missing from this build's `lib`,
        // hence the widened type. An aborted pipe never reaches `flush`, so
        // without it a caller awaiting the envelope would wait forever.
        const transformer: Transformer<Uint8Array, Uint8Array> & CancellableTransformer = {
            async transform(chunk, controller) {
                const sealed = await api.encryptFileChunk(await begin, chunk);
                if (sealed.length) controller.enqueue(sealed);
            },
            async flush() {
                try {
                    settle(await api.finishFileEncryption(await begin));
                } catch (e) {
                    fail(e); // e.g. fewer bytes than the declared size
                    throw e;
                }
            },
            cancel: (reason) => fail(reason),
        };
        super(transformer);
        this.envelope = envelope;
    }
}

/**
 * Seals a file for a Group as one of its members, as a stream.
 *
 * The declared `size` is enforced when the stream closes: writing less than
 * promised fails, because it cannot be told apart from a file cut short.
 *
 * @param {GroupFileApi} api the Group API
 * @param {object} opts `groupId` and the plaintext `size` in bytes
 * @returns {GroupFileSealer} transform stream carrying the envelope
 * @internal use `GroupApi.sealFile`
 */
export function sealGroupFile(
    api: GroupFileApi,
    opts: { groupId: string; size: number },
): GroupFileSealer {
    return new GroupFileSealer(api.beginFileEncryption(opts.groupId, opts.size), api);
}

/**
 * Seals a file for a Group without saying who sent it, as a stream.
 *
 * Needs public information only, works without membership, makes no server
 * call, and produces something the sender cannot read back.
 *
 * @param {GroupFileApi} api the Group API
 * @param {object} opts `groupId`, the Group's `groupPubKey`, and the plaintext
 *   `size` in bytes
 * @returns {GroupFileSealer} transform stream carrying the envelope
 * @internal use `GroupApi.sealFileAnonymously`
 */
export function sealGroupFileAnonymously(
    api: GroupFileApi,
    opts: { groupId: string; groupPubKey: string; size: number },
): GroupFileSealer {
    return new GroupFileSealer(
        api.beginFileEncryptionAnonymously(opts.groupId, opts.groupPubKey, opts.size),
        api,
    );
}

/** An opened Group file: feed ciphertext in, read plaintext out. */
export interface GroupFileReader {
    /** Ciphertext in, plaintext out. Feeds larger than 4 MiB are split for you. */
    stream: TransformStream<Uint8Array, Uint8Array>;
    /**
     * Byte offset in the **ciphertext** to start feeding from - the answer to a
     * `from` seek, and what makes a ranged read cheap: everything before it
     * never has to be fetched.
     */
    ciphertextOffset: number;
    /**
     * Resolves when the stream closes: which Group the file came from, who - if
     * anyone - provably wrote it, and whether all of it arrived. `complete` is
     * `false` for any seeked read; that check is only meaningful start-to-end.
     */
    info: Promise<DecryptedFileInfo>;
}

/**
 * Opens a file sealed for a Group.
 *
 * With no `from`, feed the whole ciphertext and `info.complete` answers whether
 * the file was truncated. With `from`, seek first: fetch from
 * {@link GroupFileReader.ciphertextOffset} onwards and the output begins exactly
 * at the plaintext byte you asked for.
 *
 * @param {GroupApi} api the Group API
 * @param {Uint8Array} envelope the file envelope kept alongside the ciphertext
 * @param {object} [opts] `from` - plaintext offset to start at; `length` - trim
 *   the output to this many bytes (feed only the range you need: that, not the
 *   trim, is what makes the read cheap)
 * @returns {Promise<GroupFileReader>} the reader
 * @example
 * const r = await openGroupFile(groups, envelope, { from: 1 << 20, length: 64 });
 * const head = await new Response(
 *     myBucket.readableFrom(key, r.ciphertextOffset).pipeThrough(r.stream),
 * ).text();
 */
export async function openGroupFile(
    api: GroupFileApi,
    envelope: Uint8Array,
    opts: { from?: number; length?: number } = {},
): Promise<GroupFileReader> {
    const handle = await api.beginFileDecryption(envelope);
    const ciphertextOffset = opts.from ? await api.seekInEncryptedFile(handle, opts.from) : 0;

    let settle: (i: DecryptedFileInfo) => void;
    let fail: (e: unknown) => void;
    const info = new Promise<DecryptedFileInfo>((resolve, reject) => {
        settle = resolve;
        fail = reject;
    });
    info.catch(() => {});

    // A seeked read starts at the beginning of the chunk holding `from` and runs
    // to the end of the last one, so the caller's window is trimmed here.
    let left = opts.length ?? Infinity;
    const transformer: Transformer<Uint8Array, Uint8Array> & CancellableTransformer = {
        async transform(chunk, controller) {
            for (let at = 0; at < chunk.length; at += MAX_DECRYPT_CHUNK) {
                const plain = await api.decryptFileChunk(
                    handle,
                    chunk.slice(at, at + MAX_DECRYPT_CHUNK),
                );
                if (!plain.length || left <= 0) continue;
                const piece = plain.length <= left ? plain : plain.slice(0, left);
                left -= piece.length;
                controller.enqueue(piece);
                // Deliberately no `terminate()` here: ending a transform from
                // inside its own `transform` deadlocks the pipe. Stop feeding
                // instead - that is what makes a ranged read cheap anyway.
            }
        },
        async flush() {
            try {
                settle(await api.finishFileDecryption(handle));
            } catch (e) {
                fail(e);
                throw e;
            }
        },
        cancel: (reason) => fail(reason), // as above: an abort must reject `info`
    };
    const stream = new TransformStream<Uint8Array, Uint8Array>(transformer);

    return { ciphertextOffset, info, stream };
}

// --- one-liners ------------------------------------------------------------

/**
 * Uploads a file to a Store and returns its ID.
 *
 * The whole transfer is one pipeline, so a slow connection throttles the reader
 * instead of piling chunks up in memory.
 *
 * @param {StoreApi} api the Store API
 * @param {object} opts `storeId` and the `file` (a `File`, a `Blob`, anything
 *   with `size` + `stream()`); optional `publicMeta`
 *   (unencrypted!), `privateMeta`, `onProgress` (bytes sent) and `signal`
 * @returns {Promise<string>} ID of the committed file
 * @example
 * const fileId = await uploadFile(store, {
 *     storeId, file, onProgress: (sent) => setPct(sent / file.size),
 * });
 */
export async function uploadFile(
    api: FileWriteApi,
    opts: {
        storeId: string;
        file: FileLike;
        publicMeta?: Uint8Array;
        privateMeta?: Uint8Array;
        onProgress?: (bytesSoFar: number) => void;
        signal?: AbortSignal;
    },
): Promise<string> {
    const { stream, fileId } = fileWritable(api, {
        storeId: opts.storeId,
        size: opts.file.size,
        publicMeta: opts.publicMeta,
        privateMeta: opts.privateMeta,
    });
    const source = opts.onProgress
        ? opts.file.stream().pipeThrough(progressStream(opts.onProgress))
        : opts.file.stream();
    await source.pipeTo(stream, { signal: opts.signal });
    return fileId;
}

/**
 * Downloads a Store or Inbox file and lets the user save it.
 *
 * Where the File System Access API is available the bytes stream straight to
 * the chosen file and never all sit in memory. Elsewhere they are collected
 * into a `Blob` - which the browser may still spill to disk - and offered
 * through an object URL.
 *
 * @param {FileReadApi} api `StoreApi` or `InboxApi`
 * @param {string} fileId ID of the file to download
 * @param {object} [opts] `name` for the saved file, and a `signal` to abort
 * @returns {Promise<void>} resolves when the file has been written or offered
 */
export async function saveFileToDisk(
    api: FileReadApi,
    fileId: string,
    opts: { name?: string; signal?: AbortSignal } = {},
): Promise<void> {
    const name = opts.name ?? fileId;
    const content = fileReadable(api, fileId);

    const picker = (
        window as unknown as {
            showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
        }
    ).showSaveFilePicker;

    if (picker && window.isSecureContext) {
        const target = await picker.call(window, { suggestedName: name, startIn: "downloads" });
        // FileSystemWritableFileStream is a WritableStream, so this is the
        // whole download: no loop, no buffer, and `signal` cancels it.
        await content.pipeTo(await target.createWritable(), { signal: opts.signal });
        return;
    }

    const blob = await new Response(content).blob();
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement("a"), { href: url, download: name });
    anchor.click();
    URL.revokeObjectURL(url);
}
