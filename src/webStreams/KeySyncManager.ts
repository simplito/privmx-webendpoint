import { Key } from "../Types.js";
import { E2eeWorker } from "./E2eeWorker.js";
import { StreamRoomId } from "./types/ApiTypes.js";
import { Logger } from "./Logger.js";

/**
 * Pushes the active media E2EE key set to the worker thread. Data channel
 * messages no longer go through this key set - they're encrypted/decrypted
 * natively by `StreamApiLow`.
 * @internal
 */
export class KeySyncManager {
    private readonly logger = new Logger();

    constructor(private readonly e2eeWorker: E2eeWorker) {}

    /**
     * Replaces the active key set on the E2EE worker. The worker call awaits a
     * `setKeys-ack` message before resolving. `streamRoomId` is used only for
     * debug logging.
     */
    async updateKeys(streamRoomId: StreamRoomId, keys: Key[]): Promise<void> {
        this.logger.debug("UPDATE KEYS", streamRoomId, keys.length);
        await this.e2eeWorker.setKeys(keys);
    }
}
