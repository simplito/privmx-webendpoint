import { deserializeObject, serializeObject, strToUint8, uint8ToStr } from '../utils';

describe('Serialization Helpers', () => {
    test('serializeObject should correctly serialize objects', () => {
        const obj = { key: 'value', num: 42 };
        const result = serializeObject(obj);
        expect(result).toBeInstanceOf(Uint8Array);
        expect(uint8ToStr(result)).toBe(JSON.stringify(obj));
    });

    test('serializeObject should throw an error for invalid inputs', () => {
        expect(() => serializeObject(null as unknown as Record<string, any>)).toThrow(TypeError);
        expect(() => serializeObject('string' as unknown as Record<string, any>)).toThrow(
            TypeError
        );
    });

    test('deserializeObject should correctly deserialize Uint8Array', () => {
        const obj = { key: 'value', num: 42 };
        const serialized = strToUint8(JSON.stringify(obj));
        const result = deserializeObject(serialized);
        expect(result).toEqual(obj);
    });

    test('deserializeObject should handle empty input gracefully', () => {
        const empty = new Uint8Array();
        const result = deserializeObject(empty);
        expect(result).toEqual({});
    });

    test('deserializeObject should throw an error for invalid inputs', () => {
        expect(() => deserializeObject(null as unknown as Uint8Array)).toThrow(TypeError);
        expect(() => deserializeObject('string' as unknown as Uint8Array)).toThrow(TypeError);
        const invalidJson = strToUint8('{ key: value }');
        expect(() => deserializeObject(invalidJson)).toThrow(SyntaxError);
    });

    test('uint8ToStr should correctly convert Uint8Array to string', () => {
        const str = 'Hello, world!';
        const arr = strToUint8(str);
        const result = uint8ToStr(arr);
        expect(result).toBe(str);
    });

    test('uint8ToStr should throw an error for invalid inputs', () => {
        expect(() => uint8ToStr(null as unknown as Uint8Array)).toThrow(TypeError);
        expect(() => uint8ToStr('string' as unknown as Uint8Array)).toThrow(TypeError);
    });

    test('strToUint8 should correctly convert string to Uint8Array', () => {
        const str = 'Hello, world!';
        const result = strToUint8(str);
        expect(result).toBeInstanceOf(Uint8Array);
        expect(uint8ToStr(result)).toBe(str);
    });

    test('strToUint8 should throw an error for invalid inputs', () => {
        expect(() => strToUint8(null as unknown as string)).toThrow(TypeError);
        expect(() => strToUint8(42 as unknown as string)).toThrow(TypeError);
    });
});
