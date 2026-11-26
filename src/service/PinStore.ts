/**
 * Where the library keeps what this device has already verified between
 * sessions: for every Group and Space, the last entry of its signed history.
 * With a store, a Group seen once is never again read on trust, and a Bridge
 * that serves an older history is caught even after a page reload. Without one
 * every session starts from first contact.
 *
 * Install it with {@link Connection.setPinStore} right after connecting, before
 * any other API of the connection is used. The store must live on the device
 * and must not be writable by the Bridge. The library seals what it saves, so a
 * changed blob is ignored - but a deleted one weakens protection back to first
 * contact, and an older one back to the state it holds.
 *
 * @type {PinStore}
 */
export interface PinStore {
    /** @returns the stored blob; an empty array when nothing is stored */
    load(key: string): Promise<Uint8Array>;
    /**
     * Compare-and-swap: stores `blob` only if the stored value equals
     * `expected` (empty = nothing stored). Must be atomic against other tabs.
     * @returns whether `blob` was stored
     */
    save(key: string, blob: Uint8Array, expected: Uint8Array): Promise<boolean>;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * A {@link PinStore} in the browser's IndexedDB. One readwrite transaction does
 * the compare and the write, so two tabs cannot overwrite each other.
 *
 * ```ts
 * const connection = await Endpoint.connect(privateKey, solutionId, bridgeUrl);
 * await connection.setPinStore(new IndexedDbPinStore());
 * ```
 */
export class IndexedDbPinStore implements PinStore {
    private db?: Promise<IDBDatabase>;

    /** @param {string} dbName name of the IndexedDB database (one object store, `pins`) */
    constructor(private readonly dbName = "privmx-pins") {}

    private open(): Promise<IDBDatabase> {
        return (this.db ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore("pins");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }));
    }

    async load(key: string): Promise<Uint8Array> {
        const store = (await this.open()).transaction("pins").objectStore("pins");
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ?? new Uint8Array());
            request.onerror = () => reject(request.error);
        });
    }

    async save(key: string, blob: Uint8Array, expected: Uint8Array): Promise<boolean> {
        const tx = (await this.open()).transaction("pins", "readwrite");
        const store = tx.objectStore("pins");
        return new Promise((resolve, reject) => {
            let stored = false;
            const request = store.get(key);
            request.onsuccess = () => {
                if (sameBytes(request.result ?? new Uint8Array(), expected)) {
                    store.put(blob, key);
                    stored = true;
                }
            };
            tx.oncomplete = () => resolve(stored);
            tx.onerror = tx.onabort = () => reject(tx.error);
        });
    }
}
