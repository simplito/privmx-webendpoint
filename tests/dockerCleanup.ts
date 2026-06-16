import { execSync } from "child_process";

const CONTAINER_NAME_PREFIX = "privmx_e2e_worker_";

/**
 * Removes all bridge containers spawned by the workerBackend fixture, including
 * stale ones left behind by a previous run that crashed or was SIGKILLed
 * (no in-process teardown can cover that case, so we sweep by name prefix).
 * Registered as both globalSetup and globalTeardown in playwright.config.ts.
 */
export default function sweepBridgeContainers() {
    let ids: string[];
    try {
        ids = execSync(`docker ps -aq --filter "name=${CONTAINER_NAME_PREFIX}"`, { stdio: "pipe" })
            .toString()
            .trim()
            .split("\n")
            .filter(Boolean);
    } catch {
        // Docker unavailable — the fixtures will report a proper error when they need it.
        return;
    }
    if (ids.length === 0) return;

    try {
        execSync(`docker rm -f ${ids.join(" ")}`, { stdio: "pipe" });
        console.log(`Removed ${ids.length} ${CONTAINER_NAME_PREFIX}* container(s)`);
    } catch (e: any) {
        console.error(
            `Failed to remove ${CONTAINER_NAME_PREFIX}* containers:`,
            e.stderr?.toString() || e.message,
        );
    }
}
