/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { ExtKey } from "./service/ExtKey.js";

export type SortOrder = "desc" | "asc";

/**
 * Holds Event details
 *
 * @type {Event}
 *
 * @param {string} type event type
 * @param {string} channel channel
 * @param {number} connectionId id of source connection
 *
 */
export interface Event {
    type: string;
    channel: string;
    connectionId: number;
    data?: unknown;
    subscriptions: string[];
    version: number;
    timestamp: number;
}

/**
 * Contains query parameters for methods returning lists (PagingList)
 *
 * @type {PagingQuery}
 *
 * @param {number} skip number of elements to skip from result
 * @param {number} limit limit of elements to return for query
 * @param {SortOrder} sortOrder Order of elements in result. Use "asc" for ascending, "desc" for descending.
 * @param {string} [lastId] id of the element from which query results should start
 * @param {string} [sortBy] field name to sort elements by
 * @param {string} [queryAsJson] extra query parameters in serialized JSON
 */
export interface PagingQuery {
    skip: number;
    limit: number;
    sortOrder: SortOrder;
    lastId?: string;
    sortBy?: string;
    queryAsJson?: string;
}

/**
 * Contains results of listing methods
 *
 * @type {PagingList<T>}
 *
 * @param {number} totalAvailable total items available to get
 * @param {T[]} readItems list of items read during single method call
 *
 */
export interface PagingList<T> {
    totalAvailable: number;
    readItems: T[];
}

/**
 * Contains base Context information
 *
 * @type {Context}
 *
 * @param {string} userId ID of user requesting information
 * @param {string} contextId ID of context
 *
 */
export interface Context {
    userId: string;
    contextId: string;
}

/**
 * Contains ID of user and the corresponding public key
 *
 * @type {UserWithPubKey}
 *
 * @param {string} userId ID of the user
 * @param {string} pubKey user's public key
 *
 */
export interface UserWithPubKey {
    userId: string;
    pubKey: string;
}

/**
 * Contains information about the change of user status.
 *
 * @type {UserStatusChange}
 *
 * @param {string} action User status change action, which can be "login" or "logout"
 * @param {string} timestamp Timestamp of the change
 */
export interface UserStatusChange {
    action: string;
    timestamp: number;
}

/**
 * Contains Information about user, their status, and the last status change.
 *
 * @type {UserInfo}
 *
 * @param {UserWithPubKey} user User publicKey and userId
 * @param {boolean} isActive is user connected to the Bridge
 * @param {UserStatusChange} lastStatusChange User last status change or no value if they have never logged in
 *
 */
export interface UserInfo {
    user: UserWithPubKey;
    isActive: boolean;
    lastStatusChange?: UserStatusChange;
}

/**
 * Contains information about the user assigned to a Context.
 *
 * @type {ContextUserEventData}
 *
 * @param {string} contextId ID of the Context
 * @param {UserWithPubKey} user user metadata
 */
export interface ContextUserEventData {
    contextId: string;
    user: UserWithPubKey;
}

/**
 * Contains the user and their status change action.
 *
 * @type {UserWithAction}
 *
 * @param {UserWithPubKey} user user metadata
 * @param {string} action User status change action, e.g. "login" or "logout"
 */
export interface UserWithAction {
    user: UserWithPubKey;
    action: "login" | "logout";
}

/**
 * Contains information about changed statuses of users in the Context.
 *
 * @type {ContextUsersStatusChangedEventData}
 *
 * @param {string} contextId ID of the Context
 * @param {UserWithAction[]} users List of users with their status changes
 */
export interface ContextUsersStatusChangedEventData {
    contextId: string;
    users: UserWithAction[];
}

/**
 * Contains information of custom context event payload.
 *
 * @type {ContextCustomEventData}
 *
 * @param {string} contextId ID of the Context where the event originated
 * @param {string} userId ID of the user who emitted the event
 * @param {Uint8Array} payload Raw payload of the custom event
 * @param {number} statusCode Status code of payload decryption
 * @param {number} schemaVersion Version describing payload encoding/encryption
 */
export interface ContextCustomEventData {
    contextId: string;
    userId: string;
    payload: Uint8Array;
    statusCode: number;
    schemaVersion: number;
}

/**
 * Holds all available information about a Thread.
 *
 * @type {Thread}
 *
 * @param {string} contextId ID of the Context
 * @param {string} threadId ID ot the Thread
 * @param {number} createDate Thread creation timestamp
 * @param {string} author ID of the user who created the Thread
 * @param {number} lastModificationDate Thread last modification timestamp
 * @param {string} lastModifier ID of the user who last modified the Thread
 * @param {string[]} users list of users (their IDs) with access to the Thread
 * @param {string[]} managers list of users (their IDs) with management rights
 * @param {number} version version number (changes on updates)
 * @param {number} lastMsgDate timestamp of last posted message
 * @param {Uint8Array} publicMeta Thread's public metadata
 * @param {Uint8Array} privateMeta Thread's private metadata
 * @param {ContainerPolicy} policy Thread's policies
 * @param {number} messagesCount total number of messages in the Thread
 * @param {number} statusCode status code of retrieval and decryption of the Thread
 *
 */
