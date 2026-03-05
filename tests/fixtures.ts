import { test as base, BrowserContext, Page } from "@playwright/test";
import { execSync } from "child_process";
import { MongoClient, Db } from "mongodb";
import * as path from "path";
import * as fs from "fs";
import { testData } from "./datasets/testData";

const COMPOSE_NETWORK = "tests_default";
const COMPOSE_PROJECT = "tests";

// --- Types ---

type WorkerBackend = {
    hostPort: number;
    containerName: string;
    mongoUrl: string;
    db: Db;
    mongoClient: MongoClient;
    dockerImage: string;
    envVars: string;
};

type BackendContext = {
    bridgeUrl: string;
    mongoConnectionString: string;
    dbName: string;
};

export type CliContext = {
    call: (method: string, params: object) => Promise<any>;
};

export type WorkerOptions = {
    dockerImage: string;
};

// --- Helpers ---

async function loadDataset(db: Db, basePath: string, dataSetName: string) {
    const fullPath = path.join(basePath, dataSetName);
    if (!fs.existsSync(fullPath)) return;

    const files = fs.readdirSync(fullPath);
    for (const file of files) {
        if (path.extname(file) !== ".json") continue;
        const collectionName = path.basename(file, ".json");
        const filePath = path.join(fullPath, file);
        try {
            const docs = JSON.parse(fs.readFileSync(filePath, "utf8"));
            if (Array.isArray(docs) && docs.length > 0) {
                await db.collection(collectionName).insertMany(docs);
            }
        } catch (e) {
            console.error(`Failed to load ${file}:`, e);
        }
    }
}

async function waitForServerReady(port: number, containerName: string) {
    const url = `http://localhost:${port}/privmx-configuration.json`;
    const deadline = Date.now() + 30000;

    while (Date.now() < deadline) {
        try {
            const isRunning = execSync(`docker inspect -f '{{.State.Running}}' ${containerName}`)
                .toString()
                .trim();
            if (isRunning !== "true") {
                printContainerLogs(containerName);
                throw new Error(`Container ${containerName} stopped unexpectedly.`);
            }
        } catch (e) {
            /* ignore startup errors */
        }

        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch {}

        await new Promise((r) => setTimeout(r, 200));
    }
    printContainerLogs(containerName);
    throw new Error(`Server failed to start on port ${port} within 30s`);
}

function printContainerLogs(containerName: string) {
    try {
        console.log(`\n--- LOGS FOR ${containerName} ---`);
        const logs = execSync(`docker logs --tail 20 ${containerName}`).toString();
        console.log(logs);
        console.log(`--- END LOGS ---\n`);
    } catch (e) {}
}

async function applyCorsProtection(target: Page | BrowserContext) {
    await target.route("**/*", async (route) => {
        try {
            const request = route.request();
            const requestOrigin =
                (await request.headerValue("origin").catch(() => null)) || "http://localhost:8080";

            const corsHeaders = {
                "Cross-Origin-Opener-Policy": "same-origin",
                "Cross-Origin-Embedder-Policy": "require-corp",
                "Access-Control-Allow-Origin": requestOrigin,
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Credentials": "true",
            };

            if (request.method() === "OPTIONS") {
                await route.fulfill({ status: 200, headers: corsHeaders });
                return;
            }

            const response = await route.fetch();
            await route.fulfill({
                response,
                headers: { ...response.headers(), ...corsHeaders },
            });
        } catch (e: any) {
            if (e.message.includes("Target page, context or browser has been closed")) {
                return;
            }
            try {
                await route.continue();
            } catch (ignore) {}
        }
    });
}

// --- Fixtures ---

export const test = base.extend<
    {
        backend: BackendContext;
        cli: CliContext;
        page: Page;
        createContextPage: () => Promise<Page>;
    },
    { workerBackend: WorkerBackend } & WorkerOptions
