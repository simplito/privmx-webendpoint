/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

// Generated from the privmx-endpoint v2.9.0-dev C++ exception headers
// (dependency_sources/privmx-endpoint-v2.9.0-dev/endpoint/*/include_pub/**/*Exception.hpp).
// Code layout: (scopeCode << 16) | specificCode - e.g. Store scope 0x0004,
// FileVersionMismatch 0x001f -> 0x4001f. Regenerate when bumping the
// privmx-endpoint version in build-manifest.sh.

/*
 * Numeric error codes carried by `NativeError.code`, grouped by the module
 * (`NativeError.scope`) that raised them.
 *
 * Use them to branch on specific failures instead of string-matching messages:
 *
 *     try {
 *         await storeApi.closeFile(handle);
 *     } catch (e) {
 *         if (e instanceof NativeError && e.code === StoreErrorCode.FILE_VERSION_MISMATCH) {
 *             // someone updated the file concurrently - re-open and retry
 *         }
 *     }
 */

/**
 * Error codes raised by the Core module (`NativeError.scope === "Core"`).
 */
export const CoreErrorCode = {
    /** Invalid params */
    INVALID_PARAMS: 0x10002,
    /** Invalid number of params */
    INVALID_NUMBER_OF_PARAMS: 0x10003,
    /** Unsupported type */
    UNSUPPORTED_TYPE: 0x10004,
    /** No handle found */
    NO_HANDLE_FOUND: 0x10005,
    /** Invalid data signature */
    INVALID_DATA_SIGNATURE: 0x10007,
    /** Unsupported serializer binary format option */
    UNSUPPORTED_SERIALIZER_BINARY_FORMAT: 0x10009,
    /** Not Implemented */
    NOT_IMPLEMENTED: 0x1000a,
    /** Invalid method */
    INVALID_METHOD: 0x1000b,
    /** Invalid argument type */
    INVALID_ARGUMENT_TYPE: 0x1000c,
    /** Invalid BackendRequest mode */
    INVALID_BACKEND_REQUEST_MODE: 0x1000d,
    /** User verification failure */
    USER_VERIFICATION_FAILURE: 0x1000e,
    /** UserVerifierInterface.verify() thrown an exception. Implementation of the UserVerifierInterface should provide adequate error handling. */
    USER_VERIFICATION_METHOD_UNHANDLED: 0x1000f,
    /** Malformed encryption key */
    MALFORMED_ENCRYPTION_KEY: 0x10010,
    /** Unknown encryption key */
    UNKNOWN_ENCRYPTION_KEY_VERSION: 0x10011,
    /** Encryption key container validation error */
    ENCRYPTION_KEY_CONTAINER_VALIDATION: 0x10012,
    /** Duplicated data integrity object */
    DATA_INTEGRITY_OBJECT_DUPLICATED: 0x10013,
    /** Malformed data integrity object */
    MALFORMED_DATA_INTEGRITY_OBJECT: 0x10014,
    /** Invalid data integrity object checksum */
    INVALID_DATA_INTEGRITY_OBJECT_CHECKSUM: 0x10015,
    /** User key does not match with author public key in data integrity object */
    DATA_INTEGRITY_OBJECT_MISMATCH_ENC_KEY: 0x10016,
    /** Invalid data integrity object signature */
    DATA_INTEGRITY_OBJECT_INVALID_SIGNATURE: 0x10017,
    /** KeyProvider request completed */
    KEY_PROVIDER_REQUEST_COMPLETED: 0x10018,
    /** Malformed verifier response */
    MALFORMED_VERIFIER_RESPONSE: 0x10019,
    /** Module's enc key with given keyId does not exist. */
    UNKNOWN_MODULE_ENCRYPTION_KEY: 0x10020,
    /** Module public data mismatch */
    MODULE_PUBLIC_DATA_MISMATCH: 0x10021,
    /** Invalid version of encrypted module data */
    INVALID_ENCRYPTED_MODULE_DATA_VERSION: 0x10022,
    /** Invalid subscriptionQuery */
    INVALID_SUBSCRIPTION_QUERY: 0x10024,
    /** Invalid Singletons Holder state */
    INVALID_SINGLETONS_HOLDER_STATE: 0x10025,
    /** Encryption key validation error */
    ENCRYPTION_KEY_VALIDATION: 0x10027,
    /** Incorrect key id format */
    INCORRECT_KEY_ID_FORMAT: 0x10028,
} as const;

