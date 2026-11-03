import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'ui.spec.ts',workers:1,use:{baseURL:'http://127.0.0.1:3107',browserName:'chromium',channel:'msedge',headless:true},webServer:{command:'node tests/serve-ui.mjs',url:'http://127.0.0.1:3107',reuseExistingServer:false},reporter:'list'});