>({
    dockerImage: ["simplito/privmx-bridge:latest", { option: true, scope: "worker" }],

    workerBackend: [
        async ({ dockerImage }, use, workerInfo) => {
            const id = workerInfo.workerIndex;
            const hostPort = 3001 + id;
            const containerName = `privmx_e2e_worker_${id}`;
            const dbName = `privmx_e2e_db_${id}`;

            const internalMongoUrl = `mongodb://test_mongodb:27017/${dbName}`;
            const localMongoUrl = `mongodb://localhost:27017/${dbName}?directConnection=true`;

            const envVars = [
                `PRIVMX_PORT=3000`,
                `PRIVMX_MONGO_URL=${internalMongoUrl}`,
                `PRIVMX_WORKERS=1`,
                `PMX_MIGRATION=Migration067AddNotificationCollection`,
                `PMX_STREAM_ENABLED=true`,
                `PRIVMX_HOSTNAME=0.0.0.0`,
                // Internal Domains (must match service names in docker-compose)
                `PMX_MEDIA_SERVER_ALLOW_SELF_SIGNED_CERTS=true`,
                `PMX_STREAMS_MEDIA_SERVER=janus`,
                `PMX_STREAMS_TURN_SERVER=turn:127.0.0.1:3478`,
                `PMX_STREAMS_TURN_SERVER_SECRET=my-secret-key`,
            ]
                .map((e) => `-e ${e}`)
                .join(" ");

            const client = new MongoClient(localMongoUrl);
            await client.connect();
            const db = client.db(dbName);

            try {
                execSync(`docker rm -f ${containerName}`, { stdio: "ignore" });
            } catch {}

            execSync(
                `docker run -d --name ${containerName} -p ${hostPort}:3000 \
                --network ${COMPOSE_NETWORK} \
                --label com.docker.compose.project=${COMPOSE_PROJECT} \
                --label com.docker.compose.service=e2e_worker \
                --label com.docker.compose.oneoff=False \
                ${envVars} \
                --add-host=host.docker.internal:host-gateway \
                ${dockerImage}`,
                { stdio: "ignore" },
            );

            await waitForServerReady(hostPort, containerName);

            await use({
                hostPort,
                containerName,
                mongoUrl: internalMongoUrl,
                db,
                mongoClient: client,
                dockerImage,
                envVars,
            });

            await client.close();
            try {
                execSync(`docker rm -f ${containerName}`, { stdio: "ignore" });
            } catch {}
        },
        { scope: "worker" },
    ],

    backend: async ({ workerBackend }, use) => {
        const { db, containerName, hostPort } = workerBackend;
        const localMongoUrl = `mongodb://localhost:27017/${workerBackend.db.databaseName}?directConnection=true`;

        try {
            try {
                execSync(`docker stop ${containerName}`, { stdio: "ignore" });
            } catch {}
            await db.dropDatabase();

            execSync(`docker start ${containerName}`, { stdio: "ignore" });
            await waitForServerReady(hostPort, containerName);
            execSync(`docker stop ${containerName}`, { stdio: "ignore" });

            const datasetPath = path.resolve(__dirname, "./datasets");
            await loadDataset(db, datasetPath, "defaultDataset");

            execSync(`docker start ${containerName}`, { stdio: "ignore" });
            await waitForServerReady(hostPort, containerName);

            await use({
                bridgeUrl: `http://localhost:${hostPort}`,
                mongoConnectionString: localMongoUrl,
                dbName: db.databaseName,
            });
        } finally {
            try {
                execSync(`docker stop ${containerName}`, { stdio: "ignore" });
            } catch {}
            await db.dropDatabase();
        }
    },

    cli: async ({ workerBackend, backend }, use) => {
        // backend may be seen as unused but in reality it makes sure that backend will be loaded before cli will be calle
        const runCli = async (method: string, params: object) => {
            const jsonParams = JSON.stringify(params).replace(/'/g, "'\\''");
            const cmd = `docker exec \
                -e API_KEY_ID=${testData.apiKeyId} \
                -e API_KEY_SECRET=${testData.apiKeySecret} \
                ${workerBackend.containerName} \
                pmxbridge_cli ${method} '${jsonParams}' --json=.`;

            try {
                const stdout = execSync(cmd).toString();
                const response = JSON.parse(stdout);
                if (response.error) throw new Error(`CLI Error: ${response.error.message}`);
                return response.result;
            } catch (e: any) {
                const output = e.stdout?.toString() || e.message;
                try {
                    const errJson = JSON.parse(output);
                    throw new Error(errJson.error?.message || e.message);
                } catch {
                    throw new Error(`CLI Failed: ${output}`);
                }
            }
        };
        await use({ call: runCli });
    },

    page: async ({ page }, use) => {
        await applyCorsProtection(page);
        await use(page);
    },

    createContextPage: async ({ browser }, use) => {
        await use(async () => {
            const context = await browser.newContext();
            await applyCorsProtection(context);
            return await context.newPage();
        });
    },
});