export interface Thread {
    contextId: string;
    threadId: string;
    createDate: number;
    creator: string;
    lastModificationDate: number;
    lastModifier: string;
    users: string[];
    managers: string[];
    version: number;
    lastMsgDate: number;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    policy: ContainerPolicy;
    messagesCount: number;
    statusCode: number;
    groups: GroupGrant[];
    staleGroups: string[];
}

/**
 * Holds information about the Message.
 *
 * @type {Message}
 *
 * @param {ServerMessageInfo} info message's information created by server
 * @param {Uint8Array} publicMeta message's public metadata
 * @param {Uint8Array} privateMeta message's private metadata
 * @param {Uint8Array} data message's data
 * @param {string} authorPubKey public key of an author of the message
 * @param {number} statusCode status code of retrieval and decryption of the message
 *
 */
export interface Message {
    info: ServerMessageInfo;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    data: Uint8Array;
    authorPubKey: string;
    statusCode: number;
}

/**
 * Holds message's information created by server
 *
 * @type {ServerMessageInfo}
 *
 * @param {string} threadId ID of the Thread
 * @param {string} messageId ID of the message
 * @param {number} createDate message's creation timestamp
 * @param {string} author ID of the user who created the message
 *
 */
export interface ServerMessageInfo {
    threadId: string;
    messageId: string;
    createDate: number;
    author: string;
}

/**
 * Holds all available information about a Store.
 *
 * @type {Store}
 *
 * @param {string} storeId ID ot the Store
 * @param {string} contextId ID of the Context
 * @param {number} createDate Store creation timestamp
 * @param {string} creator ID of user who created the Store
 * @param {number} lastModificationDate Thread last modification timestamp
 * @param {number} lastFileDate timestamp of last created file
 * @param {string} lastModifier ID of the user who last modified the Store
 * @param {string[]} users list of users (their IDs) with access to the Store
 * @param {string[]} managers list of users (their IDs) with management rights
 * @param {number} version version number (changes on updates)
 * @param {Uint8Array} publicMeta Store's public metadata
 * @param {Uint8Array} privateMeta Store's private metadata
 * @param {ContainerPolicy} policy Store's policies
 * @param {number} filesCount total number of files in the Store
 * @param {number} statusCode status code of retrieval and decryption of the Store
 *
 */
export interface Store {
    storeId: string;
    contextId: string;
    createDate: number;
    creator: string;
    lastModificationDate: number;
    lastFileDate: number;
    lastModifier: string;
    users: string[];
    managers: string[];
    version: number;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    policy: ContainerPolicy;
    filesCount: number;
    statusCode: number;
    groups: GroupGrant[];
    staleGroups: string[];
}

/**
 * Holds information about the file.
 *
 * @type {File}
 *
 * @param {ServerFileInfo} info file's information created by server
 * @param {Uint8Array} publicMeta file's public metadata
 * @param {Uint8Array} privateMeta file's private metadata
 * @param {number} size file's size
 * @param {string} authorPubKey public key of an author of the file
 * @param {number} tatusCode status code of retrieval and decryption of the file
 *
 */
export interface File {
    info: ServerFileInfo;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    size: number;
    authorPubKey: string;
    statusCode: number;
}

/**
 * Holds file's information created by server
 *
 * @type {ServerFileInfo}
 *
 * @param {string} storeId ID of the Store
 * @param {string} fileId ID of the file
 * @param {number} createDate file's creation timestamp
 * @param {string} author ID of the user who created the file
 *
 */
export interface ServerFileInfo {
    storeId: string;
    fileId: string;
    createDate: number;
    author: string;
}

/**
 * Holds all available information about an Inbox.
 *
 * @type {Inbox}
 *
 * @param {string} inboxId ID ot the Inbox
 * @param {string} contextId ID of the Context
 * @param {number} createDate Inbox creation timestamp
 * @param {string} creator ID of user who created the Inbox
 * @param {number} lastModificationDate Inbox last modification timestamp
 * @param {string} lastModifier ID of the user who last modified the Inbox
 * @param {string[]} users list of users (their IDs) with access to the Inbox
 * @param {string[]} managers list of users (their IDs) with management rights
 * @param {number} version version number (changes on updates)
 * @param {Uint8Array} publicMeta Inbox' public metadata
 * @param {Uint8Array} privateMeta Inbox' private metadata
 * @param {FilesConfig} filesConfig Inbox' files configuration
 * @param {ContainerWithoutItemPolicy} policy Inbox' policies
 * @param {number} statusCode status code of retrieval and decryption of the Inbox
 *
 */