/**
 * Error codes raised by the Connection module (`NativeError.scope === "Connection"`).
 */
export const ConnectionErrorCode = {
    /** Endpoint not initialized */
    NOT_INITIALIZED: 0x20001,
    /** Cannot extract LibPlatformDisconnectedEvent */
    CANNOT_EXTRACT_LIB_PLATFORM_DISCONNECTED_EVENT: 0x20002,
    /** Cannot extract LibConnectedEvent */
    CANNOT_EXTRACT_LIB_CONNECTED_EVENT: 0x20003,
    /** Cannot extract LibDisconnectedEvent */
    CANNOT_EXTRACT_LIB_DISCONNECTED_EVENT: 0x20004,
    /** Data bigger than declared */
    DATA_BIGGER_THAN_DECLARED: 0x20005,
    /** Data smaller than declared */
    DATA_SMALLER_THAN_DECLARED: 0x20006,
    /** Data different than declared */
    DATA_DIFFERENT_THAN_DECLARED: 0x20007,
    /** Cannot extract LibBreakEvent */
    CANNOT_EXTRACT_LIB_BREAK_EVENT: 0x20008,
    /** The Bridge Server and the PrivMX Endpoint library versions mismatch */
    SERVER_VERSION_MISMATCH: 0x20009,
    /** Cannot extract CollectionChangedEvent */
    CANNOT_EXTRACT_COLLECTION_CHANGED_EVENT: 0x2000a,
    /** Cannot extract ContextUserAddedEvent */
    CANNOT_EXTRACT_CONTEXT_USER_ADDED_EVENT: 0x2000b,
    /** Cannot extract ContextUserRemovedEvent */
    CANNOT_EXTRACT_CONTEXT_USER_REMOVED_EVENT: 0x2000c,
    /** Cannot extract ContextUsersStatusChangedEvent */
    CANNOT_EXTRACT_CONTEXT_USERS_STATUS_CHANGED_EVENT: 0x2000d,
    /** Endpoint is not connected or not initialized */
    NOT_CONNECTED: 0x2000e,
} as const;

/**
 * Error codes raised by the Thread module (`NativeError.scope === "Thread"`).
 */
export const ThreadErrorCode = {
    /** Cannot extract ThreadCreatedEvent */
    CANNOT_EXTRACT_THREAD_CREATED_EVENT: 0x30002,
    /** Cannot extract ThreadUpdatedEvent */
    CANNOT_EXTRACT_THREAD_UPDATED_EVENT: 0x30003,
    /** Cannot extract ThreadNewMessageEvent */
    CANNOT_EXTRACT_THREAD_NEW_MESSAGE_EVENT: 0x30004,
    /** Cannot extract ThreadDeletedEvent */
    CANNOT_EXTRACT_THREAD_DELETED_EVENT: 0x30005,
    /** Cannot extract ThreadDeletedMessageEvent */
    CANNOT_EXTRACT_THREAD_DELETED_MESSAGE_EVENT: 0x30006,
    /** Cannot extract ThreadStatsEvent */
    CANNOT_EXTRACT_THREAD_STATS_EVENT: 0x30008,
    /** Invalid version of encrypted message data */
    INVALID_ENCRYPTED_MESSAGE_DATA_VERSION: 0x3000c,
    /** Unknown Thread format */
    UNKNOW_THREAD_FORMAT: 0x3000d,
    /** Unknown Message format */
    UNKNOW_MESSAGE_FORMAT: 0x3000e,
    /** Cannot extract ThreadMessageUpdatedEvent */
    CANNOT_EXTRACT_THREAD_MESSAGE_UPDATED_EVENT: 0x3000f,
    /** Message public data mismatch */
    MESSAGE_PUBLIC_DATA_MISMATCH: 0x30011,
    /** Failed thread data integrity check */
    THREAD_DATA_INTEGRITY: 0x30014,
    /** Failed message data integrity check */
    MESSAGE_DATA_INTEGRITY: 0x30015,
} as const;

