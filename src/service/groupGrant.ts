/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import type { Group, GroupGrantWithKey, GroupSummary } from "../Types.js";

/**
 * Builds the grant that gives a Group access to a container.
 *
 * Every `create*` and `update*` call takes a list of these, and every one of
 * them is the same four fields copied off a Group you already have. Use this
 * when you hold the {@link Group}; use `GroupApi.grantFor` when you only have
 * its id.
 *
 * @param {Group | GroupSummary} group the Group, from `GroupApi.getGroup` or
 *   `GroupApi.listGroups`
 * @param {"user" | "manager"} role what the Group may do in the container:
 *   read and write as a user, or also change the container as a manager
 * @returns {GroupGrantWithKey} the grant to pass in a container's `groups` list
 * @example
 * const group = await groups.getGroup(groupId);
 * await threads.createThread(
 *     contextId, [me], [me], publicMeta, privateMeta, undefined,
 *     [groupGrant(group, "user")],
 * );
 */
export function groupGrant(
    group: Group | GroupSummary,
    role: "user" | "manager",
): GroupGrantWithKey {
    return {
        groupId: group.groupId,
        role,
        groupPubKey: group.groupPubKey,
        groupEpoch: group.keyVersion,
    };
}
