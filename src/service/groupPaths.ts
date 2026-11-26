/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Where a value lives in your data, as GroupApi takes it: a path of names and
 * identifiers. An envelope is bound to its path; it opens only with the same one.
 */

/**
 * An identifier from your data: a chat ID, a user ID. Made only by {@link id},
 * which spells every identifier one way.
 */
export type Id = Uint8Array & { readonly __brand: "Id" };

/**
 * One segment of a path. A plain string is a **name you write in code**
 * (`"chat"`, `"body"`); anything that comes from data goes through {@link id}.
 * A name and an identifier never collide, even with the same characters.
 */
export type PathSegment = string | Id;

/** A full path in your app's data; the first segment is your app's name. */
export type Location = readonly [app: string, ...segments: PathSegment[]];

/**
 * Passed where a location goes, to write a value that is bound to no spot in
 * your data. Say it only where your own code already binds the value to its
 * record.
 *
 * What you give up: your server can move such an envelope to another record of
 * the same Group, or hand back an older one, and nothing here notices. The
 * author, the epoch and the Group are checked as always.
 *
 * An envelope written with it never opens with a location, and an envelope
 * written with a location never opens with this.
 */
export const NO_LOCATION: unique symbol = Symbol("privmx.group.noLocation");

/** What {@link GroupApi} takes as a location. */
export type LocationOrNone = Location | typeof NO_LOCATION;

/** Passed as `expectedAuthor` when you show the author from the result and from nowhere else. */
export const ANY_AUTHOR: unique symbol = Symbol("privmx.group.anyAuthor");

/** A path segment as the core takes it. @internal */
export interface NativeSegment {
    isId: boolean;
    value: Uint8Array;
}

const UUID_BODY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_HEX = /^[0-9a-f]{32}$/i;

/**
 * The bytes of an identifier, for a path. Spells every identifier one way: a
 * UUID (32 hex digits, 8-4-4-4-12, or that in one pair of braces; any case)
 * becomes its 16 bytes, anything else its bytes as given, each behind a byte
 * that says which it is. Two clients that spell one identifier differently
 * would otherwise bind to two different paths.
 *
 * The same bytes as `GroupApi::idFromString` in the core gives: the two are
 * tested against one set of vectors.
 */
export function id(identifier: string): Id {
    if (typeof identifier !== "string" || identifier.length === 0) {
        throw new TypeError("an identifier is a non-empty string");
    }
    let body = identifier;
    if (body.length === 38 && body.startsWith("{") && body.endsWith("}")) {
        body = body.slice(1, 37);
    }
    const hex = UUID_BODY.test(body)
        ? body.replace(/-/g, "")
        : UUID_HEX.test(body)
          ? body
          : undefined;
    if (hex === undefined) {
        const text = new TextEncoder().encode(identifier);
        const out = new Uint8Array(text.length + 1);
        out[0] = 0x00;
        out.set(text, 1);
        return out as Id;
    }
    const out = new Uint8Array(17);
    out[0] = 0x01;
    for (let i = 0; i < 16; i++) {
        out[i + 1] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out as Id;
}

/** @internal */
export function toNativePath(location: LocationOrNone): NativeSegment[] {
    if (location === NO_LOCATION) {
        // The one path the core reads as "bound to no location": no real path can contain an empty identifier.
        return [{ isId: true, value: new Uint8Array(0) }];
    }
    if (!Array.isArray(location) || location.length === 0) {
        throw new TypeError(
            "a location needs at least one segment; pass NO_LOCATION to bind to none",
        );
    }
    return location.map((segment: PathSegment) => {
        if (typeof segment === "string") {
            if (segment.length === 0) {
                throw new TypeError("a location segment cannot be empty");
            }
            return { isId: false, value: new TextEncoder().encode(segment) };
        }
        if (!(segment instanceof Uint8Array) || segment.length === 0) {
            throw new TypeError(
                "a location segment is a name (a string) or an identifier made by id()",
            );
        }
        return { isId: true, value: segment };
    });
}
