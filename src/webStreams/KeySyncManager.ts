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
    // Rooms whose keys were pushed to the worker. The worker holds one key set
    // and cannot say which room a frame it failed to decrypt belongs to, so a
    // missing key is reported against all of them.
    private readonly rooms = new Set<StreamRoomId>();

    constructor(private readonly e2eeWorker: E2eeWorker) {}

    /**
     * Replaces the active key set on the E2EE worker. The worker call awaits a
     * `setKeys-ack` message before resolving. `streamRoomId` is used only for
     * debug logging.
     */
    async updateKeys(streamRoomId: StreamRoomId, keys: Key[]): Promise<void> {
        this.logger.debug("UPDATE KEYS", streamRoomId, keys.length);
        this.rooms.add(streamRoomId);
        await this.e2eeWorker.setKeys(keys);
    }

    /** Rooms whose keys have been pushed to the worker. */
    getRooms(): ReadonlySet<StreamRoomId> {
        return this.rooms;
    }

    /** Forgets `streamRoomId` (on leaving the room). */
    forgetRoom(streamRoomId: StreamRoomId): void {
        this.rooms.delete(streamRoomId);
    }
}
