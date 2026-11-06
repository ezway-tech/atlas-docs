import esbuild from 'esbuild';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const built=new Map();
const dir=path.resolve('scripts/.bundles');
export async function loadTs(entry){
 const abs=path.resolve(entry);
 if(!built.has(abs)){
  await mkdir(dir,{recursive:true});
  const outfile=path.join(dir,createHash('sha256').update(abs).digest('hex').slice(0,12)+'.mjs');
  await esbuild.build({entryPoints:[abs],bundle:true,platform:'node',format:'esm',outfile,packages:'external',logLevel:'silent'});
  built.set(abs,pathToFileURL(outfile).href);
 }
 return import(built.get(abs)+'?d='+encodeURIComponent(process.env.DATA_DIR||''));
}
