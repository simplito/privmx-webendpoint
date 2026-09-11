/**
 * MIMICKED BACKEND - stands in for your server.
 *
 * WARNING: In a real app this code runs on YOUR backend, because it uses the PrivMX
 * Bridge **management API key**, which can administer your whole Solution and
 * must NEVER reach the browser. This example runs it in the browser only so the
 * demo needs no separate server process - `Member.ts` imports `registerUser()`
 * and calls it directly instead of doing `fetch("/api/register-user")`.
 *
 * The anonymous side of this demo never comes here: sending something needs no
 * account, so it only reads {@link publicEndpoint} - which is what the intake link
 * would carry in a real deployment.
 *
 * What a real backend does (and this mimics):
 *   1. `manager/auth` - exchange the API key for a short-lived Bearer token.
 *   2. `context/addUserToContext` - register a user's PUBLIC key in a Context.
 * The browser generates its own private key and sends only the public key here.
 */

const cfg = {
    bridgeUrl: import.meta.env.VITE_PRIVMX_BRIDGE_URL as string | undefined,
    solutionId: import.meta.env.VITE_PRIVMX_SOLUTION_ID as string | undefined,
    contextId: import.meta.env.VITE_PRIVMX_CONTEXT_ID as string | undefined,
    apiKeyId: import.meta.env.VITE_PRIVMX_API_KEY_ID as string | undefined,
    apiKeySecret: import.meta.env.VITE_PRIVMX_API_KEY_SECRET as string | undefined,
};

/** Non-secret config the client needs to connect (Bridge URL / Solution / Context). */
export interface PublicConfig {
    bridgeUrl: string;
    solutionId: string;
    contextId: string;
}

type ServerConfig = { [K in keyof typeof cfg]: string };

function requireConfig(): ServerConfig {
    const missing = Object.entries(cfg)
        // bridgeUrl is optional: left empty, everything goes to this page's own
        // origin, which the dev server proxies to the Bridge (PRIVMX_BRIDGE_PROXY
        // in vite.config.ts). Set it to reach a Bridge that serves CORS itself.
        .filter(([k, v]) => !v && k !== "bridgeUrl")
        .map(([k]) => `VITE_PRIVMX_${k.replace(/([A-Z])/g, "_$1").toUpperCase()}`);
    if (missing.length) {
        throw new Error(
            `Backend not configured - set ${missing.join(", ")} in .env.local and restart \`npm run dev\`.`,
        );
    }
    return { ...cfg, bridgeUrl: cfg.bridgeUrl || location.origin } as ServerConfig;
}

/**
 * Which Bridge and which Solution to talk to - the non-secret half of an intake
 * link. An anonymous sender needs this plus the Group's ID and public key, and
 * nothing else: no account, no API key, no call to this file's `rpc`.
 */
export function publicEndpoint(): { bridgeUrl: string; solutionId: string } {
    const c = requireConfig();
    return { bridgeUrl: c.bridgeUrl, solutionId: c.solutionId };
}

let rpcId = 1;
async function rpc(apiUrl: string, method: string, params: unknown, accessToken?: string) {
    const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
    });
    // A Bridge that is down answers with an HTML error page, and the parse error
    // from that ("Unexpected token '<'") says nothing about what went wrong.
    const json = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    if (json.error) {
        throw new Error(`Bridge ${method} failed: ${json.error.message ?? JSON.stringify(json.error)}`);
    }
    return json.result;
}

/**
 * Registers a runtime-generated public key under `userId` in the Context,
 * granting that user access. Returns the (non-secret) config the client needs to
 * connect.
 */
export async function registerUser(user: { userId: string; pubKey: string }): Promise<PublicConfig> {
    if (!user.userId || !user.pubKey) throw new Error("userId and pubKey are required");
    const c = requireConfig();
    const apiUrl = c.bridgeUrl.replace(/\/+$/, "") + "/api";

    const auth = await rpc(apiUrl, "manager/auth", {
        grantType: "api_key_credentials",
        apiKeyId: c.apiKeyId,
        apiKeySecret: c.apiKeySecret,
        scope: ["solution", "context"],
    });
    await rpc(
        apiUrl,
        "context/addUserToContext",
        { contextId: c.contextId, userId: user.userId, userPubKey: user.pubKey },
        auth.accessToken,
    );

    return { bridgeUrl: c.bridgeUrl, solutionId: c.solutionId, contextId: c.contextId };
}
