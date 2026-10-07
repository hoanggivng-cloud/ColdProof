import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), process.argv[2], '-p', process.env.WEB_PORT ?? '3000'],
  { stdio: 'inherit' }
);

const cleanup = () => {
  if (child && !child.killed && child.pid) {
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F'], { stdio: 'ignore' });
      } catch {}
    } else {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  }
};

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', () => {
  cleanup();
});

child.on('exit', code => process.exit(code ?? 0));