export interface Inbox {
    inboxId: string;
    contextId: string;
    createDate: number;
    creator: string;
    lastModificationDate: number;
    lastModifier: string;
    users: string[];
    managers: string[];
    version: number;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    filesConfig?: FilesConfig;
    policy: ContainerWithoutItemPolicy;
    statusCode: number;
    groups: GroupGrant[];
    staleGroups: string[];
}
/**
 * Holds Inbox' public information
 *
 * @type {InboxPublicView}
 *
 * @param {string} inboxId ID of the Inbox
 * @param {number} version version of the Inbox
 * @param {Uint8Array} publicMeta Inbox' public metadata
 *
 */
export interface InboxPublicView {
    inboxId: string;
    version: number;
    publicMeta: Uint8Array;
}

/**
 * Holds information about Inbox' entry
 *
 * @type {InboxEntry}
 *
 * @param {string} entryId ID of the entry
 * @param {string} inboxId ID of the Inbox
 * @param {Uint8Array} data entry data
 * @param {File[]} files list of files attached to the entry
 * @param {string} authorPubKey public key of the author of an entry
 * @param {number} createDate Inbox entry creation timestamp
 * @param {number} statusCode status code of retrieval and decryption of the Inbox entry
 */
export interface InboxEntry {
    entryId: string;
    inboxId: string;
    data: Uint8Array;
    files: File[];
    authorPubKey: string;
    createDate: number;
    statusCode: number;
}

/**
 * Holds Inbox files configuration
 *
 * @type {FilesConfig}
 *
 * @param {int64_t} minCount minimum number of files required when sending inbox entry
 * @param {int64_t} maxCount maximum number of files allowed when sending inbox entry
 * @param {int64_t} maxFileSize maximum file size allowed when sending inbox entry
 * @param {int64_t} maxWholeUploadSize maximum size of all files in total allowed when sending inbox entry
 *
 */
export interface FilesConfig {
    minCount: number;
    maxCount: number;
    maxFileSize: number;
    maxWholeUploadSize: number;
}

/**
 * Holds all available information about a KVDB.
 *
 * @type {Kvdb}
 *
 * @param {string} contextId ID of the Context
 * @param {string} kvdbId ID ot the KVDB
 * @param {number} createDate KVDB creation timestamp
 * @param {string} author ID of the user who created the KVDB
 * @param {number} lastModificationDate KVDB last modification timestamp
 * @param {string} lastModifier ID of the user who last modified the KVDB
 * @param {string[]} users list of users (their IDs) with access to the KVDB
 * @param {string[]} managers list of users (their IDs) with management rights
 * @param {number} version version number (changes on updates)
 * @param {number} lastMsgDate timestamp of last posted message
 * @param {Uint8Array} publicMeta KVDB's public meta data
 * @param {Uint8Array} privateMeta KVDB's private mata data
 * @param {ContainerPolicy} policy KVDB's policies
 * @param {number} entries total number of entries in the KVDB
 * @param {number} statusCode status code of retrival and decryption of the KVDB
 * @param {number} schemaVersion Version of the KVDB data structure and how it is encoded/encrypted
 */
export interface Kvdb {
    contextId: string;
    kvdbId: string;
    createDate: number;
    creator: string;
    lastModificationDate: number;
    lastModifier: string;
    users: string[];
    managers: string[];
    version: number;
    lastMsgDate: number;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    policy: ContainerPolicy;
    entries: number;
    statusCode: number;
    schemaVersion: number;
    groups: GroupGrant[];
    staleGroups: string[];
}

/**
 * Holds information about the KvdbEntry.
 *
 * @type {KvdbEntry}
 *
 * @param {ServerKvdbEntryInfo} info KVDB entry's information created by server
 * @param {Uint8Array} publicMeta KVDB entry's public meta data
 * @param {Uint8Array} privateMeta KVDB entry's private mata data
 * @param {Uint8Array} data KVDB entry's data
 * @param {string} authorPubKey public key of an author of the KVDB entry
 * @param {number} version version of the KVDB entry
 * @param {number} statusCode status code of retrival and decryption of the KVDB entry
 * @param {number} schemaVersion Version of the KVDB entry data structure and how it is encoded/encrypted
 */
export interface KvdbEntry {
    info: ServerKvdbEntryInfo;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    data: Uint8Array;
    authorPubKey: string;
    version: number;
    statusCode: number;
    schemaVersion: number;
}

/**
 * Holds message's information created by server
 *
 * @type {ServerKvdbEntryInfo}
 *
 * @param {string} kvdbId ID of the kvdb
 * @param {string} key KVDB entry's key
 * @param {number} createDate entry creation timestamp
 * @param {string} author ID of the user who created the entry
 *
 */