/**
 * Error codes raised by the Store module (`NativeError.scope === "Store"`).
 */
export const StoreErrorCode = {
    /** Cannot extract StoreCreatedEvent */
    CANNOT_EXTRACT_STORE_CREATED_EVENT: 0x40002,
    /** Cannot extract StoreUpdatedEvent */
    CANNOT_EXTRACT_STORE_UPDATED_EVENT: 0x40003,
    /** Cannot extract StoreStatsChangedEvent */
    CANNOT_EXTRACT_STORE_STATS_CHANGED_EVENT: 0x40004,
    /** Cannot extract StoreFileCreatedEvent */
    CANNOT_EXTRACT_STORE_FILE_CREATED_EVENT: 0x40005,
    /** Cannot extract StoreFileUpdatedEvent */
    CANNOT_EXTRACT_STORE_FILE_UPDATED_EVENT: 0x40006,
    /** Cannot extract StoreFileDeletedEvent */
    CANNOT_EXTRACT_STORE_FILE_DELETED_EVENT: 0x40007,
    /** Cannot extract StoreDeletedEvent */
    CANNOT_EXTRACT_STORE_DELETED_EVENT: 0x4000d,
    /** Unsupported cipher type */
    UNSUPPORTED_CIPHER_TYPE: 0x40009,
    /** File chunk invalid checksum */
    FILE_CHUNK_INVALID_CHECKSUM: 0x4000b,
    /** File chunk invalid cipher checksum */
    FILE_CHUNK_INVALID_CIPHER_CHECKSUM: 0x4000c,
    /** Invalid file chunk size */
    INVALID_FILE_CHUNK_SIZE: 0x4000e,
    /** Invalid file handle: handle is not FILE_READ_HANDLE */
    INVALID_FILE_READ_HANDLE: 0x4000f,
    /** Invalid file handle: handle is not FILE_WRITE_HANDLE */
    INVALID_FILE_WRITE_HANDLE: 0x40010,
    /** Invalid file handle: handle does not exist */
    INVALID_FILE_HANDLE: 0x40011,
    /** File version mismatch, handle closed */
    FILE_VERSION_MISMATCH_HANDLE_CLOSED: 0x40013,
    /** Pos out of bounds */
    POS_OUT_OF_BOUNDS: 0x40014,
    /** File corrupted */
    FILE_CORRUPTED: 0x40015,
    /** Number is to big for this CPU Architecture */
    NUMBER_TO_BIG_FOR_CPU_ARCHITECTURE: 0x40016,
    /** Invalid version of encrypted file meta */
    INVALID_ENCRYPTED_STORE_FILE_META_VERSION: 0x40019,
    /** Unknown Store format */
    UNKNOW_STORE_FORMAT: 0x4001c,
    /** Unknown File format */
    UNKNOW_FILE_FORMAT: 0x4001d,
    /** File fetch failed */
    FILE_FETCH_FAILED: 0x4001e,
    /** File version mismatch */
    FILE_VERSION_MISMATCH: 0x4001f,
    /** File public data mismatch */
    FILE_PUBLIC_DATA_MISMATCH: 0x40021,
    /** Writing to file interupted. Written data smaller then declared */
    WRITING_TO_FILE_INTERUPTED_WRITTEN_DATA_SMALLER_THEN_DECLARED: 0x40022,
    /** Failed Store data integrity check */
    STORE_DATA_INTEGRITY: 0x40027,
    /** Failed file data integrity check */
    FILE_DATA_INTEGRITY: 0x40028,
    /** Invalid hash size */
    INVALID_HASH_SIZE: 0x40029,
    /** Hash index out of bounds */
    HASH_INDEX_OUT_OF_BOUNDS: 0x4002a,
    /** Invalid file top hash */
    INVALID_FILE_TOP_HASH: 0x4002b,
    /** File sync failed, handle closed */
    FILE_SYNC_FAILED_HANDLE_CLOSE: 0x4002c,
    /** File random write internal Exception  */
    FILE_RANDOM_WRITE_INTERNAL: 0x4002d,
} as const;

