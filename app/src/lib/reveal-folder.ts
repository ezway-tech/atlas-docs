import {spawn} from 'node:child_process';

export function canRevealFolder(platform = process.platform, env = process.env) {
  if (env.ATLAS_LOCAL_DESKTOP !== '1' || env.ATLAS_DOCS_INSTALL === 'docker') return false;
  return platform === 'win32' || platform === 'darwin' ||
    (platform === 'linux' && Boolean(env.DISPLAY || env.WAYLAND_DISPLAY));
}

export async function revealFolder(root: string, platform = process.platform, launch = spawn) {
  const commands: Partial<Record<NodeJS.Platform, string>> = {win32: 'explorer.exe', darwin: 'open', linux: 'xdg-open'};
  const command = commands[platform];
  if (!command) throw new Error('Opening folders is unavailable on this platform.');
  await new Promise<void>((resolve, reject) => {
    const child = launch(command, [root], {shell: false, stdio: 'ignore'});
    // Some desktop managers keep the launcher alive as long as its window is open.
    const timer = setTimeout(() => {child.unref(); resolve();}, 3000);
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      // Explorer also returns 1 when an existing shell opens the folder successfully.
      if (code === 0 || (platform === 'win32' && code === 1)) resolve();
      else reject(new Error(`${command} failed (${signal || code}).`));
    });
  });
}