export interface ServerKvdbEntryInfo {
    kvdbId: string;
    key: string;
    createDate: number;
    author: string;
}

/**
 * Holds information about the entries deletion result.
 *
 * @type {DeleteEntriesResult}
 */
export type DeleteEntriesResult = Map<string, boolean>;

/**
 * A group granted access to a container, as reported on the container itself.
 *
 * @type {GroupGrant}
 *
 * @param {string} groupId ID of the group
 * @param {string} role role held by the group in the container ("user" or "manager")
 */
export interface GroupGrant {
    groupId: string;
    role: string;
}

/**
 * A group grant carrying the group's verified public key - what you pass when
 * granting a group access to a container (`createThread`, `updateStore`,
 * `rotateKvdbKeys`, …). Take `groupPubKey` and `groupEpoch` from the
 * {@link Group} / {@link GroupSummary} you got from {@link GroupApi}.
 *
 * @type {GroupGrantWithKey}
 *
 * @param {string} groupId ID of the group
 * @param {string} role role held by the group in the container ("user" or "manager")
 * @param {string} groupPubKey verified group identity public key (base58-DER encoded)
 * @param {number} groupEpoch epoch at which `groupPubKey` was verified (= `Group.keyVersion`)
 */
export interface GroupGrantWithKey {
    groupId: string;
    role: string;
    groupPubKey: string;
    groupEpoch: number;
}

/**
 * Holds all available information about a Group.
 *
 * `users` and `managers` are two separate lists, not a roster and a subset of
 * it: a member seated as a manager is listed in `managers` alone, so the
 * Group's full roster is the *union* of the two. A manager has read access
 * either way.
 *
 * @type {Group}
 *
 * @param {string} contextId ID of the Context
 * @param {string} groupId ID of the Group
 * @param {string} groupPubKey Group identity public key (base58-DER encoded)
 * @param {number} createDate Group creation timestamp
 * @param {string} creator ID of user who created the Group
 * @param {number} lastModificationDate Group last modification timestamp
 * @param {string} lastModifier ID of the user who last modified the Group
 * @param {string[]} users list of users (their IDs) with access to the Group, excluding
 *   those listed in `managers`
 * @param {string[]} managers list of users (their IDs) with management rights
 * @param {number} publicMetaVersion public-metadata version; moves only on `updateGroupPublicMeta`
 * @param {number} privateMetaVersion private-metadata version; moves only on `updateGroupPrivateMeta`
 * @param {number} rosterVersion roster version; moves only on `addGroupMembers`/`removeGroupMembers`
 * @param {Uint8Array} publicMeta Group's public metadata
 * @param {Uint8Array} privateMeta Group's private metadata
 * @param {ContainerPolicy} policy Group's policies
 * @param {number} statusCode status code of retrieval and verification of the Group
 * @param {number} schemaVersion version of the Group data structure
 * @param {number} keyVersion epoch counter of the Group identity keypair, incremented on every member removal
 * @param {string} type optional type tag
 */
export interface Group {
    contextId: string;
    groupId: string;
    groupPubKey: string;
    createDate: number;
    creator: string;
    lastModificationDate: number;
    lastModifier: string;
    users: string[];
    managers: string[];
    publicMetaVersion: number;
    privateMetaVersion: number;
    rosterVersion: number;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    policy: ContainerPolicy;
    statusCode: number;
    schemaVersion: number;
    keyVersion: number;
    type?: string;
}

/**
 * One member to seat in a Group, and the role they take. Passed to
 * {@link GroupApi.addGroupMembers}.
 *
 * The role travels per member rather than per call, so seating a manager and a
 * user together stays one delta over the union of their key-tree paths.
 *
 * @type {GroupMemberToAdd}
 *
 * @param {UserWithPubKey} user the member, with their public key
 * @param {string} role role they take: "user" or "manager"
 */
export interface GroupMemberToAdd {
    user: UserWithPubKey;
    role: string;
}

/**
 * Which of a Group's keys sealed an envelope, and therefore what its author
 * field is worth.
 */
export enum EnvelopeType {
    /** Sealed with the Group's symmetric data key by a member, and signed by them. */
    ENVELOPE_FROM_MEMBER = 1,
    /** Sealed to the Group's identity public key by an outsider using a throwaway keypair. Unattributable. */
    ENVELOPE_ANONYMOUS = 2,
}

/**
 * The plaintext of an envelope, together with what could be established about
 * who wrote it. Returned by {@link GroupApi.decrypt}.
 *
 * @type {DecryptedEnvelope}
 *
 * @param {Uint8Array} data decrypted content
 * @param {string} groupId ID of the Group the envelope was sealed for; authenticated
 * @param {string} authorPubKey verified author public key (base58-DER encoded), EMPTY when
 *   `type` is `ENVELOPE_ANONYMOUS` - branch on `type`, not on this field being non-empty
 * @param {EnvelopeType} type which of the Group's keys sealed this envelope
 */
