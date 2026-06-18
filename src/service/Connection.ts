/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { ConnectionNative } from "../native/ConnectionNative.js";
import {
    PagingQuery,
    PagingList,
    Context,
    UserInfo,
    ConnectionEventType,
    ConnectionEventSelectorType,
} from "../Types.js";
import { BaseNative } from "../native/BaseNative.js";
import { UserVerifierInterface } from "./UserVerifierInterface.js";

/**
 * An authenticated session with a PrivMX Bridge server. All other APIs
 * (ThreadApi, StoreApi, InboxApi, …) operate within a Connection and share its
 * lifetime.
 *
 * Obtain an instance via {@link EndpointFactory.connect} (full, key-based
 * session) or {@link EndpointFactory.connectPublic} (guest session for sending
 * Inbox entries) — do not construct it directly.
 *
 * ## Workflow
 * {@link EndpointFactory.setup} → {@link EndpointFactory.connect} →
 * `EndpointFactory.createThreadApi(connection)` / `createStoreApi` / … →
 * application work → {@link disconnect}.
 *
 * {@link disconnect} invalidates every API created from this connection: any
 * later call on them throws an `Error`. All methods of this class also reject
 * with `NativeError` on server or protocol failures.
 */
export class Connection extends BaseApi {
    private apisRefs: { [apiId: string]: { _apiServicePtr: number } } = {};
    private nativeApisDeps: { [apiId: string]: BaseNative } = {};
    private jsApiInstances: { [apiId: string]: BaseApi } = {};

    /**
     * Used by the IoC factories to register a freshly built API's
     * native pointer for teardown on disconnect — not part of the public API.
     * //doc-gen:ignore
     * @internal
     */
    registerApi(id: string, ptr: number, native: BaseNative, jsApi?: BaseApi): void {
        this.apisRefs[id] = { _apiServicePtr: ptr };
        this.nativeApisDeps[id] = native;
        if (jsApi) this.jsApiInstances[id] = jsApi;
    }

    /**
     * Guards against double-registering an API on one connection — not
     * part of the public API.
     * //doc-gen:ignore
     * @internal
     */
    hasApi(id: string): boolean {
        return id in this.apisRefs;
    }

