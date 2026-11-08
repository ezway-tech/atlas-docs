import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import path from 'node:path';
import {appRoot,repoRoot} from '../dependencies.mjs';
const root=repoRoot;
process.chdir(appRoot);
const entries=[['user-guide','User guide','guides/user-guide.md'],['agent-guide','Agent guide','guides/agent-guide.md'],['architecture','Architecture','guides/architecture.md'],['operations','Operations','guides/operations.md'],['readme','Documentation home','README.md'],['agents','Agent instructions','AGENTS.md'],['demo-image-prompts','Demo image credits','guides/demo-image-prompts.md']];
const docs=await Promise.all(entries.map(async([slug,title,file])=>({slug,title,file,body:await readFile(path.join(root,file),'utf8')})));
docs.push({slug:'npm',title:'npm installation',file:'guides/npm.md',body:await readFile(path.join(root,'guides/npm.md'),'utf8')});
await mkdir('src/generated',{recursive:true});
await writeFile('src/generated/help.json',JSON.stringify(docs));
await mkdir('public/help-assets',{recursive:true});
try{await cp(path.join(root,'guides/assets'),'public/help-assets',{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Prepared '+docs.length+' Help articles');
