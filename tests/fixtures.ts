import { test as base, Page } from "@playwright/test";
import { execSync } from "child_process";
import { MongoClient, Db } from "mongodb";
import * as path from "path";
import * as fs from "fs";
import { testData } from "./datasets/testData";

type WorkerBackend = {
    hostPort: number;
    containerName: string;
    mongoUrl: string;
};

type BackendContext = {
    bridgeUrl: string;
    mongoConnectionString: string;
    dbName: string;
};

type CliContext = {
    call: (method: string, params: object) => Promise<any>;
};

export type WorkerOptions = {
    dockerImage: string;
};

export const test = base.extend<
    { backend: BackendContext; cli: CliContext; page: Page },
    { workerBackend: WorkerBackend } & WorkerOptions
>({
    dockerImage: ["simplito/privmx-bridge:latest", { option: true, scope: "worker" }], 

    workerBackend: [
        async ({ dockerImage }, use, workerInfo) => {
            const id = workerInfo.workerIndex;
            const hostPort = 3001 + id;
            const containerName = `privmx_cli_test_${id}`;
            const dbName = `privmx_cli_db_${id}`;
            const internalMongoUrl = `mongodb://test_mongodb:27017/${dbName}`;

            const envVars = [
                `PRIVMX_PORT=3000`,
                `PRIVMX_MONGO_URL=${internalMongoUrl}`,
                `PRIVMX_WORKERS=1`,
                `PMX_MIGRATION=Migration048FixAclCache`,
                `API_KEY_ID=${testData.apiKeyId}`,
                `API_KEY_SECRET=${testData.apiKeySecret}`,
                `PRIVMX_HOSTNAME=0.0.0.0`,
            ]
                .map((e) => `-e ${e}`)
                .join(" ");

            try {
                execSync(`docker rm -f ${containerName}`, { stdio: "ignore" });
            } catch {}

            console.log(`[Worker ${id}] 🐳 Starting container: ${containerName} using ${dockerImage}`);

            execSync(
                `docker run -d --rm --name ${containerName} -p ${hostPort}:3000 \
            --network tests_default \
            ${envVars} \
            --add-host=host.docker.internal:host-gateway \
            ${dockerImage}`,
                { stdio: "ignore" },
            );

            await waitForServerReady(hostPort);

            await use({ hostPort, containerName, mongoUrl: internalMongoUrl });

            try {
                execSync(`docker stop ${containerName}`, { stdio: "ignore" });
            } catch {}
        },
        { scope: "worker" },
    ],

    backend: async ({ workerBackend }, use) => {
        const localMongoUrl = workerBackend.mongoUrl.replace("test_mongodb", "localhost");
        const dbName = localMongoUrl.split("/").pop()!;
        
        const client = new MongoClient(localMongoUrl + "?directConnection=true");
        await client.connect();
        const db = client.db(dbName);

        await db.dropDatabase();
        execSync(`docker restart ${workerBackend.containerName}`, { stdio: "ignore" });
        await waitForServerReady(workerBackend.hostPort);

        const datasetPath = path.resolve(__dirname, "./datasets");
        await loadDataset(db, datasetPath, "defaultDataset");
        
        await client.close();

        await use({
            bridgeUrl: `http://localhost:${workerBackend.hostPort}`,
            mongoConnectionString: localMongoUrl,
            dbName,
        });
    },

    cli: async ({ workerBackend }, use) => {
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
        await page.route("**/*", async (route) => {
            const request = route.request();
            const requestOrigin = (await request.headerValue("origin")) || "http://localhost:8080";
            
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

            try {
                const response = await route.fetch();
                await route.fulfill({
                    response,
                    headers: { ...response.headers(), ...corsHeaders },
                });
            } catch (e) {
                route.continue();
            }
        });
        await use(page);
    },
});

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

async function waitForServerReady(port: number) {
    const url = `http://localhost:${port}/privmx-configuration.json`;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(url)).ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Server failed to start on port ${port}`);
}