import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import simulatorCore from './simulated-logger-core.cjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

const HELP = `ColdProof Simulated Logger v1

Usage:
  pnpm logger:simulate --format LOGGER_A|LOGGER_B --device <id> [options]

Required transport mode:
  --dry-run               Write payload-only JSONL to stdout without network access
  --endpoint <http-url>   POST each payload as application/json

Generation options:
  --count <number>        Number of payloads (default: 1)
  --seed <integer>        Deterministic uint32 seed (default: 1)
  --start-time <value>    LOGGER_A: offset ISO; LOGGER_B: timezone-naive ISO
  --cadence <ms>          Logical timestamp progression (default: 5000)
  --interval <ms>         Real wait between HTTP requests only (default: 0)
  --help                  Show this help
`;

function buildContractPackages() {
  const pnpmExecutable = process.env.npm_execpath;
  const command = pnpmExecutable ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const commandPrefix = pnpmExecutable ? [pnpmExecutable] : [];
  for (const packageName of ['@coldproof/canonical-schema', '@coldproof/parser-contracts']) {
    const result = spawnSync(
      command,
      [...commandPrefix, '--filter', packageName, 'build'],
      { cwd: repoRoot, stdio: ['ignore', process.stderr, process.stderr] },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Failed to build ${packageName} before loading logger contracts.`);
    }
  }
}

async function main() {
  const config = simulatorCore.parseCliArguments(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(HELP);
    return;
  }

  buildContractPackages();
  const contractModuleUrl = pathToFileURL(
    path.join(repoRoot, 'packages/parser-contracts/dist/index.js'),
  );
  const contracts = await import(contractModuleUrl.href);
  const result = await simulatorCore.runSimulation(config, {
    schemas: {
      LOGGER_A: contracts.LoggerAEventSchema,
      LOGGER_B: contracts.LoggerBEventSchema,
    },
    fetchImplementation: globalThis.fetch,
    writeLine: (line) => process.stdout.write(`${line}\n`),
    sleep: simulatorCore.wait,
  });

  if (!config.dryRun) {
    process.stderr.write(`Sent ${result.sentCount} ${config.format} payload(s) to ${config.endpoint}.\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`Simulated logger failed: ${error.message}\n`);
  process.exitCode = 1;
});
