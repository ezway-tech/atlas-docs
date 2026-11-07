import path from 'node:path';

const COMMANDS = new Set(['start', 'update', 'doctor', 'library']);

/**
 * Parse CLI argv into command + options.
 * Bare flags without a command imply `start`.
 */
export function parseOptions(args, env = process.env, cwd = process.cwd()) {
  const result = {
    command: 'start',
    port: 3000,
    open: true,
    yes: false,
    updateCheck: false,
    libraryArgs: [],
    dataDirFlag: null,
  };

  const tokens = [...args];
  if (tokens[0] && COMMANDS.has(tokens[0]) && !tokens[0].startsWith('-')) {
    result.command = tokens.shift();
  }

  if (result.command === 'library') {
    result.libraryArgs = tokens;
    return result;
  }

  for (let i = 0; i < tokens.length; i++) {
    const arg = tokens[i];
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--version' || arg === '-v') result.version = true;
    else if (arg === '--no-open') result.open = false;
    else if (arg === '--yes' || arg === '-y') result.yes = true;
    else if (arg === '--check' && result.command === 'update') result.updateCheck = true;
    else if (arg === '--port' || arg === '--data-dir') {
      const value = tokens[++i];
      if (!value || value.startsWith('--')) throw Error(`Missing value for ${arg}`);
      if (arg === '--port') {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
          throw Error('Port must be an integer from 1 to 65535');
        }
        result.port = Number(value);
      } else {
        result.dataDirFlag = value;
      }
    } else throw Error(`Unknown option: ${arg}. Use --help.`);
  }

  result.env = env;
  result.cwd = cwd;
  // Provisional path without project config (tests / display). Prefer resolveLibraryPath for start.
  result.dataDir = path.resolve(cwd, result.dataDirFlag || env.DATA_DIR || 'atlas-docs-data');
  return result;
}
