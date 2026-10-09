import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
const config: NextConfig = { transpilePackages: ['@coldproof/canonical-schema', '@coldproof/shared-types'], poweredByHeader: false, env: { NEXT_PUBLIC_APP_VERSION: version } };
export default config;
