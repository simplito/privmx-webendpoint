/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EmCrypto } from "./crypto/EmCrypto";
export  {EmCrypto};

(self as any).em_crypto = new EmCrypto();
