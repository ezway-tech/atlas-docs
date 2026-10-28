import type {NextConfig} from 'next';
const config:NextConfig={distDir:process.env.ATLAS_DIST_DIR||'.next',output:'standalone',serverExternalPackages:['lowdb']};
export default config;
