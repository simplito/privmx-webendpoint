/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { GroupApiNative } from "../native/GroupApiNative.js";
import {
    PagingQuery,
    PagingList,
    UserWithPubKey,
    Group,
    GroupSummary,
    ContainerPolicy,
    GroupEventType,
    GroupEventSelectorType,
} from "../Types.js";

/**
 * Group API: manages Groups - named sets of Context users that can be granted
 * access to containers (Threads, Stores, KVDBs, Inboxes, Stream Rooms) as a
 * unit, instead of listing every member on every container.
 *
 * Key distribution is backed by a hidden key tree, so removing a member costs
 * work proportional to the logarithm of the group size, and adding one does not
 * advance the Group's key epoch (no container the Group can read has to be
 * re-keyed).
 *
 * Obtain an instance via {@link EndpointFactory.createGroupApi}; do not
 * construct it directly.
 *
 * ## Workflow
 * {@link createGroup} → {@link getGroup} (for `groupPubKey` and
 * `keyVersion`) → grant it to a container by passing a `GroupGrantWithKey` to
 * e.g. `ThreadApi.createThread`. Change membership with
 * {@link addGroupMember} / {@link removeGroupMember}; after a removal the
 * Group's epoch advances and every granted container must be re-keyed with its
 * `rotate*Keys` method.
 *
 * Events: {@link buildSubscriptionQuery} → {@link subscribeFor} → consume via
 * {@link EventQueue.waitEvent} → {@link unsubscribeFrom}.
 *
 * All methods reject with `NativeError` on server/crypto errors and throw
 * `Error` when the underlying connection has been closed.
 */
