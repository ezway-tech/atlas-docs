import path from 'node:path';

// Opaque key so Next/webpack does not replace DATA_DIR with undefined at build time.
const dataDirKey = (JSON.parse('["DATA_DIR"]') as string[])[0];
export const DATA_ROOT = path.resolve(process.env[dataDirKey] || path.join(process.cwd(), '..', 'data'));
