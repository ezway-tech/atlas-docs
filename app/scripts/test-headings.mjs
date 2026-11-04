import {spawnSync} from 'node:child_process';

// Keep the production test build separate from an active development server.
const env={...process.env,ATLAS_DIST_DIR:'.next-headings-check'};
for(const args of [
 ['node_modules/next/dist/bin/next','build'],
 ['node_modules/@playwright/test/cli.js','test','--config','playwright.headings.config.ts',...process.argv.slice(2)]
]){
 const result=spawnSync(process.execPath,args,{env,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