    /**
     * Created by {@link EndpointFactory.connect} /
     * {@link EndpointFactory.connectPublic} — never constructed by SDK users.
     * @internal
     */
    constructor(
        private native: ConnectionNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Returns the numeric identifier of this connection inside the WASM core.
     *
     * The ID is assigned locally when the connection is established — no server
     * round-trip happens here.
     *
     * Use it to correlate connection-scoped events (`Event.connectionId`) with
     * the connection that produced them when the application holds several
     * connections at once.
     *
     * @returns {number} connection ID matching the `connectionId` field of
     *   events delivered through {@link EventQueue.waitEvent}
     */
    async getConnectionId(): Promise<number> {
        return this.native.getConnectionId(this.servicePtr, []);
    }

    /**
     * Lists the Contexts (application workspaces created in the PrivMX Bridge
     * admin panel) that the connected user is a member of.
     *
     * Fetches the list from the Bridge; Context metadata is server-side
     * administrative data, so no decryption is involved.
     *
     * A Context ID is the entry point for all content APIs — e.g.
     * `ThreadApi.createThread(contextId, …)` or `StoreApi.listStores(contextId, …)` —
     * so this is typically one of the first calls after {@link EndpointFactory.connect}.
     *
     * @param {PagingQuery} pagingQuery pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     *   or `lastId`
     * @returns {PagingList<Context>} one page of Contexts plus `totalAvailable`;
     *   use `Context.contextId` in subsequent API calls
     */
    async listContexts(pagingQuery: PagingQuery): Promise<PagingList<Context>> {
        return this.native.listContexts(this.servicePtr, [pagingQuery]);
    }

    /**
     * Lists the users registered in the given Context together with their
     * public keys.
     *
     * Fetches the membership list from the Bridge — user IDs and public keys
     * are not secret, the server stores them in plaintext.
     *
     * Use it to build the `users`/`managers` arrays (`UserWithPubKey[]`)
     * required when creating or updating containers such as Threads, Stores,
     * Inboxes and KVDBs.
     *
     * @param {string} contextId Context to enumerate, from
     *   `Context.contextId` returned by {@link listContexts}
     * @param {PagingQuery} pagingQuery pagination and sorting of the user list
     * @returns {PagingList<UserInfo>} one page of users; each entry carries
     *   `user.userId` and `user.pubKey` ready to be used in container ACLs
     */
    async listContextUsers(
        contextId: string,
        pagingQuery: PagingQuery,
    ): Promise<PagingList<UserInfo>> {
        return this.native.listContextUsers(this.servicePtr, [contextId, pagingQuery]);
    }

    /**
     * Subscribes this connection to Context-level events matching the given
     * subscription queries.
     *
     * Registers the subscriptions on the Bridge over the connection's event
     * channel; matching events are then pushed by the server and surface
     * through {@link EventQueue.waitEvent}.
     *
     * Required order: {@link buildSubscriptionQuery} (one query per
     * event-type/selector pair) → `subscribeFor(queries)` → consume events from
     * the {@link EventQueue} → {@link unsubscribeFrom} when no longer needed.
     *
     * @param {string[]} subscriptionQueries query strings produced by
     *   {@link buildSubscriptionQuery}; hand-written strings are not supported
     * @returns {string[]} subscription IDs, index-aligned with
     *   `subscriptionQueries` — keep them to {@link unsubscribeFrom} later
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Cancels event subscriptions previously created on this connection, so
     * the server stops pushing the matching events.
     *
     * Subscriptions also end implicitly with {@link disconnect}; call this only
     * to stop receiving a subset of events while keeping the connection alive.
     *
     * @param {string[]} subscriptionIds IDs returned by {@link subscribeFor};
     *   unknown IDs cause a `NativeError` rejection
     * @returns {Promise<void>} resolves when all listed subscriptions have been cancelled
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
        return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Builds a subscription-query string describing one class of Context
     * events (e.g. "all custom Context events in Context X").
     *
     * The query is assembled locally by the WASM core in the server's expected
     * format — nothing is sent yet; pass the result to {@link subscribeFor} to
     * activate it.
     *
     * @param {ConnectionEventType} eventType which Context event class to listen for
     * @param {ConnectionEventSelectorType} selectorType what `selectorId` refers to
     *   (e.g. a whole Context), narrowing the event scope
     * @param {string} selectorId ID of the selected scope — for a Context
     *   selector this is `Context.contextId` from {@link listContexts}
     * @returns {string} query string consumed by {@link subscribeFor}
     */
    async buildSubscriptionQuery(
        eventType: ConnectionEventType,
        selectorType: ConnectionEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            eventType,
            selectorType,
            selectorId,
        ]);
    }

    /**
     * Closes the session with the Bridge and releases all native resources of
     * this connection.
     *
     * Closes the server session, then invalidates and deletes every API
     * instance created from this connection (ThreadApi, StoreApi, …, including
     * WebRTC stream sessions and the E2EE worker of StreamApi) inside the WASM
     * module — equivalent C++ objects are freed, so no manual per-API cleanup
     * is needed.
     *
     * Call once when the user logs out or the application shuts down. This is
     * the last step of the connection workflow; afterwards any method on this
     * connection or its APIs throws an `Error`, and a fresh
     * {@link EndpointFactory.connect} is required to continue.
     */
    async disconnect(): Promise<void> {
        await this.native.disconnect(this.servicePtr, []);
        await this.freeApis();
        await this.native.deleteConnection(this.servicePtr);
    }

    /**
     * Installs an application-defined callback used to verify the authors of
     * received data against an external source of truth.
     *
     * Whenever the WASM core decrypts container data (messages, files,
     * entries…), it batches the senders' `userId`/`pubKey` pairs and invokes
     * your {@link UserVerifierInterface.verify} implementation; entries voted
     * `false` are reported as unverified to the caller.
     *
     * Use it to defend against a malicious or compromised Bridge server
     * substituting public keys — verify the key↔user binding in your
     * application server or a PKI. Set it right after
     * {@link EndpointFactory.connect}, before reading any container data.
     *
     * @param {UserVerifierInterface} verifier object whose `verify(request)`
     *   resolves to one boolean per request item (`true` = sender authentic)
     * @returns {Promise<void>} resolves when the verifier has been registered with the WASM core
     */
    setUserVerifier(verifier: UserVerifierInterface): Promise<void> {
        return this.native.setUserVerifier(this.servicePtr, [this.servicePtr, verifier]);
    }

    private async freeApis() {
        for (const apiId in this.apisRefs) {
            this.jsApiInstances[apiId]?.destroyRefs();
            if (this.nativeApisDeps[apiId]) {
                await this.nativeApisDeps[apiId].deleteApi(this.apisRefs[apiId]._apiServicePtr);
            }
        }
    }
}
