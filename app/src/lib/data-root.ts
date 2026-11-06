import path from 'node:path';

export const DATA_ROOT=path.resolve(process.env.DATA_DIR||path.join(process.cwd(),'..','data'));
