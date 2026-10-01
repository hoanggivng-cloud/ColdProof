import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), process.argv[2], '-p', process.env.WEB_PORT ?? '3000'], { stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));
