/**
 * Helper function to convert objects to Uint8Array
 * @param {Record<string, any>} object - The object to serialize
 * @returns {Uint8Array} object serialized to `Uint8Array`
 */
export function serializeObject(object: Record<string, any>): Uint8Array {
    if (object === null || typeof object !== 'object') {
        throw new TypeError('Input must be a non-null object.');
    }

    const encoder = new TextEncoder();
    const parsed = JSON.stringify(object);
    return encoder.encode(parsed);
}

/**
 * Helper function to convert Uint8Array to objects
 * @param {Uint8Array} data - The data to deserialize
 * @returns {Record<string, any>} parsed JSON object
 */
export function deserializeObject(data: Uint8Array): Record<string, any> {
    if (!(data instanceof Uint8Array)) {
        throw new TypeError('Input must be a Uint8Array.');
    }

    const decoder = new TextDecoder();
    const decodedData = decoder.decode(data);

    if (decodedData.trim() === '') {
        return {};
    }

    try {
        return JSON.parse(decodedData);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new SyntaxError('Failed to parse JSON: ' + error.message);
        } else {
            throw new Error('An unexpected error occurred: ' + String(error));
        }
    }
}

/**
 * Convert Uint8Array to a string
 * @param {Uint8Array} arr - The array to convert
 * @returns {string} The resulting string
 */
export function uint8ToStr(arr: Uint8Array): string {
    if (!(arr instanceof Uint8Array)) {
        throw new TypeError('Input must be a Uint8Array.');
    }

    return new TextDecoder().decode(arr);
}

/**
 * Convert a string to Uint8Array
 * @param {string} text - The text to convert
 * @returns {Uint8Array} The resulting Uint8Array
 */
export function strToUint8(text: string): Uint8Array {
    if (typeof text !== 'string') {
        throw new TypeError('Input must be a string.');
    }

    return new TextEncoder().encode(text);
}
