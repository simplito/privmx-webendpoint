/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { IdGenerator } from "./IdGenerator";

interface Result {
    taskId: number;
    status: boolean;
    result: any;
    error: any;
}

export class Api {
    private promises: Map<number,any>;
    private taskIdGenerator: IdGenerator;

    constructor(public lib: any){
        this.taskIdGenerator = new IdGenerator();
        this.promises = new Map<number,any>();
        this.setResultsCallback();
    }

    async runAsync<T>(func: (taskId: number) => void): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const taskId = this.generateId();
            this.promises.set(taskId, {resolve, reject});
            func(taskId);
        });
    }

    private resolveResult(result: Result) {
        if (result.status == true) {
            this.promises.get(result.taskId).resolve(result.result);
        } else {
            this.promises.get(result.taskId).reject(result.error);
        }
        this.promises.delete(result.taskId);
    }

    private generateId() {
        return this.taskIdGenerator.generateId();
    }

    private setResultsCallback() {
        this.lib.setResultsCallback((result: any)=>this.resolveResult(result));
    }
}
