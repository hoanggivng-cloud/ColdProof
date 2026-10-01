import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@coldproof/canonical-schema', '@coldproof/shared-types'], poweredByHeader: false };
export default config;