export class GroupApi extends BaseApi {
    /**
     * Created by EndpointFactory - never constructed by SDK users.
     * @internal
     */
    constructor(
        private native: GroupApiNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Creates a new Group whose key distribution is backed by a hidden key tree
     * and returns the new Group's ID.
     *
     * The Group's own metadata key is wrapped once to the Group itself rather
     * than once per member, which is what keeps a removal off the linear path.
     *
     * @param {string} contextId ID of the Context to create the Group in, from
     *   `Context.contextId` returned by {@link Connection.listContexts}
     * @param {UserWithPubKey[]} users members of the Group; build the entries
     *   from {@link Connection.listContextUsers}
     * @param {UserWithPubKey[]} managers members who can additionally update the
     *   Group or change its membership
     * @param {Uint8Array} publicMeta metadata stored unencrypted on the server -
     *   never place secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side; only Group
     *   members can decrypt it
     * @param {ContainerPolicy} [policies] fine-grained access rules overriding
     *   the Context defaults
     * @returns {string} ID of the new Group
     * @throws {NativeError} when the Context does not exist or a listed user is
     *   not registered in it
     */
    async createGroup(
        contextId: string,
        users: UserWithPubKey[],
        managers: UserWithPubKey[],
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        policies?: ContainerPolicy,
    ): Promise<string> {
        return this.native.createGroup(this.servicePtr, [
            contextId,
            users,
            managers,
            publicMeta,
            privateMeta,
            policies,
        ]);
    }

    /**
     * Adds one member to a Group without advancing its key epoch.
     *
     * Costs one wrap for the new member plus one metadata key entry. Because the
     * epoch does not move, every container the Group can read stays valid and
     * nobody else re-keys anything.
     *
     * @param {string} groupId ID of the Group, returned by
     *   {@link createGroup}
     * @param {UserWithPubKey} newMember the member to add, with their public key
     * @param {boolean} asManager whether the new member joins as a manager
     * @param {UserWithPubKey[]} users full member list *after* the addition
     * @param {UserWithPubKey[]} managers full manager list *after* the addition
     * @param {Uint8Array} publicMeta public metadata to store with this change
     * @param {Uint8Array} privateMeta private metadata to store with this change
     * @returns {Promise<void>} resolves when the member has been added
     * @throws {NativeError} when the Group does not exist or the user lacks
     *   management rights
     */
    async addGroupMember(
        groupId: string,
        newMember: UserWithPubKey,
        asManager: boolean,
        users: UserWithPubKey[],
        managers: UserWithPubKey[],
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
    ): Promise<void> {
        return this.native.addGroupMember(this.servicePtr, [
            groupId,
            newMember,
            asManager,
            users,
            managers,
            publicMeta,
            privateMeta,
        ]);
    }

    /**
     * Removes one member from a Group and advances its key epoch.
     *
     * Blanks the member's leaf, replaces every key on the path from it to the
     * root, mints a new epoch key and re-wraps the Group's metadata key.
     * Containers the Group can read must be re-keyed afterwards with their
     * `rotate*Keys` method; the Bridge refuses new content written under the
     * superseded epoch until they are (see `Thread.staleGroups` and friends).
     *
     * @param {string} groupId ID of the Group, returned by
     *   {@link createGroup}
     * @param {string} userId ID of the member to remove
     * @param {UserWithPubKey[]} users member list that *remains*, without the
     *   removed member
     * @param {UserWithPubKey[]} managers manager list that remains
     * @param {Uint8Array} publicMeta public metadata to store with this change
     * @param {Uint8Array} privateMeta private metadata to store with this change
     * @returns {Promise<void>} resolves when the member has been removed and the
     *   Group's key epoch advanced
     * @throws {NativeError} when the Group does not exist or the user lacks
     *   management rights
     */
    async removeGroupMember(
        groupId: string,
        userId: string,
        users: UserWithPubKey[],
        managers: UserWithPubKey[],
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
    ): Promise<void> {
        return this.native.removeGroupMember(this.servicePtr, [
            groupId,
            userId,
            users,
            managers,
            publicMeta,
            privateMeta,
        ]);
    }

    /**
     * Updates a Group's metadata and policies.
     *
     * Membership is deliberately not updatable here - seating a member re-keys
     * their path in the Group's key tree, so it goes through
     * {@link addGroupMember} / {@link removeGroupMember} instead.
     *
     * @param {string} groupId ID of the Group to update
     * @param {Uint8Array} publicMeta new metadata stored unencrypted
     * @param {Uint8Array} privateMeta new metadata encrypted client-side
     * @param {number} version current Group version, from `Group.version`
     *   returned by {@link getGroup} - lets the server reject stale updates
     * @param {boolean} force `true` skips the `version` check
     * @param {boolean} forceGenerateNewKey when `true`, a fresh Group key is
     *   generated and redistributed
     * @param {ContainerPolicy} [policies] new access policies; omit to keep the
     *   current ones
     * @returns {Promise<void>} resolves when the Group has been updated
     * @throws {NativeError} when the Group does not exist, the user lacks
     *   management rights, or `version` does not match the server state
     */
    async updateGroup(
        groupId: string,
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        version: number,
        force: boolean,
        forceGenerateNewKey: boolean,
        policies?: ContainerPolicy,
    ): Promise<void> {
        return this.native.updateGroup(this.servicePtr, [
            groupId,
            publicMeta,
            privateMeta,
            version,
            force,
            forceGenerateNewKey,
            policies,
        ]);
    }

    /**
     * Permanently deletes a Group. Containers it was granted access to keep
     * existing; the grant simply stops resolving.
     *
     * @param {string} groupId ID of the Group to delete
     * @returns {Promise<void>} resolves when the Group has been deleted
     * @throws {NativeError} when the Group does not exist or the user lacks
     *   management rights
     */
    async deleteGroup(groupId: string): Promise<void> {
        return this.native.deleteGroup(this.servicePtr, [groupId]);
    }

    /**
     * Fetches a single Group with its metadata, roster, epoch and policies.
     *
     * This is where a container grant comes from: `Group.groupPubKey` and
     * `Group.keyVersion` are the `groupPubKey` / `groupEpoch` of a
     * `GroupGrantWithKey`.
     *
     * @param {string} groupId ID of the Group to fetch
     * @returns {Group} decrypted and verified Group data
     * @throws {NativeError} when the Group does not exist or the user is not a
     *   member of it
     */
    async getGroup(groupId: string): Promise<Group> {
        return this.native.getGroup(this.servicePtr, [groupId]);
    }

    /**
     * Lists the Groups of a Context that the user is a member of, one page at a
     * time.
     *
     * A page carries identity, roster, epoch and policies only - no
     * `publicMeta`/`privateMeta` and no verification status. Call
     * {@link getGroup} for those.
     *
     * @param {string} contextId ID of the Context to enumerate
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }`
     * @returns {PagingList<GroupSummary>} one page of Group summaries plus
     *   `totalAvailable`
     */
    async listGroups(
        contextId: string,
        pagingQuery: PagingQuery,
    ): Promise<PagingList<GroupSummary>> {
        return this.native.listGroups(this.servicePtr, [contextId, pagingQuery]);
    }

    /**
     * Subscribes this connection to Group events matching the given
     * subscription queries.
     *
     * Required order: {@link buildSubscriptionQuery} → `subscribeFor(queries)` →
     * consume events from the {@link EventQueue} → {@link unsubscribeFrom}.
     *
     * @param {string[]} subscriptionQueries query strings produced by
     *   {@link buildSubscriptionQuery}; hand-written strings are not supported
     * @returns {string[]} subscription IDs, index-aligned with
     *   `subscriptionQueries`
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Cancels Group event subscriptions previously created on this connection.
     *
     * @param {string[]} subscriptionIds IDs returned by {@link subscribeFor};
     *   unknown IDs cause a `NativeError` rejection
     * @returns {Promise<void>} resolves when all listed subscriptions have been cancelled
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
        return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Builds a subscription-query string describing one class of Group events.
     *
     * The query is assembled locally by the WASM core - nothing is sent yet;
     * pass the result to {@link subscribeFor} to activate it.
     *
     * @param {GroupEventType} eventType which Group event class to listen for
     * @param {GroupEventSelectorType} selectorType what `selectorId` refers to
     *   (a whole Context or a single Group)
     * @param {string} selectorId ID of the selected scope
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQuery(
        eventType: GroupEventType,
        selectorType: GroupEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            eventType,
            selectorType,
            selectorId,
        ]);
    }
}
