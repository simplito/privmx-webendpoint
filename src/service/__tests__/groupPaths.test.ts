/**
 * Paths and identifiers, as GroupApi hands them to the core. The identifier
 * vectors are the ones the core's own test uses (GroupApiPaths.AnIdentifierIsSpelledOneWay):
 * `id()` here and `GroupApi::idFromString` there have to give the same bytes,
 * or a web client and a native client would bind the same record to two paths.
 */

import { describe, expect, it } from "vitest";
import { id, NO_LOCATION, toNativePath } from "../groupPaths.js";

const UUID_BYTES = [
    0x6f, 0x96, 0x19, 0xff, 0x8b, 0x86, 0xd0, 0x11, 0xb4, 0x2d, 0x00, 0xc0, 0x4f, 0xc9, 0x64, 0xff,
];
const canonical = Array.from(id("6f9619ff-8b86-d011-b42d-00c04fc964ff"));

describe("id()", () => {
    it("turns a UUID into a tag byte and its 16 bytes", () => {
        expect(canonical).toEqual([0x01, ...UUID_BYTES]);
    });

    it("spells a UUID one way, whatever its case, dashes or braces", () => {
        expect(Array.from(id("6F9619FF-8B86-D011-B42D-00C04FC964FF"))).toEqual(canonical);
        expect(Array.from(id("6f9619ff8b86d011b42d00c04fc964ff"))).toEqual(canonical);
        expect(Array.from(id("{6F9619FF-8B86-D011-B42D-00C04FC964FF}"))).toEqual(canonical);
    });

    it("leaves anything else as its own bytes, behind another tag", () => {
        expect(Array.from(id("Chat-42"))).toEqual([0x00, ...new TextEncoder().encode("Chat-42")]);
        expect(Array.from(id("chat-42"))).not.toEqual(Array.from(id("Chat-42")));
        expect(Array.from(id("zażółć"))).toEqual([0x00, ...new TextEncoder().encode("zażółć")]);
    });

    it("SECURITY: only the exact UUID forms are a UUID", () => {
        expect(Array.from(id("6f96-19ff8b86d011b42d00c04fc964ff"))).not.toEqual(canonical);
        expect(Array.from(id("{6f9619ff8b86d011b42d00c04fc964ff"))).not.toEqual(canonical);
        expect(Array.from(id("6f9619ff-8b86-d011-b42d-00c04fc964f"))).not.toEqual(canonical);
        expect(Array.from(id("6f9619ff-8b86-d011-b42d-00c04fc964ff "))).not.toEqual(canonical);
    });

    it("SECURITY: an identifier whose text is a UUID's bytes is not that UUID", () => {
        const asText = String.fromCharCode(...UUID_BYTES);
        expect(Array.from(id(asText))).not.toEqual(canonical);
        expect(id(asText)[0]).toBe(0x00);
    });

    it("refuses an empty identifier, and anything that is not a string", () => {
        expect(() => id("")).toThrow(TypeError);
        expect(() => id(undefined as unknown as string)).toThrow(TypeError);
        expect(() => id(42 as unknown as string)).toThrow(TypeError);
    });
});

describe("toNativePath()", () => {
    it("marks names and identifiers apart", () => {
        const chatId = id("c1");
        expect(toNativePath(["chat", chatId, "body"])).toEqual([
            { isId: false, value: new TextEncoder().encode("chat") },
            { isId: true, value: chatId },
            { isId: false, value: new TextEncoder().encode("body") },
        ]);
    });

    it("SECURITY: a name is never an identifier with the same characters", () => {
        const asName = toNativePath(["chat", "c1"]);
        const asId = toNativePath(["chat", id("c1")]);
        expect(asName[1].isId).toBe(false);
        expect(asId[1].isId).toBe(true);
        expect(Array.from(asName[1].value)).not.toEqual(Array.from(asId[1].value));
    });

    it("NO_LOCATION is the one path the core reads as bound to nothing", () => {
        expect(toNativePath(NO_LOCATION)).toEqual([{ isId: true, value: new Uint8Array(0) }]);
    });

    it("a location has to be said: an empty path is not NO_LOCATION", () => {
        expect(() => toNativePath([] as unknown as ["app"])).toThrow(TypeError);
        expect(() => toNativePath(undefined as unknown as ["app"])).toThrow(TypeError);
        expect(() => toNativePath(["chat", ""])).toThrow(TypeError);
    });

    it("SECURITY: no real path can be taken for NO_LOCATION", () => {
        // An empty identifier is what stands for "no location"; a caller cannot build one by hand.
        expect(() => toNativePath(["chat", new Uint8Array(0) as never])).toThrow(TypeError);
        expect(() => toNativePath([new Uint8Array(0) as never] as unknown as ["app"])).toThrow(
            TypeError,
        );
        expect(() => toNativePath(["chat", 42 as never])).toThrow(TypeError);
    });
});
