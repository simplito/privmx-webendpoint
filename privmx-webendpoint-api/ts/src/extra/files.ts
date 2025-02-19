/**
 * Represents a stream reader for reading a file in chunks.
 */
import { InboxApi, StoreApi } from '..';

export const FILE_DEFAULT_CHUNK_SIZE = 1_048_576;

export class StreamReader {
    private _handle: number;
    private _offset: number;
    private _api: StoreApi | InboxApi;
    private readonly chunkSize: number;

    hasDataToRead: boolean = true;

    /**
     * Creates an instance of StreamReader.
     *
     * @param {number} handle - The file handle.
     * @param {StoreApi} api {@link StoreApi `StoreApi`} instance
     */

    constructor(handle: number, api: StoreApi | InboxApi, chunkSize?: number) {
        this._handle = handle;
        this._offset = 0;
        this._api = api;
        this.chunkSize = chunkSize ?? FILE_DEFAULT_CHUNK_SIZE;
    }

    static async readFile(
        api: InboxApi | StoreApi,
        fileID: string,
        chunkSize?: number
    ): Promise<StreamReader> {
        const fileHandle = await api.openFile(fileID);
        const reader = new StreamReader(fileHandle, api, chunkSize);
        return reader;
    }

    /**
     * Reads the next chunk of the file.
     *
     * @returns {Promise<boolean>} A promise that resolves to true if there are more chunks to read, or false if the end of the file is reached.
     */

    public async *[Symbol.asyncIterator]() {
        while (this.hasDataToRead) {
            const chunk = await this.readNextChunk();
            yield [chunk, this._offset] as const;
        }
    }

    public async readNextChunk(): Promise<Uint8Array> {
        const chunkSizeToRead = this.chunkSize ?? FILE_DEFAULT_CHUNK_SIZE;
        const chunk = await this._api.readFromFile(this._handle, chunkSizeToRead);

        //if chunk length is lesser than requested, the end of the file is reached
        this.hasDataToRead = chunk.length === chunkSizeToRead;
        return chunk;
    }

    public async getFileContent() {
        const chunks: Uint8Array[] = [];

        while (this.hasDataToRead) {
            chunks.push(await this.readNextChunk());
        }
        await this.close();

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const fileBuffer = new Uint8Array(totalLength);

        let offset = 0;
        for (const chunk of chunks) {
            fileBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        return fileBuffer;
    }

    /**
     * Aborts the reading process and closes the file handle.
     *
     * @returns {Promise<string>} A promise that resolves when the file handle is closed.
     */

    public async abort() {
        return this._api.closeFile(this._handle);
    }

    /**
     * Closes the file handle.
     *
     * @returns {Promise<string>} A promise that resolves when the file handle is closed and returns file ID.
     */

    public async close() {
        return this._api.closeFile(this._handle);
    }
}

/**
 * Represents a file stream uploader for uploading a Browser FileHandle in chunks.
 */

interface FileContainerApi {
    writeToFile: (chunk: Uint8Array) => Promise<void>;
    closeFile: () => Promise<string>;
}

export class FileUploader {
    private readonly _size: number;
    private offset:number = 0
    private readonly _api: FileContainerApi;

    private _reader: ReadableStreamDefaultReader<Uint8Array>;

    /**
     * Creates an instance of FileUploader.
     *
     * @param {number} handle - The file handle.
     * @param {File} file - The data (file content) to upload.
     * @param {StoreApi} api {@link StoreApi `StoreApi`} instance
     */

    constructor(file: File, api: FileContainerApi) {
        this._size = file.size;
        this._api = api;
        this._reader = file.stream().getReader();

    }

    static async uploadStoreFile({
        storeApi,
        storeId,
        file,
        privateMeta,
        publicMeta
    }: {
        storeId: string;
        file: File;
        storeApi: StoreApi;
        publicMeta?: Uint8Array;
        privateMeta?: Uint8Array;
    }) {
        const meta = {
            publicMeta: publicMeta || new Uint8Array(),
            privateMeta: privateMeta || new Uint8Array()
        };

        const handle = await storeApi.createFile(
            storeId,
            meta.publicMeta,
            meta.privateMeta,
            file.size
        );

        const streamer = new FileUploader(file, {
            closeFile() {
                return storeApi.closeFile(handle);
            },
            writeToFile(chunk) {
                return storeApi.writeToFile(handle, chunk);
            }
        });
        return streamer;
    }


