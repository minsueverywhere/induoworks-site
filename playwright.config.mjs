import {defineConfig,devices} from '@playwright/test';

// End-to-end checks run against the prerendered build (`npm run build` first).
const port=Number(process.env.E2E_PORT||4329);
export default defineConfig({
  testDir:'e2e',
  fullyParallel:true,
  forbidOnly:!!process.env.CI,
  retries:0,
  reporter:process.env.CI?[['github'],['list']]:'list',
  use:{baseURL:'http://127.0.0.1:'+port,trace:'retain-on-failure',serviceWorkers:'block',locale:'en-US',timezoneId:'Asia/Seoul'},
  projects:[
    {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1280,height:800}}},
    // Matches the 390×740 viewport used for the manual checks in docs/HANDOFF.md.
    {name:'mobile',use:{...devices['Pixel 7'],viewport:{width:390,height:740}}},
  ],
  webServer:{command:'node e2e/serve.mjs',url:'http://127.0.0.1:'+port+'/',reuseExistingServer:!process.env.CI,env:{E2E_PORT:String(port)}},
});
