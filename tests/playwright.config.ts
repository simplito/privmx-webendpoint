import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';
import type { WorkerOptions } from "./fixtures";

// This config lives in tests/; paths below are relative to it. The harness +
// packaged SDK are served from the repo root (specs navigate to /tests/...),
// so the dev server's cwd is pinned one level up.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig<WorkerOptions>({
    testDir: './specs',
    // e2e drives a real Docker bridge + per-test WASM init; 30s (the default) is
    // tight and flakes under CI load, so allow more headroom per test.
    timeout: 60_000,
    globalSetup: './dockerCleanup',
    globalTeardown: './dockerCleanup',
    workers: process.env.CI ? '100%' : undefined,
    webServer: {
        command: 'npx serve . -p 8080',
        cwd: repoRoot,
        url: 'http://localhost:8080',
        reuseExistingServer: !process.env.CI,
    },
    use: {
        dockerImage: process.env.BRIDGE_IMAGE || 'simplito/privmx-bridge:latest',
        baseURL: 'http://localhost:8080',
        launchOptions: {
          firefoxUserPrefs: {
            'dom.workers.maxPerDomain': 512,
          },
          args: [
            '--enable-features=SharedArrayBuffer',
            '--disable-web-security', 
            '--disable-features=IsolateOrigins,site-per-process'
          ]
      }
    },
    fullyParallel: false,
    projects: [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
      {
        name: 'firefox',
        use: {
          ...devices['Desktop Firefox'],
          launchOptions: {
            firefoxUserPrefs: {
              'dom.postMessage.sharedArrayBuffer.bypassCOOP_COEP.insecure.enabled': true,
              'dom.workers.maxPerDomain': 512,
              'dom.min_background_timeout_value': 10,
            }
          }
        },
      },
    ] 
});