export interface DecryptedEnvelope {
    data: Uint8Array;
    groupId: string;
    authorPubKey: string;
    type: EnvelopeType;
}

/**
 * What could be established about a sealed file, once all of it has been
 * received. Returned by {@link GroupApi.finishFileDecryption}.
 *
 * @type {DecryptedFileInfo}
 *
 * @param {string} groupId ID of the Group the file was sealed for
 * @param {string} authorPubKey verified author public key (base58-DER encoded), EMPTY when
 *   `type` is `ENVELOPE_ANONYMOUS`
 * @param {EnvelopeType} type whether the file came from a member or an anonymous outsider
 * @param {boolean} complete whether the whole file was verified to be present; `false` once
 *   {@link GroupApi.seekInEncryptedFile} has been used on the handle
 */
export interface DecryptedFileInfo {
    groupId: string;
    authorPubKey: string;
    type: EnvelopeType;
    complete: boolean;
}

/**
 * What a Group listing serves: identity, roster, epoch and policies. A page
 * deliberately carries no `publicMeta`/`privateMeta`, `schemaVersion` or
 * `statusCode` - nothing was decrypted or verified. Call `getGroup` for those.
 *
 * As on {@link Group}, `users` and `managers` are separate lists and the full
 * roster is their union.
 *
 * @type {GroupSummary}
 */
export interface GroupSummary {
    contextId: string;
    groupId: string;
    groupPubKey: string;
    createDate: number;
    creator: string;
    lastModificationDate: number;
    lastModifier: string;
    users: string[];
    managers: string[];
    publicMetaVersion: number;
    privateMetaVersion: number;
    rosterVersion: number;
    policy: ContainerPolicy;
    keyVersion: number;
    type?: string;
}

/**
 * Payload of a Group created/updated event. It deliberately carries no Group
 * state - the four counters are enough to decide whether the change matters,
 * and which plane moved; call `getGroup` when it does.
 *
 * @type {GroupChangedEventData}
 *
 * @param {string} groupId ID of the Group
 * @param {string} contextId ID of the Context
 * @param {number} publicMetaVersion public-metadata version after the change
 * @param {number} privateMetaVersion private-metadata version after the change
 * @param {number} rosterVersion roster version after the change
 * @param {number} keyVersion Group key epoch after the change
 * @param {string} changeKind which operation changed the Group: "created",
 *   "publicMetaUpdated", "privateMetaUpdated", "policyUpdated", "keyRotated",
 *   "memberAdded", "memberRemoved", "eraCut" or "archivePruned"
 */
export interface GroupChangedEventData {
    groupId: string;
    contextId: string;
    publicMetaVersion: number;
    privateMetaVersion: number;
    rosterVersion: number;
    keyVersion: number;
    changeKind: string;
}

/**
 * Payload of a Group custom notification sent with
 * {@link GroupApi.sendCustomEvent}. The payload arrives sealed with the Group's
 * own key and is opened before the event is delivered.
 *
 * @type {GroupCustomEventData}
 *
 * @param {string} groupId ID of the Group
 * @param {string} channelName name of the channel the notification was sent on
 * @param {string} userId ID of the sender as the Bridge reported it - NOT authenticated,
 *   see `authorPubKey`
 * @param {string} authorPubKey verified sender public key (base58-DER encoded); EMPTY when
 *   `statusCode` is non-zero
 * @param {Uint8Array} payload decrypted payload; EMPTY when `statusCode` is non-zero
 * @param {number} statusCode `0` when the payload was opened, otherwise the error that
 *   stopped it (key could not be resolved, or the payload did not verify)
 */
export interface GroupCustomEventData {
    groupId: string;
    channelName: string;
    userId: string;
    authorPubKey: string;
    payload: Uint8Array;
    statusCode: number;
}

/**
 * Payload of a Group deleted event.
 *
 * @type {GroupDeletedEventData}
 *
 * @param {string} groupId ID of the Group
 * @param {string} contextId ID of the Context
 */
export interface GroupDeletedEventData {
    groupId: string;
    contextId: string;
}

/**
 * Holds Container policies settings
 *
 * @type {ContainerWithoutItemPolicy}
 *
 * @param {PolicyEntry} get determine who can get a container
 * @param {PolicyEntry} update determine who can update a container
 * @param {PolicyEntry} delete determine who can delete a container
 * @param {PolicyEntry} updatePolicy determine who can update the policy of a container
 * @param {PolicyBooleanEntry} updaterCanBeRemovedFromManagers determine whether the updater can be removed from the list of managers
 * @param {PolicyBooleanEntry} ownerCanBeRemovedFromManagers determine whether the owner can be removed from the list of managers
 * @param {PolicyBooleanEntry} forwardSecrecy enforce forward secrecy: block writes when group grants are stale after a group key rotation
 */