/**
 * Error codes raised by the Inbox module (`NativeError.scope === "Inbox"`).
 */
export const InboxErrorCode = {
    /** Unknown inbox handle Id */
    UNKNOWN_INBOX_HANDLE: 0x70002,
    /** inboxHandle is not tied to inboxFileHandle */
    INBOX_HANDLE_IS_NOT_TIED_TO_INBOX_FILE_HANDLE: 0x70003,
    /** Cannot extract InboxCreatedEvent */
    CANNOT_EXTRACT_INBOX_CREATED_EVENT: 0x70004,
    /** Cannot extract InboxUpdatedEvent */
    CANNOT_EXTRACT_INBOX_UPDATED_EVENT: 0x70005,
    /** Cannot extract InboxDeletedEvent */
    CANNOT_EXTRACT_INBOX_DELETED_EVENT: 0x70006,
    /** Failed to extract message public meta */
    FAILED_TO_EXTRACT_MESSAGE_PUBLIC_META: 0x70009,
    /** Invalid version of encrypted Inbox data */
    INVALID_ENCRYPTED_INBOX_DATA_VERSION: 0x7000f,
    /** Cannot extract InboxEntryCreatedEvent */
    CANNOT_EXTRACT_INBOX_ENTRY_CREATED_EVENT: 0x70010,
    /** Cannot extract InboxEntryDeleted */
    CANNOT_EXTRACT_INBOX_ENTRY_DELETED: 0x70011,
    /** Inbox public data mismatch */
    INBOX_PUBLIC_DATA_MISMATCH: 0x70013,
    /** Writing to entry interupted. Written data smaller then declared */
    WRITING_TO_ENTRY_INTERUPTED_WRITTEN_DATA_SMALLER_THEN_DECLARED: 0x70014,
    /** Handle is used in inbox handle */
    HANDLE_IS_USED_IN_INBOX_HANDLE: 0x70015,
    /** Unknown Inbox format */
    UNKNOWN_INBOX_FORMAT: 0x70020,
    /** Failed inbox data integrity check */
    INBOX_DATA_INTEGRITY: 0x70021,
    /** Inbox module does not support queries yet. */
    INBOX_MODULE_DOES_NOT_SUPPORT_QUERIES_YET: 0x70099,
} as const;

/**
 * Error codes raised by the Kvdb module (`NativeError.scope === "Kvdb"`).
 */
export const KvdbErrorCode = {
    /** Cannot extract KvdbCreatedEvent */
    CANNOT_EXTRACT_KVDB_CREATED_EVENT: 0xa0002,
    /** Cannot extract KvdbUpdatedEvent */
    CANNOT_EXTRACT_KVDB_UPDATED_EVENT: 0xa0003,
    /** Cannot extract KvdbDeletedEvent */
    CANNOT_EXTRACT_KVDB_DELETED_EVENT: 0xa0004,
    /** Cannot extract KvdbStatsEvent */
    CANNOT_EXTRACT_KVDB_STATS_EVENT: 0xa0005,
    /** Cannot extract KvdbNewEntryEvent */
    CANNOT_EXTRACT_KVDB_NEW_ENTRY_EVENT: 0xa0006,
    /** Cannot extract KvdbDeletedEntryEvent */
    CANNOT_EXTRACT_KVDB_DELETED_ENTRY_EVENT: 0xa0007,
    /** Cannot extract KvdbKvdbEntryUpdatedEvent */
    CANNOT_EXTRACT_KVDB_ENTRY_UPDATED_EVENT: 0xa0008,
    /** Kvdb entry public data mismatch */
    KVDB_ENTRY_PUBLIC_DATA_MISMATCH: 0xa000a,
    /** Invalid version of encrypted kvdb entry data */
    INVALID_ENCRYPTED_KVDB_ENTRY_DATA_VERSION: 0xa000b,
    /** Unknown kvdb format */
    UNKNOWN_KVDB_FORMAT: 0xa000f,
    /** Unknown item format */
    UNKNOWN_KVDB_ENTRY_FORMAT: 0xa0010,
    /** Failed kvdb data integrity check */
    KVDB_DATA_INTEGRITY: 0xa0011,
    /** Failed kvdb entry data integrity check */
    KVDB_ENTRY_DATA_INTEGRITY: 0xa0012,
} as const;

