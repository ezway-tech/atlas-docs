// Start Next in this process so library IPC reaches the process that owns storage.
import {createRequire} from 'node:module';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const {startServer} = require('next/dist/server/lib/start-server');
await startServer({dir: process.cwd(), isDev: process.env.NODE_ENV === 'development',
  hostname: '127.0.0.1', port: Number(process.env.PORT || 3000), allowRetry: false});
