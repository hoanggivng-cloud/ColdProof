import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import core from './evidence-selection-core.cjs';
import { readManifest } from './data-manifest.mjs';

const {
  DEFAULT_POLICY,
  createGapAuditCandidates,
  evaluateCandidateAgainstBlueprint,
  evaluateContinuity,
  generateCandidates,
  getBlueprintMetadata,
  loadBlueprint,
  parseExperimentActions,
  parseZenodoCsv,
  selectSensorWinners,
  serializeCandidates,
} = core;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDirectory = path.join(repoRoot, 'data/observed/zenodo/raw');
const eventsPath = path.join(repoRoot, 'data/observed/zenodo/metadata/experiment_actions.csv');
const blueprintPath = path.join(repoRoot, 'data/scenarios/design/scenario-blueprint.json');
const outputPath = path.join(repoRoot, 'data/scenarios/design/candidate-zenodo-windows.csv');
const checkOnly = process.argv.includes('--check');

let blueprintText;
try {
  blueprintText = await readFile(blueprintPath, 'utf8');
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new Error(`Scenario blueprint is missing: ${blueprintPath}`);
  }
  throw error;
}
const blueprint = loadBlueprint(blueprintText);
const blueprintMetadata = getBlueprintMetadata(blueprint);
const manifest = await readManifest();
const provenanceFiles = new Set(
  manifest
    .filter(
      (asset) =>
        asset.dataset === 'ZENODO' &&
        asset.source_stage === 'RAW' &&
        asset.checksum_sha256 !== '',
    )
    .map((asset) => asset.file_name),
);
const events = parseExperimentActions(await readFile(eventsPath, 'utf8'));
const parsedSources = [];

for (let sensorNumber = 1; sensorNumber <= 9; sensorNumber += 1) {
  const fileName = `SENSOR${String(sensorNumber).padStart(2, '0')}.CSV`;
  parsedSources.push(parseZenodoCsv(await readFile(path.join(rawDirectory, fileName), 'utf8'), fileName));
}

const allCandidates = parsedSources.flatMap((source) =>
  generateCandidates(source.records, events, DEFAULT_POLICY),
);
const selectionContext = {
  provenanceFiles,
  malformedRowsByFile: new Map(
    parsedSources.map((source) => [source.fileName, source.malformedRows.length]),
  ),
};
const sensorWinners = selectSensorWinners(
  allCandidates,
  blueprint,
  selectionContext,
  DEFAULT_POLICY.shortlistSize,
);
const gapAudits = createGapAuditCandidates(parsedSources, events, DEFAULT_POLICY).map(
  (candidate) => ({
    ...evaluateCandidateAgainstBlueprint(candidate, blueprint, selectionContext),
    rank: '',
    selectionStatus: 'REJECTED',
    selectionRationale: '',
    rejectionReason: candidate.rejectionReason,
  }),
);
const output = serializeCandidates([...sensorWinners, ...gapAudits]);

if (checkOnly) {
  const committed = await readFile(outputPath, 'utf8');
  if (committed !== output) {
    throw new Error('candidate-zenodo-windows.csv is not reproducible; run node scripts/select-evidence.mjs.');
  }
} else {
  await writeFile(outputPath, output, 'utf8');
}

const sourceSummary = parsedSources.map((source) => ({
  sensorId: source.sensorId,
  measurementRows: source.records.length,
  malformedRows: source.malformedRows.length,
  structuralHeaders: source.structuralHeaderCount,
  ...evaluateContinuity(source.records, DEFAULT_POLICY.expectedIntervalSeconds),
}));

console.log('Evidence Selection');
console.log('------------------');
console.log(
  `Blueprint: ${blueprintMetadata.blueprintId} v${blueprintMetadata.blueprintVersion} (${blueprintMetadata.blueprintStatus})`,
);
console.log(`Preferred replay mode: ${blueprintMetadata.preferredReplayMode}`);
console.log(`Synthetic segments: ${blueprintMetadata.syntheticSegmentCount}`);
console.log(`Sensors scanned: ${parsedSources.length}`);
console.log(`Continuous candidates considered: ${allCandidates.length}`);
console.log(`Per-sensor candidates retained: ${sensorWinners.length}`);
console.log(`Source-gap audit rows retained: ${gapAudits.length}`);
console.log(`Mode: ${checkOnly ? 'CHECK' : 'WRITE'}`);
for (const source of sourceSummary) {
  console.log(
    `${source.sensorId}: measurements=${source.measurementRows}, malformed=${source.malformedRows}, ` +
      `missing_intervals=${source.internalMissingIntervalCount}, missing_samples=${source.expectedMissingSampleCount}, ` +
      `duplicates=${source.duplicateTimestampCount}, out_of_order=${source.outOfOrderCount}`,
  );
}
console.log('RESULT: PASS');
