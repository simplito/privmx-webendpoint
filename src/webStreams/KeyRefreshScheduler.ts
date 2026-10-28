import { StreamRoomId } from "./types/ApiTypes.js";
import { Logger } from "./Logger.js";

/**
 * A key the user will never be granted keeps failing to decrypt, so without a
 * cooldown the Stream Room would ask the Bridge for its keys again for every
 * frame, for as long as it stays open.
 */
const COOLDOWN_MS = 10000;

interface RoomState {
    refreshing: boolean;
    refreshedAt: number | undefined;
}

/**
 * Fetches a Stream Room's keys again when decryption finds none, at most one
 * refresh at a time per room and no more often than the cooldown allows.
 *
 * Keys are normally kept current by the Stream Room update notification; this
 * is the recovery path for a notification which never arrived - most often
 * across a connection outage - leaving this client unable to decrypt frames
 * and data channel messages encrypted with a key added in the meantime.
 *
 * Only a key which is not held can be mended this way. A frame which fails its
 * AEAD tag, or a data channel message rejected for any other reason, was
 * decrypted with the key in hand and something else went wrong, which new keys
 * will not fix - those must not reach this class.
 * @internal
 */
export class KeyRefreshScheduler {
    private readonly rooms = new Map<StreamRoomId, RoomState>();
    private readonly logger = new Logger();

    constructor(
        private readonly refresh: (streamRoomId: StreamRoomId) => Promise<void>,
        private readonly cooldownMs: number = COOLDOWN_MS,
    ) {}

    /**
     * Asks for `streamRoomId`'s keys to be fetched again, unless a refresh is
     * already running or the last one finished within the cooldown. Returns at
     * once; the refresh and any failure of it are handled in the background.
     */
    requestRefresh(streamRoomId: StreamRoomId): void {
        const room = this.rooms.get(streamRoomId) ?? { refreshing: false, refreshedAt: undefined };
        this.rooms.set(streamRoomId, room);
        if (room.refreshing) return;
        if (room.refreshedAt !== undefined && Date.now() - room.refreshedAt < this.cooldownMs) {
            return;
        }
        room.refreshing = true;
        void this.run(streamRoomId, room);
    }

    /** Forgets `streamRoomId`'s cooldown and in-flight mark (on leaving the room). */
    forgetRoom(streamRoomId: StreamRoomId): void {
        this.rooms.delete(streamRoomId);
    }

    /**
     * Runs the refresh and re-arms the cooldown afterwards, whether it
     * succeeded or not - a Bridge which cannot be reached now would otherwise
     * be asked again by the very next undecryptable frame.
     * @param {StreamRoomId} streamRoomId the room whose keys are fetched again
     * @param {RoomState} room the state entry held for that room
     * @returns {Promise<void>} resolves once the refresh has settled
     */
    private async run(streamRoomId: StreamRoomId, room: RoomState): Promise<void> {
        try {
            await this.refresh(streamRoomId);
        } catch (e) {
            this.logger.error("refreshing the Stream Room keys failed:", e);
        }
        room.refreshing = false;
        room.refreshedAt = Date.now();
    }
}
