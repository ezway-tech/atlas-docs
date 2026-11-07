/**
 * Batch-translate catalog values still identical to English.
 * usage: node machine-translate.mjs <vi|zh-Hans|es|ja>
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {en} from './load-en.mjs';

const locale=process.argv[2];
if(!locale)throw new Error('pass locale');

const target={vi:'vi','zh-Hans':'zh-CN',es:'es',ja:'ja'}[locale];
if(!target)throw new Error('unknown locale');

const dir=path.dirname(fileURLToPath(import.meta.url));
const file=path.join(dir,`catalog-${locale}.mjs`);
const exportName=locale==='zh-Hans'?'zhHans':locale;

const mod=await import(pathToFileURL(file).href);
const current=mod[exportName];

const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl='+encodeURIComponent(target)+'&dt=t&q=';

async function tr(text){
 if(!text.trim())return text;
 const holders=[];
 let i=0;
 const safe=text.replace(/\{[^}]+\}/g,m=>{holders.push(m);return `__P${i++}__`;});
 const res=await fetch(url+encodeURIComponent(safe));
 if(!res.ok)throw new Error('translate HTTP '+res.status);
 const data=await res.json();
 let out=data[0].map(x=>x[0]).join('');
 for(let j=0;j<holders.length;j++){
  out=out.replaceAll(`__P${j}__`,holders[j]).replaceAll(`__p${j}__`,holders[j]);
 }
 return out;
}

const keys=Object.keys(en);
const out={...current};
const todo=keys.filter(k=>out[k]===en[k]);
const batch=12;
for(let n=0;n<todo.length;n+=batch){
 const slice=todo.slice(n,n+batch);
 await Promise.all(slice.map(async k=>{
  try{out[k]=await tr(en[k]);}catch{/* keep en */}
 }));
 process.stderr.write(`\r${Math.min(n+batch,todo.length)}/${todo.length}`);
 await new Promise(r=>setTimeout(r,150));
}
console.error('');

const body=Object.entries(out).map(([k,v])=>` '${k}':${JSON.stringify(v)},`).join('\n');
const src=`/** Atlas Docs UI messages (${locale}) */\nexport const ${exportName}={\n${body}\n};\n`;
fs.writeFileSync(file,src);
console.log('updated',file,'translated',todo.length);
