/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

export function assertIsString(value: unknown): asserts value is string {
    if (typeof value !== "string") throw new Error("Not a string");
}

export function assertIsArrayBuffer(value: unknown): asserts value is ArrayBuffer {
    if (!(value instanceof ArrayBuffer)) throw new Error("Not a ArrayBuffer");
}

export function assertIsUint8Array(value: unknown): asserts value is ArrayBuffer {
    if (!(value instanceof Uint8Array) && !(value instanceof Int8Array)) throw new Error("Not Uint8Array or Int8Array");
}

export function assertIsNumber(value: unknown): asserts value is number {
    if (typeof value !== "number") throw new Error("Not a number");
}

export function assertArgsValid<T>(obj: any, argsType: { new(...args: any[]): T }) {
    const objKeys = Object.keys(obj);
    const expected = Object.keys(new argsType());
    if (!(objKeys.length === expected.length && objKeys.every(x => expected.includes(x)))) {
        throw new Error("Invalid arguments list\nexpected: " + JSON.stringify(expected) + "\nactual: " + JSON.stringify(objKeys));
    }
}

export function assertArgsAndValueValid<T>(actualObj: T, defaultObj: { new(...args: any[]): T}) {
    const objKeys = Object.keys(actualObj);
    const expected = Object.keys(new defaultObj());
    if (!(objKeys.length === expected.length && objKeys.every(x => expected.includes(x)))) {
        throw new Error("Invalid arguments list\nexpected: " + JSON.stringify(expected) + "\nactual: " + JSON.stringify(objKeys));
    }
    const defaultInstance = new defaultObj();
    for (const p of objKeys) {
        const actualValue = actualObj[p as keyof typeof actualObj];
        const defaultValue = defaultInstance[p as keyof typeof actualObj];
        if (actualValue == defaultValue) {
            throw new Error(`Invalid argument value of ${defaultObj.name}.${p}: ${(<any>defaultInstance)[p]}`);
        }
    }
}