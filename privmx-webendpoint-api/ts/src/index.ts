/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EndpointFactory } from "./service/EndpointFactory";
import { EventQueue } from "./service";
import  * as Types from "./Types";

export {EndpointFactory as Endpoint, Types, EventQueue};