/**
 * Error codes raised by the Event module (`NativeError.scope === "Event"`).
 */
export const EventErrorCode = {
    /** Forbidden channel name */
    FORBIDDEN_CHANNEL_NAME: 0x90002,
    /** Cannot extract ContextCustomEvent */
    CANNOT_EXTRACT_CONTEXT_CUSTOM_EVENT: 0x90003,
    /** Invalid version of encrypted event data */
    INVALID_ENCRYPTED_EVENT_DATA_VERSION: 0x90005,
} as const;

/**
 * Error codes raised by the StreamRoom module (`NativeError.scope === "StreamRoom"`).
 */
export const StreamRoomErrorCode = {
    /** Unknown stream room format */
    UNKNOW_STREAM_ROOM_FORMAT: 0x80005,
    /** WebRTC error */
    WEB_RTC: 0x80009,
    /** Incorrect stream handle */
    INCORRECT_STREAM_HANDLE: 0x8000a,
    /** Incorrect track id */
    INCORRECT_TRACK_ID: 0x8000c,
    /** Cannot extract StreamRoomCreatedEvent */
    CANNOT_EXTRACT_STREAM_ROOM_CREATED_EVENT: 0x8000f,
    /** Cannot extract StreamRoomUpdatedEvent */
    CANNOT_EXTRACT_STREAM_ROOM_UPDATED_EVENT: 0x80010,
    /** Cannot extract StreamRoomDeletedEvent */
    CANNOT_EXTRACT_STREAM_ROOM_DELETED_EVENT: 0x80011,
    /** Cannot extract StreamPublishedEvent */
    CANNOT_EXTRACT_STREAM_PUBLISHED_EVENT: 0x80012,
    /** Cannot extract StreamRoomJoinedEvent */
    CANNOT_EXTRACT_STREAM_ROOM_JOINED_EVENT: 0x80013,
    /** Cannot extract StreamUnpublishedEvent */
    CANNOT_EXTRACT_STREAM_UNPUBLISHED_EVENT: 0x80014,
    /** Cannot extract StreamRoomLeftEvent */
    CANNOT_EXTRACT_STREAM_ROOM_LEFT_EVENT: 0x80015,
    /** Failed StreamRoom data integrity check */
    STREAM_ROOM_DATA_INTEGRITY: 0x80018,
    /** Cannot extract StreamSubscribedEvent */
    CANNOT_EXTRACT_STREAM_SUBSCRIBED_EVENT: 0x8001b,
    /** Cannot extract StreamUnsubscribedEvent */
    CANNOT_EXTRACT_STREAM_UNSUBSCRIBED_EVENT: 0x8001c,
    /** Invalid turn server URI */
    INVALID_TURN_SERVER_URI: 0x8001d,
    /** StreamRoom connection not initialized */
    STREAM_ROOM_CONNECTION_NOT_INITIALIZED: 0x80020,
    /** StreamHandle not initialized */
    STREAM_HANDLE_NOT_INITIALIZED: 0x80021,
    /** Stream is already published */
    STREAM_ALREADY_PUBLISHED: 0x80022,
    /** Cannot extract StreamUpdatedEvent */
    CANNOT_EXTRACT_STREAM_UPDATED_EVENT: 0x80023,
    /** Callback must not be null */
    NULL_CALLBACK: 0x80024,
    /** Unknown type encountered */
    UNKNOWN_TYPE: 0x80025,
    /** There can be only one dataTrack per user in StreamRoom */
    THERE_CAN_BE_ONLY_ONE_DATA_TRACK: 0x80026,
    /** Data track not initialized */
    DATA_TRACK_NOT_INITIALIZED: 0x80027,
    /** No stream encryption key */
    NO_STREAM_ENCRYPTION_KEY: 0x80028,
    /** No stream decryption key */
    NO_STREAM_DECRYPTION_KEY: 0x80029,
    /** Invalid encryption key id length */
    INVALID_ENCRYPTION_KEY_ID_LENGTH: 0x8002a,
    /** Invalid message header length */
    INVALID_MESSAGE_HEADER_LENGTH: 0x8002b,
    /** Unsupported message format version length */
    UNSUPPORTED_MESSAGE_FORMAT_VERSION: 0x8002c,
    /** StreamRoom already joined */
    ALREADY_JOINED_STREAM_ROOM: 0x8002d,
    /** Invalid data channel sequence number */
    INVALID_DATA_CHANNEL_SEQ: 0x8002e,
    /** StreamHandle not published */
    STREAM_HANDLE_NOT_PUBLISHED: 0x8002f,
    /** Subscriber stream is already created */
    SUBSCRIBER_STREAM_ALREADY_CREATED: 0x80030,
    /** SubscriberStreamHandle not initialized */
    SUBSCRIBER_STREAM_HANDLE_NOT_INITIALIZED: 0x80031,
} as const;

