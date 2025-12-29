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

    private isPending: boolean = false;
    constructor(private native: EventQueueNative, ptr: number) {
        super(ptr);
    }

    async waitEvent(): Promise<Event> {
        if (this.isPending) {
            throw ("WaitEvent() is already in a pending state waiting for new events");
        }
        try {
            return await this.native.waitEvent(this.servicePtr, []);
        }
        finally {
            this.isPending = false;
        }
    }

    async emitBreakEvent(): Promise<void> {
        return this.native.emitBreakEvent(this.servicePtr, []);
    }
}
