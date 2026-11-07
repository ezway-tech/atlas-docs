/** Extract en keys from gen-i18n-messages.mjs for validation */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';

const genPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','gen-i18n-messages.mjs');
const text=fs.readFileSync(genPath,'utf8');
const start=text.indexOf('const en={');
const end=text.indexOf('\n};',start)+3;
const en=Function(`"use strict";return (${text.slice(start+7,end)})`)();
console.log(JSON.stringify(en,null,0));
