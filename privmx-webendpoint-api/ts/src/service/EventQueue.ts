/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from './BaseApi'
import { EventQueueNative } from '../api/EventQueueNative';
import { Event } from '../Types';

export class EventQueue extends BaseApi {

    private deferedPromise: Promise<Event>;
    constructor(private native: EventQueueNative, ptr: number) {
        super(ptr);
    }

    async waitEvent(): Promise<Event> {
        if (!this.deferedPromise) {
            this.deferedPromise = this.native.waitEvent(this.servicePtr, [])
            this.deferedPromise.finally(() => this.deferedPromise = null);
        }
        return this.deferedPromise;
    }

    async emitBreakEvent(): Promise<void> {
        return this.native.emitBreakEvent(this.servicePtr, []);
    }
}
