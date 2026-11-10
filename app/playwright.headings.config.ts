import {browserOptions} from '../scripts/tests/helpers/browser.mjs';
import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'../scripts/tests/app',outputDir:'./test-results/playwright',testMatch:'headings.spec.ts',workers:1,timeout:45000,
 use:{baseURL:'http://127.0.0.1:3108',browserName:'chromium',...browserOptions,viewport:{width:1440,height:1000},storageState:{cookies:[{name:'atlas-locale',value:'vi',domain:'127.0.0.1',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}],origins:[]}},
 webServer:{command:'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3108',url:'http://127.0.0.1:3108',reuseExistingServer:false,env:{ATLAS_DIST_DIR:'test-results/builds/headings-check'}},reporter:'list'
});
