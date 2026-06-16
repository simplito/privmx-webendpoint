/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EndpointFactory as Endpoint } from "./service/EndpointFactory.js";
/**
 * @internal Vite bundle entry point — exposes {@link EndpointFactory} as the Endpoint
 * global in dist builds. Import from the package root instead.
 */
export { Endpoint };