export interface ContainerWithoutItemPolicy {
    get?: PolicyEntry;
    update?: PolicyEntry;
    delete?: PolicyEntry;
    updatePolicy?: PolicyEntry;
    updaterCanBeRemovedFromManagers?: PolicyBooleanEntry;
    ownerCanBeRemovedFromManagers?: PolicyBooleanEntry;
    forwardSecrecy?: PolicyBooleanEntry;
}

/**
 * Holds Container policies settings
 *
 * @type {ContainerPolicy}
 *
 * @param {ItemPolicy} item item policies
 */
export interface ContainerPolicy extends ContainerWithoutItemPolicy {
    item?: ItemPolicy;
}

/**
 * @type {PolicyEntry}
 */
export type PolicyEntry =
    | "inherit"
    | "yes"
    | "no"
    | "default"
    | "none"
    | "all"
    | "user"
    | "owner"
    | "manager"
    | "itemOwner"
    | "itemOwner&user"
    | "itemOwner&user,manager"
    | "owner&user"
    | "manager&owner"
    | "itemOwner,manager"
    | "itemOwner,owner"
    | "itemOwner,manager,owner"
    | "manager,owner"
    | (string & { __policyEntry: never });

/**
 * @type {PolicyBooleanEntry}
 */
export type PolicyBooleanEntry = "inherit" | "default" | "yes" | "no";

/**
 * Holds Container's item policies settings
 *
 * @type {ContainerWithoutItemPolicy}
 *
 * @param {PolicyEntry} get determine who can get an item
 * @param {PolicyEntry} listMy determine who can list items created by me
 * @param {PolicyEntry} listAll determine who can list all items
 * @param {PolicyEntry} create determine who can create an item
 * @param {PolicyEntry} update determine who can update an item
 * @param {PolicyEntry} delete determine who can delete an item
 */
export interface ItemPolicy {
    get?: PolicyEntry;
    listMy?: PolicyEntry;
    listAll?: PolicyEntry;
    create?: PolicyEntry;
    update?: PolicyEntry;
    delete?: PolicyEntry;
}

/**
 * Lifecycle state of a Stream Room.
 *
 * @typedef {("created" | "open" | "closed")} StreamRoomState
 * @property {"created"} created the room exists but has never been opened
 * @property {"open"} open the room is active and can be joined
 * @property {"closed"} closed the room has been closed (e.g. auto-closed after the last user left)
 */
export type StreamRoomState = "created" | "open" | "closed";

export interface StreamRoom {
    contextId: string;
    streamRoomId: string;
    createDate: number;
    creator: string;
    lastModificationDate: number;
    lastModifier: string;
    users: string[];
    managers: string[];
    version: number;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    policy: ContainerPolicy;
    statusCode: number;
    state: StreamRoomState;
    emptyRoomTtl: number;
    groups: GroupGrant[];
    staleGroups: string[];
}

export interface StreamInfo {
    id: number;
    userId: string;
    dummy?: boolean;
    tracks: TrackInfo[];
    talking?: boolean;
}
export interface TrackInfo {
    type: string;
    mindex: string;
    mid: string;
    disabled?: boolean;
    codec: string;
    description?: string;
    moderated?: boolean;
    simulcast?: boolean;
    svc?: boolean;
    talking?: boolean;
}

export interface StreamPublishResult {
    published: boolean;
    data?: {
        streamRoomId: string;
        stream: StreamInfo;
        userId: string;
    };
}

// export namespace search {
/*
 * Defines the mode in which the Search Index operates, specifically regarding
 * the storage and retrieval of document content.
 *
 * WITH_CONTENT - stores the full document content internally.
 * WITHOUT_CONTENT - The Index only stores metadata and terms necessary for search,
 * but discards the original document content.
 *
 * The numeric values must stay in sync with `search::IndexMode` in the C++ core
 * (UNKNOWN = 0, WITH_CONTENT = 1, WITHOUT_CONTENT = 2) - the core rejects 0 and
 * would otherwise silently interpret a shifted value as a different mode.
 */
export enum IndexMode {
    /** IndexMode is UNKNOWN or the data is unreadable (check statusCode) */
    UNKNOWN = 0,
    WITH_CONTENT = 1,
    WITHOUT_CONTENT = 2,
}

