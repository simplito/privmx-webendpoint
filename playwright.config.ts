import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/specs', // Point to your specs folder
    webServer: {
        command: 'npx serve . -p 8080', // Serve the ROOT folder
        url: 'http://localhost:8080',
        reuseExistingServer: !process.env.CI,
    },
    use: {
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
    ] 
});