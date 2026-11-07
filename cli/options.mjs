import path from 'node:path';

export function parseOptions(args, env = process.env, cwd = process.cwd()) {
  const result = {port: 3000, open: true};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--version' || arg === '-v') result.version = true;
    else if (arg === '--no-open') result.open = false;
    else if (arg === '--port' || arg === '--data-dir') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw Error(`Missing value for ${arg}`);
      if (arg === '--port') {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw Error('Port must be an integer from 1 to 65535');
        result.port = Number(value);
      } else result.dataDir = value;
    } else throw Error(`Unknown option: ${arg}. Use --help.`);
  }
  result.dataDir = path.resolve(cwd, result.dataDir || env.DATA_DIR || 'atlas-docs-data');
  return result;
}