/**
 * Error codes raised by the Search module (`NativeError.scope === "Search"`).
 */
export const SearchErrorCode = {
    /** Endpoint not initialized */
    NOT_INITIALIZED: 0xb0001,
    /** Invalid Index handle */
    INVALID_INDEX_HANDLE: 0xb0002,
    /** Invalid document ID */
    INVALID_DOCUMENT_ID: 0xb0003,
    /** Malformed internal file Id */
    MALFORMED_INTERNAL_FILE_ID: 0xb0004,
    /** Malformed internal file */
    MALFORMED_INTERNAL_FILE: 0xb0005,
    /** Malformed file lock */
    MALFORMED_FILE_LOCK: 0xb0006,
    /** Can't register VFS */
    DATABASE_VFS_REGISTER: 0xb0101,
    /** Can't open database */
    DATABASE_OPEN: 0xb0102,
    /** ATTACH failed */
    DATABASE_ATTACH: 0xb0103,
    /** Error preparing INSERT */
    INSERT_PREPARE: 0xb0201,
    /** Error executing INSERT */
    INSERT_EXECUTE: 0xb0202,
    /** Error preparing UPDATE */
    UPDATE_PREPARE: 0xb0203,
    /** Error executing UPDATE */
    UPDATE_EXECUTE: 0xb0204,
    /** Error preparing DELETE */
    DELETE_PREPARE: 0xb0205,
    /** Error executing DELETE */
    DELETE_EXECUTE: 0xb0206,
    /** Error preparing SELECT */
    SELECT_PREPARE: 0xb0207,
    /** Error preparing query */
    QUERY_PREPARE: 0xb0208,
    /** Error creating table */
    TABLE_CREATION: 0xb0209,
    /** Error beginning transaction */
    TRANSACTION_BEGIN: 0xb0301,
    /** Error committing transaction */
    TRANSACTION_COMMIT: 0xb0302,
    /** Error rolling back transaction */
    TRANSACTION_ROLLBACK: 0xb0303,
} as const;

/**
 * Error codes raised by the Lock module (`NativeError.scope === "Lock"`).
 */
export const LockErrorCode = {
    /** Endpoint not initialized */
    NOT_INITIALIZED: 0xc0001,
    /** Invalid lock level value */
    INVALID_LOCK_LEVEL: 0xc0002,
} as const;
