/**
 * Register IPC graceful shutdown for packaged / Docker child runtimes.
 * Drains library writes before exit so switch/update does not cut mid-write.
 */
let registered = false;

export function registerShutdownHook() {
  if (registered || typeof process === 'undefined') return;
  if (!process.send) return;
  registered = true;
  process.on('message', message => {
    if (message !== 'atlas:shutdown') return;
    void (async () => {
      let ok = false;
      try {
        const {beginShutdown, drainLibraryWrites} = await import('./store');
        beginShutdown();
        const result = await drainLibraryWrites({timeoutMs: 8000});
        ok = result.ok;
      } catch {
        ok = false;
      }
      try {
        process.send?.({type: 'atlas:shutdown-ack', ok});
      } catch {
        // parent may already be gone
      }
      process.exit(ok ? 0 : 1);
    })();
  });
}

registerShutdownHook();
