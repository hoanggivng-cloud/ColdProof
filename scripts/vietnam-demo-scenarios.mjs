import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import core from './vietnam-demo-scenarios-core.cjs';
import simulatorCore from './simulated-logger-core.cjs';

const scriptPath = fileURLToPath(import.meta.url);
if (!process.execArgv.includes('--experimental-strip-types')) {
  const child = spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', scriptPath, ...process.argv.slice(2)], { stdio: 'inherit' });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const outputRoot = path.join(repositoryRoot, 'data/demo/vietnam-healthcare');
const scenarioDirectory = path.join(outputRoot, 'scenarios');
const { manifest, crosswalk, candidates } = core.loadSourceTables(repositoryRoot);
const definitions = core.buildDefinitions(manifest, crosswalk);
const validation = core.validateDefinitions(definitions, manifest, crosswalk, candidates);
if (!validation.success) throw new Error(`Scenario catalog validation failed:\n${validation.errors.join('\n')}`);

const expectedFiles = new Map([
  ['catalog.json', core.canonicalJson(definitions.catalog)],
  ['products.json', core.canonicalJson(definitions.products)],
  ['locations.json', core.canonicalJson(definitions.locations)],
  ['routes.json', core.canonicalJson(definitions.routes)],
  ['expected-outcomes.json', core.canonicalJson(definitions.outcomes)],
  ['catalog-summary.md', core.summaryMarkdown(definitions)],
  ...definitions.scenarios.map((scenario) => [`scenarios/${scenario.scenario_id}.json`, core.canonicalJson(scenario)]),
]);

async function writeDefinitions() {
  await mkdir(scenarioDirectory, { recursive: true });
  for (const [relativePath, content] of expectedFiles) {
    await writeFile(path.join(outputRoot, relativePath), content, 'utf8');
  }
}

async function checkDefinitions() {
  const failures = [];
  for (const [relativePath, expected] of expectedFiles) {
    try {
      const actual = await readFile(path.join(outputRoot, relativePath), 'utf8');
      if (actual !== expected) failures.push(`${relativePath}: content differs from deterministic generator`);
    } catch (error) {
      failures.push(`${relativePath}: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
    }
  }
  try {
    const existing = (await readdir(scenarioDirectory)).filter((name) => name.endsWith('.json')).sort();
    const expected = definitions.scenarios.map((scenario) => `${scenario.scenario_id}.json`).sort();
    if (JSON.stringify(existing) !== JSON.stringify(expected)) failures.push('scenarios/: unexpected or missing scenario files');
  } catch (error) {
    failures.push(`scenarios/: ${error.message}`);
  }
  if (failures.length > 0) throw new Error(`Scenario catalog check failed:\n${failures.join('\n')}`);
  process.stderr.write(`Validated ${definitions.scenarios.length} deterministic Vietnam healthcare demo scenarios.\n`);
}

function printList() {
  process.stdout.write(core.summaryMarkdown(definitions));
}

async function printScenario(id, countOverride) {
  const scenario = definitions.scenarios.find((candidate) => candidate.scenario_id === id);
  if (!scenario) throw new Error(`Unknown scenario ID: ${id}`);
  if (scenario.measurement_source.kind !== 'SIMULATED_LOGGER') {
    if (countOverride !== undefined) throw new Error('--count is available only for simulated logger scenarios');
    process.stdout.write(core.canonicalJson({ scenario, runtime_generation: 'NOT_APPLICABLE' }));
    return;
  }
  const executableScenario = structuredClone(scenario);
  if (countOverride !== undefined) {
    if (!Number.isSafeInteger(countOverride) || countOverride <= 0) throw new Error('--count must be a positive safe integer');
    if (executableScenario.measurement_source.logger_configs.length !== 1) throw new Error('--count override requires a single logger configuration');
    executableScenario.measurement_source.logger_configs[0].count = countOverride;
  }
  const contracts = await import('../packages/parser-contracts/src/index.ts');
  const pipeline = await import('../packages/runtime-data-pipeline/src/index.ts');
  const runtime = await core.executeRuntimeScenario(executableScenario, {
    generateEvents: (config) => simulatorCore.generateLoggerEvents({ help: false, deviceId: config.device, intervalMs: 0, dryRun: true, ...config }, { LOGGER_A: contracts.LoggerAEventSchema, LOGGER_B: contracts.LoggerBEventSchema }),
    processLoggerIngest: pipeline.processLoggerIngest,
    assessProcessedSequence: pipeline.assessProcessedSequence,
  });
  process.stdout.write(core.canonicalJson({
    scenario,
    generation_override: countOverride === undefined ? null : { count: countOverride },
    generated: {
      raw_record_count: runtime.raw_records.length,
      canonical_record_count: runtime.canonical_measurements.length,
      normalization_failure_codes: runtime.processing_results.flatMap((result) => result.success ? [] : result.normalization.issues.map((issue) => issue.code)),
      dq_status: runtime.dq?.assessment_status ?? 'NOT_ASSESSED',
      finding_codes: runtime.dq?.success ? [...new Set(runtime.dq.findings.map((finding) => finding.code))] : [],
    },
  }));
}

const argumentsList = process.argv.slice(2);
if (argumentsList.includes('--write')) await writeDefinitions();
else if (argumentsList.includes('--check')) await checkDefinitions();
else if (argumentsList.includes('--list') || argumentsList.length === 0) printList();
else {
  const idIndex = argumentsList.indexOf('--id');
  if (idIndex === -1 || !argumentsList[idIndex + 1]) throw new Error('Usage: --list | --check | --write | --id VNHC-001');
  const countIndex = argumentsList.indexOf('--count');
  const countOverride = countIndex === -1 ? undefined : Number(argumentsList[countIndex + 1]);
  await printScenario(argumentsList[idIndex + 1], countOverride);
}
