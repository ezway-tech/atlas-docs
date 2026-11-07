/** Write locale .mjs with every en key (placeholder EN) for translation fill */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {en} from './load-en.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const name=process.argv[2];
const partialPath=process.argv[3];
if(!name)throw new Error('usage: node bootstrap-locale.mjs <vi|zh-Hans|es|ja> [partial.mjs]');

let partial={};
if(partialPath){
 const raw=fs.readFileSync(partialPath,'utf8');
 if(partialPath.includes('gen-i18n')){
  const m=raw.match(/const vi=\{([\s\S]*?)\n\};\r?\n\r?\nfunction emit/);
  if(!m)throw new Error('could not parse vi from gen-i18n-messages.mjs');
  partial=Function(`"use strict";return ({${m[1]}})`)();
 }else{
  const m=raw.match(/const\s+\w+\s*=\s*(\{[\s\S]*\});/);
  if(m)partial=Function(`"use strict";return (${m[1]})`)();
 }
}

const out={};
for(const [k,v] of Object.entries(en)){
 out[k]=partial[k]??v;
}
const body=Object.entries(out).map(([k,v])=>` '${k}':${JSON.stringify(v)},`).join('\n');
const src=`/** Auto-bootstrap — translate every value from English */\nexport const ${name==='zh-Hans'?'zhHans':name.replace(/-/g,'')}={\n${body}\n};\n`;
fs.writeFileSync(path.join(dir,`catalog-${name}.mjs`),src);
console.log('wrote',name,Object.keys(out).length);
