import { execSync } from 'node:child_process';

const ports = [3000, 3001];

for (const port of ports) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = output.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const state = parts[3];
        const pid = parts[parts.length - 1];
        if (state === 'LISTENING' && pid && pid !== '0' && pid !== process.pid.toString()) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            console.log(`[clean-ports] Freed port ${port} by terminating PID ${pid}`);
          } catch {}
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
      console.log(`[clean-ports] Freed port ${port}`);
    }
  } catch {
    // Port not in use, continue
  }
}
