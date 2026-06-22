/**
 * Guards against drift between the embind exports declared in
 * webendpoint-cpp/src/Bindings.cpp and the hand-written TypeScript wrappers in
 * src/native/. The TS layer calls `this.api.lib.<Service>_<method>(…)` - a
 * call to a binding that no longer exists surfaces only at runtime as
 * "lib.X is not a function", so this test fails the build instead.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const BINDINGS_CPP = join(ROOT, "webendpoint-cpp", "src", "Bindings.cpp");
const NATIVE_DIR = join(ROOT, "src", "native");

function cppExportedNames(): Set<string> {
    const source = readFileSync(BINDINGS_CPP, "utf8");
    const names = new Set<string>();
    // BINDING_FUNCTION(Service, method) exports "Service_method".
    for (const m of source.matchAll(/^\s*BINDING_FUNCTION\((\w+),\s*(\w+)\)/gm)) {
        names.add(`${m[1]}_${m[2]}`);
    }
    // BINDING_FUNCTION_MIN(name) exports "name".
    for (const m of source.matchAll(/^\s*BINDING_FUNCTION_MIN\((\w+)\)/gm)) {
        names.add(m[1]);
    }
    return names;
}

function tsCalledNames(): Map<string, string[]> {
    const calls = new Map<string, string[]>();
    for (const file of readdirSync(NATIVE_DIR)) {
        if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
        const source = readFileSync(join(NATIVE_DIR, file), "utf8");
        for (const m of source.matchAll(/\bapi\.lib\.(\w+)\s*\(/g)) {
            const sites = calls.get(m[1]) ?? [];
            sites.push(file);
            calls.set(m[1], sites);
        }
        // Api.ts itself uses `this.lib.<name>(...)`.
        for (const m of source.matchAll(/\bthis\.lib\.(\w+)\s*\(/g)) {
            const sites = calls.get(m[1]) ?? [];
            sites.push(file);
            calls.set(m[1], sites);
        }
    }
    return calls;
}

describe("WASM bindings ↔ TypeScript wrappers", () => {
    const exported = cppExportedNames();
    const called = tsCalledNames();

    test("Bindings.cpp parses into a plausible export list", () => {
        // 169 bindings existed when this test was written; tolerate growth,
        // fail loudly if the parse silently breaks.
        expect(exported.size).toBeGreaterThan(150);
    });

    test("every binding called from src/native exists in Bindings.cpp", () => {
        const missing = [...called.entries()]
            .filter(([name]) => !exported.has(name))
            .map(([name, files]) => `${name} (called from ${[...new Set(files)].join(", ")})`);
        expect(missing).toEqual([]);
    });

    test("report: bindings never called from TypeScript (informational)", () => {
        const unused = [...exported].filter((name) => !called.has(name));
        // Not a failure - some bindings are reached via the worker or glue -
        // but a sudden jump signals dead C++ surface worth pruning (issues/10).
        // eslint-disable-next-line no-console
        console.info(
            `bindings not referenced from src/native: ${unused.length}`,
            unused.slice(0, 200),
        );
        expect(unused.length).toBeLessThan(exported.size);
    });
});
