/**
 * Unit tests for EndpointFactory.setup(): concurrent calls must share one
 * in-flight WASM load, asset-load failures must reject with an actionable
 * message (and allow retry), per-asset URL overrides must be honored, and
 * non-browser environments must fail fast.
 */
import { EndpointFactory } from "../EndpointFactory.js";

type ScriptStub = {
    type?: string;
    src?: string;
    onload?: () => void;
    onerror?: () => void;
    remove: jest.Mock;
};

describe("EndpointFactory.setup", () => {
    let createdScripts: ScriptStub[];

    const installBrowserStubs = () => {
        createdScripts = [];
        (globalThis as Record<string, unknown>).window = {};
        (globalThis as Record<string, unknown>).document = {
            baseURI: "https://app.example/",
            getElementsByTagName: () => [{ appendChild: () => {} }],
            createElement: () => {
                const script: ScriptStub = { remove: jest.fn() };
                createdScripts.push(script);
                return script;
            },
        };
    };

    afterEach(() => {
        delete (globalThis as Record<string, unknown>).window;
        delete (globalThis as Record<string, unknown>).document;
    });

    test("rejects with a browser-environment error outside the browser", async () => {
        await expect(EndpointFactory.setup()).rejects.toThrow(/browser environment/);
    });

    test("concurrent setup() calls share a single in-flight load", async () => {
        installBrowserStubs();
        const first = EndpointFactory.setup("/assets");
        const second = EndpointFactory.setup("/assets");
        // Only one script tag injected even though setup() was called twice.
        expect(createdScripts).toHaveLength(1);
        // Finish the shared load with an error so the test does not need a real WASM module.
        createdScripts[0].onerror?.();
        await expect(first).rejects.toThrow(/failed to load/);
        await expect(second).rejects.toThrow(/failed to load/);
    });

    test("legacy assetsBasePath builds the glue URL from the directory", async () => {
        installBrowserStubs();
        const attempt = EndpointFactory.setup({ assetsBasePath: "/privmx-assets" });
        expect(createdScripts[0].src).toBe(
            "https://app.example/privmx-assets/endpoint-wasm-module.js",
        );
        createdScripts[0].onerror?.();
        await expect(attempt).rejects.toThrow(/failed to load/);
    });

    test("wasmModuleUrl overrides the glue script location", async () => {
        installBrowserStubs();
        const glue = "https://cdn.example/hashed/endpoint-wasm-module.abc123.js";
        const attempt = EndpointFactory.setup({ wasmModuleUrl: glue });
        // The explicit URL is used verbatim, ignoring assetsBasePath defaults.
        expect(createdScripts[0].src).toBe(glue);
        createdScripts[0].onerror?.();
        await expect(attempt).rejects.toThrow(/failed to load/);
    });

    test("asset-load failure rejects with an actionable message and allows retry", async () => {
        installBrowserStubs();
        const attempt = EndpointFactory.setup("/missing");
        createdScripts[0].onerror?.();
        await expect(attempt).rejects.toThrow(/@simplito\/privmx-webendpoint\/assets/);
        expect(createdScripts[0].remove).toHaveBeenCalled();

        // The failed attempt must not poison the next one.
        const retry = EndpointFactory.setup("/missing");
        expect(createdScripts).toHaveLength(2);
        createdScripts[1].onerror?.();
        await expect(retry).rejects.toThrow(/failed to load/);
    });
});
