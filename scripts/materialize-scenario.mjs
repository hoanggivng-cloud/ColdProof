import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import evidenceCore from './evidence-selection-core.cjs';
import materializationCore from './scenario-materialization-core.cjs';
import { readManifest } from './data-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);

if (!process.execArgv.includes('--experimental-strip-types')) {
  const child = spawnSync(
    process.execPath,
    ['--no-warnings', '--experimental-strip-types', scriptPath, ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

const { loadBlueprint, loadEvidenceDecision, parseExperimentActions } = evidenceCore;
const { buildMaterializationArtifacts, parseCsv } = materializationCore;

const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const designDirectory = path.join(repoRoot, 'data/scenarios/design');
const outputDirectory = path.join(repoRoot, 'data/scenarios/materialized/CP-DEMO-001');
const decisionPath = path.join(designDirectory, 'evidence-decision-v2.json');
const blueprintPath = path.join(designDirectory, 'scenario-blueprint.json');
const crosswalkPath = path.join(designDirectory, 'condition-crosswalk.csv');
const checkOnly = process.argv.includes('--check');

const { ZenodoAdapter } = await import('../apps/api/src/adapters/zenodo/zenodo.adapter.ts');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readVerifiedAsset(asset) {
  const absolutePath = path.join(repoRoot, asset.relative_path);
  let content;
  try {
    content = await readFile(absolutePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Frozen source asset is missing: ${asset.relative_path}. Run pnpm data:setup before materialization.`,
      );
    }
    throw error;
  }
  const actualChecksum = sha256(content);
  if (actualChecksum !== asset.checksum_sha256) {
    throw new Error(
      `Frozen source checksum mismatch for ${asset.source_id}: expected ${asset.checksum_sha256}, found ${actualChecksum}.`,
    );
  }
  return content;
}

function manifestAsset(manifest, sourceId) {
  const asset = manifest.find((entry) => entry.source_id === sourceId);
  if (!asset) throw new Error(`Source manifest is missing ${sourceId}.`);
  return asset;
}

const [decisionText, blueprintText, crosswalkText] = await Promise.all([
  readFile(decisionPath, 'utf8'),
  readFile(blueprintPath, 'utf8'),
  readFile(crosswalkPath, 'utf8'),
]);
const decision = loadEvidenceDecision(decisionText);
const blueprint = loadBlueprint(blueprintText);
const manifest = await readManifest();
const sourceAsset = manifestAsset(manifest, 'ZEN-RAW-S09');
const eventAsset = manifestAsset(manifest, 'ZEN-META-ACTIONS');
const c04Asset = manifestAsset(manifest, 'MEN-C04');
const c07Asset = manifestAsset(manifest, 'MEN-C07');

const [sourceContent, eventContent] = await Promise.all([
  readVerifiedAsset(sourceAsset),
  readVerifiedAsset(eventAsset),
  readVerifiedAsset(c04Asset),
  readVerifiedAsset(c07Asset),
]);

const adapter = new ZenodoAdapter();
const sourceMetadata = {
  fileName: sourceAsset.file_name,
  dataset: 'ZENODO:10.5281/zenodo.15130001',
  checksumSha256: sourceAsset.checksum_sha256,
  sourceFormat: 'CSV_SEMICOLON',
  measurementOrigin: 'REAL_PUBLIC_DATA',
  mimeType: 'text/csv',
  sourceSensorId: 'SENSOR09',
};
const detection = adapter.canParse(sourceMetadata, sourceContent.subarray(0, 1024));
if (!detection.supported) {
  throw new Error(`ZenodoAdapter rejected SENSOR09.CSV: ${detection.reason ?? 'unknown reason'}`);
}

const parsedRecords = [];
for await (const record of adapter.parse({ metadata: sourceMetadata, content: sourceContent })) {
  parsedRecords.push(record);
}

const crosswalkRows = parseCsv(crosswalkText);
const spatialContexts = [c04Asset, c07Asset].map((asset) => {
  const conditionId = asset.source_id.replace('MEN-', '');
  const crosswalk = crosswalkRows.find((row) => row.condition_id === conditionId);
  if (!crosswalk) throw new Error(`Condition crosswalk is missing ${conditionId}.`);
  return {
    condition_id: conditionId,
    condition_semantics: 'EXPERIMENTAL_CONDITION',
    source_id: asset.source_id,
    source_file: asset.file_name,
    relative_path: asset.relative_path,
    source_checksum_sha256: asset.checksum_sha256,
    source_version: asset.version,
    worksheet: crosswalk.worksheet,
    measurement_plane: crosswalk.measurement_plane,
    aggregation_type: crosswalk.aggregation_type,
    verification_status: crosswalk.verification_status,
    unresolved_measurement_medium: crosswalk.measurement_medium === '',
    unresolved_aggregation_window_or_method: true,
    relation: 'ILLUSTRATIVE_CONTEXT',
    scope: 'SCENARIO',
    relation_origin: 'SYNTHETIC_RELATION',
    measurement_origin: 'REAL_PUBLIC_DATA',
    timestamp_status: 'NOT_APPLICABLE',
    assigned_leg_id: null,
    handover_mapping: 'NONE',
    used_for_excursion_calculation: false,
    same_time_claim: false,
    same_goods_claim: false,
    same_environment_claim: false,
    device_or_vendor_interpretation: 'NONE',
  };
});

const { artifacts, summary } = buildMaterializationArtifacts({
  decision,
  blueprint,
  parsedRecords,
  sourceAsset,
  eventAsset,
  experimentEvents: parseExperimentActions(eventContent.toString('utf8')),
  spatialContexts,
  evidenceDecisionSha256: sha256(Buffer.from(decisionText, 'utf8')),
});

if (checkOnly) {
  const expectedNames = [...artifacts.keys()].sort();
  let actualNames;
  try {
    actualNames = (await readdir(outputDirectory)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Materialized scenario directory is missing: ${outputDirectory}`);
    }
    throw error;
  }
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Materialized artifact set differs. Expected ${expectedNames.join(', ')}; found ${actualNames.join(', ')}.`,
    );
  }
  for (const [fileName, expected] of artifacts) {
    const actual = await readFile(path.join(outputDirectory, fileName), 'utf8');
    if (actual !== expected) {
      throw new Error(`${fileName} is not reproducible; run node scripts/materialize-scenario.mjs.`);
    }
  }
} else {
  await mkdir(outputDirectory, { recursive: true });
  for (const [fileName, content] of artifacts) {
    await writeFile(path.join(outputDirectory, fileName), content, 'utf8');
  }
}

console.log('Scenario Materialization');
console.log('------------------------');
console.log('Scenario: CP-DEMO-001');
console.log('Evidence: SENSOR09 [2024-09-10T06:00:00,2024-09-10T10:00:00)');
console.log(`Mode: ${checkOnly ? 'CHECK' : 'WRITE'}`);
console.log(`Observations: ${summary.selectedObservationCount}`);
console.log(
  `Legs: ${Object.entries(summary.legCounts).map(([id, count]) => `${id}=${count}`).join(', ')}`,
);
console.log(`Handovers: ${summary.handoverCount}`);
console.log(`Source events: ${summary.sourceEventCount} (including one boundary touch)`);
console.log(`Mendeley context conditions: ${summary.spatialConditionCount}`);
console.log(
  `Source quality: missing=${summary.continuity.internalMissingIntervalCount}, ` +
    `duplicates=${summary.continuity.duplicateTimestampCount}, ` +
    `out_of_order=${summary.continuity.outOfOrderCount}`,
);
console.log(
  `Source refs: ${summary.firstSourceRef}..${summary.lastSourceRef}; ` +
    `excluded boundary=${summary.excludedBoundarySourceRef}`,
);
console.log('Timezone: UNKNOWN_SOURCE_LOCAL (no UTC conversion applied)');
console.log('Canonical normalization: PENDING_EXPLICIT_TIMEZONE_CONTEXT');
console.log('RESULT: PASS');
