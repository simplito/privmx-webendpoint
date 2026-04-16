import { Key } from "../Types";
import { KeyStore } from "./KeyStore";
import { E2eeWorker } from "./E2eeWorker";
import { StreamRoomId } from "./types/ApiTypes";
import { Logger } from "./Logger";

/**
 * Keeps the main-thread `KeyStore` and the E2EE worker's key registry in sync.
 *
 * `updateKeys()` updates both sides sequentially: main thread first, then the
 * worker. There is a brief window between the two updates where they hold
 * different key sets; in practice this is safe because the worker only reads
 * keys when processing frames, which is async and does not interleave with the
 * update sequence.
 */
export class KeySyncManager {
    private readonly logger = new Logger();

    constructor(
        private readonly keyStore: KeyStore,
        private readonly e2eeWorker: E2eeWorker,
    ) {}

    /**
     * Replaces the active key set on the main thread (`KeyStore`) first, then
     * on the E2EE worker. The worker call awaits a `setKeys-ack` message before
     * resolving, so both sides are updated by the time the method returns.
     * `streamRoomId` is used only for debug logging.
     */
    async updateKeys(streamRoomId: StreamRoomId, keys: Key[]): Promise<void> {
        this.logger.debug("UPDATE KEYS", streamRoomId, keys.length);
        await this.keyStore.setKeys(keys);
        await this.e2eeWorker.setKeys(keys);
    }
}
