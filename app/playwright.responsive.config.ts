import {browserOptions} from '../scripts/tests/helpers/browser.mjs';
import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'../scripts/tests/app',outputDir:'./test-results/playwright',testMatch:'responsive.spec.ts',workers:1,timeout:45000,
 use:{baseURL:'http://127.0.0.1:3109',browserName:'chromium',...browserOptions,viewport:{width:390,height:844},storageState:{cookies:[{name:'atlas-locale',value:'vi',domain:'127.0.0.1',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}],origins:[]}},
 webServer:{command:'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3109',url:'http://127.0.0.1:3109',reuseExistingServer:false,env:{ATLAS_DIST_DIR:'test-results/builds/responsive-check'}},reporter:'list'
});
