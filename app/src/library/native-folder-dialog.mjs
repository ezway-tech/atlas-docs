import {spawn} from 'node:child_process';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {canonicalize} from './paths.mjs';

/**
 * Open a native OS folder picker on the machine that runs Atlas Docs.
 * Returns {cancelled:true} or {path}. Never invents a path.
 * Only call when ATLAS_LOCAL_DESKTOP=1 (local desktop UI).
 */
export async function pickNativeFolder({
  title = 'Select folder',
  startPath,
  platform = process.platform,
  env = process.env,
} = {}) {
  if (env.ATLAS_DOCS_PICK_FOLDER_MOCK != null && String(env.ATLAS_DOCS_PICK_FOLDER_MOCK).trim() !== '') {
    const mock = String(env.ATLAS_DOCS_PICK_FOLDER_MOCK).trim();
    if (mock === '__cancel__') return {cancelled: true, path: null};
    return {cancelled: false, path: canonicalize(mock)};
  }

  const initial = startPath ? canonicalize(startPath) : undefined;
  if (platform === 'win32') return pickWindows(title, initial);
  if (platform === 'darwin') return pickMac(title, initial);
  return pickLinux(title, initial);
}

function run(command, args, {input, timeoutMs = 300_000} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: input != null ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new AtlasError('fs.pickTimeout', 'Folder picker timed out.'));
    }, timeoutMs);
    child.stdout?.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr?.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', code => {
      clearTimeout(timer);
      resolve({code, stdout, stderr});
    });
    if (input != null && child.stdin) {
      child.stdin.end(input);
    }
  });
}

async function pickWindows(title, startPath) {
  const description = String(title || 'Select folder').replace(/'/g, "''");
  const initial = startPath ? String(startPath).replace(/'/g, "''") : '';
  const script = `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${description}'
$dialog.ShowNewFolderButton = $true
${initial ? `$dialog.SelectedPath = '${initial}'` : ''}
$dialog.UseDescriptionForTitle = $true
$app = New-Object System.Windows.Forms.Form
$app.TopMost = $true
$app.WindowState = 'Minimized'
$app.ShowInTaskbar = $false
$result = $dialog.ShowDialog($app)
$app.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {
  [Console]::Out.Write($dialog.SelectedPath)
  exit 0
}
exit 2
`;
  const result = await run('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
  if (result.code === 2 || !String(result.stdout || '').trim()) {
    return {cancelled: true, path: null};
  }
  if (result.code !== 0) {
    throw new AtlasError(
      'fs.pickFailed',
      `Folder picker failed${result.stderr ? `: ${String(result.stderr).trim()}` : '.'}`,
    );
  }
  return {cancelled: false, path: canonicalize(String(result.stdout).trim())};
}

async function pickMac(title, startPath) {
  const prompt = String(title || 'Select folder').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const defaultLoc = startPath
    ? ` default location (POSIX file "${String(startPath).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
    : '';
  const script = `try
  set chosen to choose folder with prompt "${prompt}"${defaultLoc}
  return POSIX path of chosen
on error number -128
  return ""
end try`;
  const result = await run('osascript', ['-e', script]);
  const out = String(result.stdout || '').trim().replace(/\/$/, '');
  if (!out || result.code !== 0) return {cancelled: true, path: null};
  return {cancelled: false, path: canonicalize(out)};
}

async function pickLinux(title, startPath) {
  const argsZenity = [
    '--file-selection',
    '--directory',
    `--title=${title || 'Select folder'}`,
  ];
  if (startPath) argsZenity.push(`--filename=${path.join(startPath, path.sep)}`);
  try {
    const result = await run('zenity', argsZenity);
    const out = String(result.stdout || '').trim();
    if (result.code === 1 || !out) return {cancelled: true, path: null};
    if (result.code !== 0) throw new Error(String(result.stderr || 'zenity failed'));
    return {cancelled: false, path: canonicalize(out)};
  } catch (zenityError) {
    if (zenityError?.code === 'ENOENT') {
      // fall through to kdialog
    } else if (!(zenityError instanceof Error && zenityError.message.includes('ENOENT'))) {
      // try kdialog only when zenity missing
      const missing = zenityError && (zenityError.code === 'ENOENT' || /ENOENT|not found/i.test(String(zenityError.message)));
      if (!missing) throw zenityError;
    }
  }
  const argsKdialog = ['--getexistingdirectory', startPath || path.parse(process.cwd()).root, title || 'Select folder'];
  try {
    const result = await run('kdialog', argsKdialog);
    const out = String(result.stdout || '').trim();
    if (result.code !== 0 || !out) return {cancelled: true, path: null};
    return {cancelled: false, path: canonicalize(out)};
  } catch (error) {
    throw new AtlasError(
      'fs.pickUnavailable',
      'No folder picker is available (install zenity or kdialog). Use the in-app folder browser instead.',
      {cause: error?.code || error?.message},
    );
  }
}
