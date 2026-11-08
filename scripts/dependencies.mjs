import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
export const repoRoot = fileURLToPath(new URL('../', import.meta.url));
export const appRoot = fileURLToPath(new URL('../app/', import.meta.url));
export const appRequire = createRequire(new URL('../app/package.json', import.meta.url));
