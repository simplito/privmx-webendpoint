import { defineConfig, devices } from '@playwright/test';
import type { WorkerOptions } from "./tests/fixtures";

export default defineConfig<WorkerOptions>({
    testDir: './tests/specs', // Point to your specs folder
    // workers: process.env.CI ? 1 : undefined,
    webServer: {
        command: 'npx serve . -p 8080', // Serve the ROOT folder
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