/**
 * Holds all available information about a Search Index.
 *
 * @type {SearchIndex}
 *
 * @param {string} contextId ID of the Context
 * @param {string} indexId ID of the Search Index
 * @param {number} createDate Index creation timestamp
 * @param {string} creator ID of user who created the Index
 * @param {number} lastModificationDate Index last modification timestamp
 * @param {string} lastModifier ID of the user who last modified the Index
 * @param {string[]} users list of users (their IDs) with access to the Thread
 * @param {string[]} managers list of users (their IDs) with management rights
 * @param {number} version Version number (changes on updates)
 * @param {Uint8Array} publicMeta Thread's public metadata
 * @param {Uint8Array} privateMeta Thread's privateMeta metadata
 * @param {ContainerPolicy} policy Thread's policies
 * @param {IndexMode} mode The operating mode of the Index, defining how document content is handled.
 * @param {number} statusCode status code of retrieval and decryption of the Thread
 * @param {number} schemaVersion Version of the Search Index data structure and how it is encoded/encrypted
 */
export interface SearchIndex {
    contextId: string;
    indexId: string;
    createDate: number;
    creator: string;
    lastModificationDate: number;
    lastModifier: string;
    users: string[];
    managers: string[];
    version: number;
    publicMeta: Uint8Array;
    privateMeta: Uint8Array;
    policy: ContainerPolicy;
    mode: IndexMode;
    statusCode: number;
    schemaVersion: number;
    groups: GroupGrant[];
    staleGroups: string[];
}

/**
 * An interface representing a document for indexing.
 *
 * @type {Document}
 *
 * @param {number} documentId Document ID
 * @param {string} name Document name
 * @param {string} content Document content
 */
export interface Document {
    documentId: number;
    name: string;
    content: string;
}
// }

/**
 * Holds error details
 *
 * @type {Error}
 *
 * @param {number} code error code
 * @param {string} name error name
 * @param {string} scope error scope
 * @param {string} description error description
 * @param {string} full all available data about the error
 *
 */
export interface Error {
    code: number;
    name: string;
    scope: string;
    description: string;
    full: string;
}
/**
 * @param {string} mnemonic BIP-39 mnemonic
 * @param {ExtKey} extKey Ecc Key
 * @param {Uint8Array} entropy BIP-39 entropy
 */
export interface BIP39 {
    mnemonic: string;
    entropy: Uint8Array;
    extKey: ExtKey;
}

/**
 *
 * @type {VerificationRequest}
 *
 * @param {string} contextId Id of the Context
 * @param {string} senderId Id of the sender
 * @param {string} senderPubKey Public key of the sender
 * @param {number} date The data creation date
 * @param {BridgeIdentity} bridgeIdentity Bridge Identity
 */
export interface VerificationRequest {
    contextId: string;
    senderId: string;
    senderPubKey: string;
    date: number;
    bridgeIdentity?: BridgeIdentity;
}

/**
 * Bridge server identification details.
 *
 * @type {BridgeIdentity}
 *
 * @param {string} url Bridge URL
 * @param {string} pubKey Bridge public Key
 * @param {string} instanceId Bridge instance Id given by PKI
 */
export interface BridgeIdentity {
    url: string;
    pubKey?: string;
    instanceId?: string;
}

export interface Key {
    keyId: string;
    key: Uint8Array;
    type: number; // 0 - local, 1 - remote
}

export interface StreamSubscription {
    streamId: number;
    streamTrackId?: string;
}

export interface StreamSubscriber {
    userId: string;
    subscriptions: StreamSubscription[];
    publishedStream?: StreamInfo;
}

export interface TurnCredentials {
    url: string;
    username: string;
    password: string;
    expirationTime: number;
}

export interface RemoteStreamListener {
    streamRoomId: string;
    streamId?: number;
    onRemoteStreamTrack?: (event: RTCTrackEvent) => void;
    /**
     * @param data decrypted data channel payload; empty when `statusCode` is non-zero
     * @param statusCode native `StreamApiLow::decryptDataChannelMessage` status - `0` on success
     */
    onRemoteData?: (data: Uint8Array, statusCode: number) => void;
}

/**
 * PKI Verification options
 *
 * @type {PKIVerificationOptions}
 *
 * @param {string} [bridgePubKey] Bridge public key
 * @param {string} [bridgeInstanceId] Bridge instance Id given by PKI
 */
export interface PKIVerificationOptions {
    bridgePubKey?: string;
    bridgeInstanceId?: string;
}

// Enums
export enum ConnectionEventType {
    USER_ADD = 0,
    USER_REMOVE = 1,
    USER_STATUS = 2,
}

export enum ConnectionEventSelectorType {
    CONTEXT_ID = 0,
}

export enum StoreEventType {
    STORE_CREATE = 0,
    STORE_UPDATE = 1,
    STORE_DELETE = 2,
    STORE_STATS = 3,
    FILE_CREATE = 4,
    FILE_UPDATE = 5,
    FILE_DELETE = 6,
    COLLECTION_CHANGE = 7,
}

