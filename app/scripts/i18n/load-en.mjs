import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const enTs=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','..','src','lib','i18n','messages','en.ts');
const src=fs.readFileSync(enTs,'utf8').replace(/^import[^\n]+\n/,'').replace('const messages:Messages=','const messages=').replace('export default messages','export const en=messages');
const tmp=path.join(path.dirname(fileURLToPath(import.meta.url)),'.en-tmp.mjs');
fs.writeFileSync(tmp,src);
const {en}=await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);
export {en};
