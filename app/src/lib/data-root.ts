import path from 'node:path';

// Dynamic env read so Next/webpack does not bake DATA_DIR at build time.
export const DATA_ROOT = path.resolve(process.env['DATA_DIR'] || path.join(process.cwd(), '..', 'data'));