    static async uploadInboxFile({
        inboxApi,
        inboxHandle,
        preparedFileUpload
    }: {
        inboxHandle: number;
        preparedFileUpload: { file: File; handle: number };
        inboxApi: InboxApi;
    }) {
        const streamer = new FileUploader(preparedFileUpload.file, {
            closeFile() {
                return Promise.resolve('')
            },
            writeToFile(chunk) {
                return inboxApi.writeToFile(inboxHandle, preparedFileUpload.handle, chunk);
            }
        });
        return streamer;
    }

    static async prepareInboxUpload({
        inboxApi,
        file,
        privateMeta,
        publicMeta
    }: {
        inboxApi: InboxApi;
        file: File;
        publicMeta?: Uint8Array;
        privateMeta?: Uint8Array;
    }) {
        const meta = {
            publicMeta: publicMeta || new Uint8Array(),
            privateMeta: privateMeta || new Uint8Array()
        };

        const handle = await inboxApi.createFileHandle(
            meta.publicMeta,
            meta.privateMeta,
            file.size
        );
        return { file: file, handle };
    }

    /**
     * Gets the progress of uploading the file as a percentage.
     *
     * @returns {number} The progress percentage.
     */
    public get progress() {
        if(this._size === 0) return 100
        return (this.offset / this._size) * 100;
    }

    /**
     * Sends the next chunk of the file data to the server.
     *
     * @returns {Promise<boolean>} A promise that resolves to true if there are more chunks to send, or false if all data has been sent.
     */

    public async sendNextChunk(): Promise<boolean> {
        const { done, value } = await this._reader.read();

        if (done) {
            return false;
        }
        await this._api.writeToFile(value);
        this.offset += value?.length
        return true
    }

    public async uploadFileContent() {
        while (await this.sendNextChunk()) {}
        return this.close();
    }

    /**
     * Aborts the uploading process, closes the file handle, and deletes the uploaded part of the file.
     *
     * @returns {Promise<void>} A promise that resolves when the file handle is closed and the uploaded part is deleted.
     */

    public async abort(): Promise<void> {
        await this._api.closeFile();
    }

    /**
     * Closes the file handle.
     *
     * @returns {Promise<string>} A promise that resolves when the file handle is closed and returns file ID.
     */
    public async close() {
        this._reader.releaseLock();
        return this._api.closeFile();
    }
}

/**
 * Downloads a file from the server.
 *
 * @param {StoreApi|InboxApi} api - The API instance used for file operations.
 * @param {string} fileId - The ID of the file to download.
 * @param {string} [targetFileName] - The target file name for saving the downloaded file.
 * @returns {Promise<void>} A promise that resolves when the download is complete.
 */
export async function downloadFile(
    api: StoreApi | InboxApi,
    fileId: string,
    targetFileName?: string
): Promise<void> {
    const filename = targetFileName || fileId;
    const apiReader = await StreamReader.readFile(api, fileId);

    if ('showSaveFilePicker' in window && window.isSecureContext) {
        //@ts-ignore
        const systemHandle = (await window.showSaveFilePicker({
            id: 0,
            suggestedName: filename,
            startIn: 'downloads'
        })) as FileSystemFileHandle;

        const accessHandle = await systemHandle.createWritable();

        for await (const [file] of apiReader) {
            await accessHandle.write(file);
        }
        await accessHandle.close();
    } else {
        const fileBuffer = await apiReader.getFileContent();

        const anchor = document.createElement('a');

        const reader = new FileReader();
        reader.onload = (e) => {
            if (!e.target) return;
            anchor.href = e.target.result as string;
            anchor.download = filename;
            anchor.click();
        };

        reader.readAsDataURL(new Blob([fileBuffer]));
    }
}
