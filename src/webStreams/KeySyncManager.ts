import { Key } from "../Types";
import { KeyStore } from "./KeyStore";
import { E2eeWorker } from "./E2eeWorker";
import { StreamRoomId } from "./types/ApiTypes";
import { Logger } from "./Logger";

/**
 * Keeps the main-thread KeyStore and the E2EE worker's key registry in sync.
 * A single call to updateKeys() atomically updates both.
 */
export class KeySyncManager {
    private readonly logger = new Logger();

    constructor(
        private readonly keyStore: KeyStore,
        private readonly e2eeWorker: E2eeWorker,
    ) {}

    async updateKeys(streamRoomId: StreamRoomId, keys: Key[]): Promise<void> {
        this.logger.debug("UPDATE KEYS", streamRoomId, keys.length);
        await this.keyStore.setKeys(keys);
        await this.e2eeWorker.setKeys(keys);
    }
}
