/**
 * Type-checks every TypeScript sample in the README against the real SDK types.
 *
 * The README is the first thing anyone runs, and its samples rot in a way no
 * other test notices: a renamed method, a changed argument order or a type that
 * never existed still reads fine to a human. This compiles each fenced `ts`
 * block as its own module, with the SDK imported for real and only the sample's
 * own placeholders (`myBucket`, `setPct`, a `contextId`) declared for it.
 *
 * A block that needs something outside that list fails here, which is the point:
 * either the sample is wrong, or it leans on a name the reader has no way to
 * know about.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");

/**
 * What a sample may lean on without declaring it: the values the surrounding
 * prose hands the reader, and the reader's own app. Typed for real wherever the
 * SDK has a type, so a sample is checked against actual signatures rather than
 * against `any`.
 */
const PLACEHOLDERS: Record<string, string> = {
    // identity and scope, from "Before you start"
    privateKey: "string",
    solutionId: "string",
    bridgeUrl: "string",
    contextId: "string",
    userId: "string",
    connection: "__Connection",
    me: "__Types.UserWithPubKey",
    alice: "__Types.UserWithPubKey",
    bob: "__Types.UserWithPubKey",
    danaPubKey: "string",
    erinPubKey: "string",
    // APIs and values earlier blocks produce
    conn: "__Connection",
    groups: "__GroupApi",
    threads: "__ThreadApi",
    store: "__StoreApi",
    streams: "__StreamApi",
    search: "__SearchApi",
    guestGroups: "__GroupApi",
    group: "__Types.Group",
    grant: "__Types.GroupGrantWithKey",
    thread: "__Types.Thread",
    groupId: "string",
    groupPubKey: "string",
    threadId: "string",
    storeId: "string",
    roomId: "string",
    indexId: "string",
    messageId: "string",
    handle: "number",
    envelope: "Uint8Array",
    ciphertext: "ReadableStream<Uint8Array>",
    publicMeta: "Uint8Array",
    privateMeta: "Uint8Array",
    batch: "{ id: string; text: string }[]",
    file: "File",
    key: "string",
    signal: "AbortSignal",
    // the reader's own code, which the SDK knows nothing about
    myBucket: "any",
    setPct: "(fraction: number) => void",
    onProgress: "(sent: number) => void",
    showTyping: "(author: string, payload: any) => void",
    handleDataChannelBytes: "(bytes: Uint8Array) => void",
    attachToVideoElement: "(track: MediaStreamTrack) => void",
    myLogger: "{ log: (...args: unknown[]) => void }",
    storeApi: "__StoreApi",
    threadApi: "__ThreadApi",
};

// Aliased, so a sample can import the same names as values without clashing.
const PRELUDE_IMPORT =
    "import type {\n" +
    "    Connection as __Connection,\n" +
    "    GroupApi as __GroupApi,\n" +
    "    ThreadApi as __ThreadApi,\n" +
    "    StoreApi as __StoreApi,\n" +
    "    StreamApi as __StreamApi,\n" +
    "    SearchApi as __SearchApi,\n" +
    "    Types as __Types,\n" +
    '} from "@simplito/privmx-webendpoint";\n';

/** Names the sample declares itself, which the prelude must then leave alone. */
function declaredIn(code: string): Set<string> {
    const names = new Set<string>();
    for (const m of code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
    }
    for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}/g)) {
        for (const part of m[1].split(",")) {
            const name = part
                .trim()
                .split(/\s+as\s+/)
                .pop()
                ?.trim();
            if (name) names.add(name);
        }
    }
    for (const m of code.matchAll(/\bconst\s*\{([^}]*)\}\s*=/g)) {
        for (const part of m[1].split(",")) {
            const name = part.trim().split(":").pop()?.trim();
            if (name) names.add(name);
        }
    }
    return names;
}

function preludeFor(code: string): string {
    const own = declaredIn(code);
    const lines = Object.entries(PLACEHOLDERS)
        .filter(([name]) => !own.has(name))
        .map(([name, type]) => `declare const ${name}: ${type};`);
    return PRELUDE_IMPORT + lines.join("\n");
}

interface Sample {
    /** 1-based line of the opening fence, so a failure points at the README. */
    line: number;
    code: string;
}

function extractSamples(markdown: string): Sample[] {
    const lines = markdown.split("\n");
    const samples: Sample[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== "```ts") continue;
        const start = i;
        const body: string[] = [];
        for (i++; i < lines.length && lines[i].trim() !== "```"; i++) body.push(lines[i]);
        samples.push({ line: start + 1, code: body.join("\n") });
    }
    return samples;
}

const samples = extractSamples(readme);

/** Compiles all samples in one program: one pass, errors attributed per file. */
function checkAll(all: Sample[]): Map<string, string[]> {
    const files = new Map<string, string>();
    for (const sample of all) {
        // Each block is its own module: it keeps its own imports, and top-level
        // await is legal there.
        files.set(
            `readme-${sample.line}.ts`,
            `${preludeFor(sample.code)}\nexport {};\n${sample.code}\n`,
        );
    }

    const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
        types: [],
        baseUrl: repoRoot,
        // The samples import the package by name, the way a reader would. Point
        // that name at the sources in this repo so they check against what is
        // about to ship, not against whatever is installed.
        paths: {
            "@simplito/privmx-webendpoint": [resolve(repoRoot, "src/index.ts")],
            "@simplito/privmx-webendpoint/extra": [resolve(repoRoot, "src/extra/index.ts")],
        },
    };

    const host = ts.createCompilerHost(options, true);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    host.readFile = (name) => files.get(name.split("/").pop() ?? "") ?? readFile(name);
    host.fileExists = (name) => files.has(name.split("/").pop() ?? "") || fileExists(name);

    const program = ts.createProgram([...files.keys()], options, host);
    const byFile = new Map<string, string[]>();
    for (const d of ts.getPreEmitDiagnostics(program)) {
        const name = d.file?.fileName.split("/").pop() ?? "";
        if (!files.has(name)) continue; // diagnostics from the SDK sources itself
        const message = ts.flattenDiagnosticMessageText(d.messageText, " ");
        const where =
            d.file && d.start !== undefined
                ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
                : 0;
        byFile.set(name, [...(byFile.get(name) ?? []), `line ${where}: ${message}`]);
    }
    return byFile;
}

const failures = checkAll(samples);

describe("README samples", () => {
    test("the README has samples to check", () => {
        expect(samples.length).toBeGreaterThan(20);
    });

    for (const sample of samples) {
        const name = `README.md:${sample.line} type-checks`;
        test(name, () => {
            const errors = failures.get(`readme-${sample.line}.ts`) ?? [];
            expect(errors).toEqual([]);
        });
    }
});
