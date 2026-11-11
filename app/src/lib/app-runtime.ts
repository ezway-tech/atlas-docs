import manifest from '../../package.json';

export function appRuntime() {
 // Read runtime values indirectly: Next must not inline the packaging machine's environment.
 const env = (name:string) => process.env[JSON.parse(JSON.stringify(name)) as string];
 return {
  version: env('ATLAS_APP_VERSION') || manifest.version,
  development: process.env.NODE_ENV === 'development',
  packageRoot: env('ATLAS_PACKAGE_ROOT') || process.cwd(),
  managed: env('ATLAS_CLI_MANAGED') === '1' && typeof process.send === 'function' && process.connected,
  stateFile: env('ATLAS_UPDATE_STATE') || null,
 };
}
