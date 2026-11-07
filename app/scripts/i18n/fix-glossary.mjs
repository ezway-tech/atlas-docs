/** Restore product/technical tokens after machine translation */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {en} from './load-en.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const files=['catalog-vi.mjs','catalog-zh-Hans.mjs','catalog-es.mjs','catalog-ja.mjs'];

const pinAll={
 'brand.title':'ATLAS DOCS',
 'brand.tagline':'by Ezway Tech',
 'brand.github':'GitHub',
 'common.ok':'OK',
 'language.vi':'Tiếng Việt',
 'language.en':'English',
 'language.zh-Hans':'简体中文',
 'language.es':'Español',
 'language.ja':'日本語',
};
const pinVi={'language.en':'Tiếng Anh'};

const literal=[
 ['SHA-256','SHA-256'],['SHA256','SHA-256'],
 ['OpenAPI','OpenAPI'],['Swagger','Swagger'],
 ['Markdown','Markdown'],['YAML','YAML'],['JSON','JSON'],['SQL','SQL'],['ZIP','ZIP'],
 ['Mermaid','Mermaid'],['MDX','MDX'],['MiB','MiB'],['KiB','KiB'],
 ['GitHub','GitHub'],['Ctrl','Ctrl'],['Alt','Alt'],
 ['Visual','Visual'],['Source','Source'],['Split','Split'],['Preview','Preview'],
 ['Atlas Docs','Atlas Docs'],['ATLAS DOCS','ATLAS DOCS'],
];

function fixValue(key,val,pin){
 let s=val;
 if(pin[key])return pin[key];
 if(key.startsWith('editor.mode.')&&['visual','source','split','preview'].some(x=>key.endsWith(x))){
  const tail=key.split('.').pop();
  const map={visual:'Visual',source:'Source',split:'Split',preview:'Preview'};
  if(map[tail])return map[tail];
 }
 if(key.startsWith('doc.kind.')){
  const kind=key.split('.').pop();
  const map={md:'Markdown',yaml:'YAML',sql:'SQL',json:'JSON'};
  if(map[kind])return map[kind];
 }
 for(const [from,to] of literal){
  s=s.split(from).join(to);
 }
 return s;
}

for(const file of files){
 const raw=fs.readFileSync(path.join(dir,file),'utf8');
 const m=raw.match(/export const (\w+)=\{([\s\S]*)\};/);
 if(!m)continue;
 const name=m[1];
 const obj=Function(`"use strict";return ({${m[2]}})`)();
 const pin=file==='catalog-vi.mjs'?{...pinAll,...pinVi}:pinAll;
 for(const k of Object.keys(en)){
  if(obj[k]!=null)obj[k]=fixValue(k,obj[k],pin);
 }
 const body=Object.entries(obj).map(([k,v])=>` '${k}':${JSON.stringify(v)},`).join('\n');
 fs.writeFileSync(path.join(dir,file),`/** Atlas Docs UI messages */\nexport const ${name}={\n${body}\n};\n`);
 console.log('fixed',file);
}