export enum StoreEventSelectorType {
    CONTEXT_ID = 0,
    STORE_ID = 1,
    FILE_ID = 2,
}

export enum ThreadEventType {
    THREAD_CREATE = 0,
    THREAD_UPDATE = 1,
    THREAD_DELETE = 2,
    THREAD_STATS = 3,
    MESSAGE_CREATE = 4,
    MESSAGE_UPDATE = 5,
    MESSAGE_DELETE = 6,
    COLLECTION_CHANGE = 7,
}

export enum ThreadEventSelectorType {
    CONTEXT_ID = 0,
    THREAD_ID = 1,
    MESSAGE_ID = 2,
}

export enum InboxEventType {
    INBOX_CREATE = 0,
    INBOX_UPDATE = 1,
    INBOX_DELETE = 2,
    ENTRY_CREATE = 3,
    ENTRY_DELETE = 4,
    COLLECTION_CHANGE = 5,
}

export enum InboxEventSelectorType {
    CONTEXT_ID = 0,
    INBOX_ID = 1,
    ENTRY_ID = 2,
}

export enum KvdbEventType {
    KVDB_CREATE = 0,
    KVDB_UPDATE = 1,
    KVDB_DELETE = 2,
    KVDB_STATS = 3,
    ENTRY_CREATE = 4,
    ENTRY_UPDATE = 5,
    ENTRY_DELETE = 6,
    COLLECTION_CHANGE = 7,
}

export enum KvdbEventSelectorType {
    CONTEXT_ID = 0,
    KVDB_ID = 1,
    ENTRY_ID = 2,
}

/**
 * Level of a lock held on a resource, following the SQLite locking model:
 * NONE < SHARED < RESERVED < PENDING < EXCLUSIVE.
 *
 * @type {LockLevel}
 */
export enum LockLevel {
    NONE = 0,
    SHARED = 1,
    RESERVED = 2,
    PENDING = 3,
    EXCLUSIVE = 4,
}

/**
 * Lowercase name of a {@link LockLevel}, as reported by the WASM core in
 * `LockOperationResult.currentLevelName`.
 *
 * @type {LockLevelName}
 */
export type LockLevelName = "none" | "shared" | "reserved" | "pending" | "exclusive";

/**
 * Holds the result of a lock/unlock operation.
 *
 * @type {LockOperationResult}
 *
 * @param {boolean} success whether the operation succeeded
 * @param {LockLevel} currentLevel the lock level in effect after the operation
 * @param {LockLevelName} currentLevelName human-readable name of `currentLevel`
 */
export interface LockOperationResult {
    success: boolean;
    currentLevel: LockLevel;
    currentLevelName: LockLevelName;
}

export enum EventsEventSelectorType {
    CONTEXT_ID = 0,
}

export enum GroupEventType {
    GROUP_CREATE = 0,
    GROUP_UPDATE = 1,
    GROUP_DELETE = 2,
}

export enum GroupEventSelectorType {
    CONTEXT_ID = 0,
    GROUP_ID = 1,
}

export enum StreamEventType {
    STREAMROOM_CREATE = 0,
    STREAMROOM_UPDATE = 1,
    STREAMROOM_DELETE = 2,
    STREAM_JOIN = 3,
    STREAM_LEAVE = 4,
    STREAM_PUBLISH = 5,
    STREAM_UNPUBLISH = 6,
    STREAM_SUBSCRIBE = 7,
    STREAM_UNSUBSCRIBE = 8,
    STREAM_UPDATE = 9,
}

export interface StreamRoomMemberEventData {
    streamRoomId: string;
    userId: string;
}

export interface StreamRoomReofferEventData {
    streamRoomId: string;
    jsep?: { type: "offer"; sdp: string };
}

export interface StreamSubscriptionRef {
    streamId: number;
    streamTrackId?: string;
}

export interface StreamSubscribedEventData {
    streamRoomId: string;
    userId: string;
    subscriptions: StreamSubscriptionRef[];
}

export interface StreamUpdatedEventData {
    streamRoomId: string;
    streamId: number;
    userId: string;
    tracksAdded: TrackInfo[];
    tracksRemoved: TrackInfo[];
    tracksModified: { before: TrackInfo; after: TrackInfo }[];
}

export interface StreamPublishedEventData {
    streamRoomId: string;
    userId: string;
    stream: StreamInfo;
}

export interface StreamUnpublishedEventData {
    streamRoomId: string;
    userId: string;
    streamId: number;
}

export enum StreamEventSelectorType {
    CONTEXT_ID = 0,
    STREAMROOM_ID = 1,
    STREAM_ID = 2,
}

export type CollectionItemChange = {
    itemId: string;
    action: string;
};

export type CollectionChangedEventData = {
    moduleType: string;
    moduleId: string;
    affectedItemsCount: number;
    items: CollectionItemChange[];
};
