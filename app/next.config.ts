import type {NextConfig} from 'next';
import {MAX_ASSET_SIZE} from './src/lib/assets';

const config:NextConfig={
 distDir:process.env.ATLAS_DIST_DIR||'.next',
 output:'standalone',
 serverExternalPackages:['lowdb'],
 experimental:{
  // With middleware enabled, Next defaults to 10MB; allow full media uploads (+ multipart overhead).
  middlewareClientMaxBodySize: MAX_ASSET_SIZE + 1024 * 1024,
 },
};
export default config;
