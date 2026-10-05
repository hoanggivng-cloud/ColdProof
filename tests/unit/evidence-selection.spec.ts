import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_POLICY,
  evaluateContinuity,
  generateCandidates,
  getBlueprintMetadata,
  loadBlueprint,
  parseExperimentActions,
  parseZenodoCsv,
  selectSensorWinners,
  serializeCandidates,
  type EvidenceRecord,
  type SelectionContext,
} from '../../scripts/evidence-selection-core.cjs';

function buildSyntheticSource(): string {
  const lines = ['Date;Time;Temperature (C);Humidity (%)'];
  const start = Date.UTC(2024, 8, 2, 8, 0, 0);
  for (let index = 0; index <= 1_440; index += 1) {
    const time = new Date(start + index * 5_000);
    const date = `${String(time.getUTCDate()).padStart(2, '0')}.${String(
      time.getUTCMonth() + 1,
    ).padStart(2, '0')}.${time.getUTCFullYear()}`;
    const clock = [time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
    const temperature = index < 360 ? 10 : index < 720 ? 14 : 12;
    lines.push(`${date};${clock};${temperature};70`);
  }
  return `${lines.join('\n')}\n`;
}

describe('evidence selection helpers', () => {
  const blueprintText = readFileSync(
    path.join(process.cwd(), 'data/scenarios/design/scenario-blueprint.json'),
    'utf8',
  );
  const blueprint = loadBlueprint(blueprintText);
  const selectionContext: SelectionContext = {
    provenanceFiles: new Set(['SENSOR06.CSV', 'SENSOR07.CSV']),
    malformedRowsByFile: new Map([
      ['SENSOR06.CSV', 0],
      ['SENSOR07.CSV', 0],
    ]),
  };
  const eventCsv = [
    'Date;Action;Start Time;End Time',
    '2024-09-02;Door opened;08:40:00;08:41:00',
  ].join('\n');

  it('generates deterministic source-local candidates without mutating source records', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const before = structuredClone(source.records);
    const events = parseExperimentActions(eventCsv);

    const first = generateCandidates(source.records, events, DEFAULT_POLICY);
    const second = generateCandidates(source.records, events, DEFAULT_POLICY);

    expect(first).toEqual(second);
    expect(source.records).toEqual(before);
    expect(first).not.toHaveLength(0);
    expect(first[0].startTimestamp).toBe('2024-09-02T08:00:00');
    expect(first[0].startTimestamp).not.toMatch(/Z|[+-]\d{2}:\d{2}$/);
  });

  it('classifies an internal source gap and counts missing samples', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const withOneMissing = source.records.filter((_, index) => index !== 2);

    expect(evaluateContinuity(withOneMissing, 5)).toMatchObject({
      internalMissingIntervalCount: 1,
      expectedMissingSampleCount: 1,
      duplicateTimestampCount: 0,
      outOfOrderCount: 0,
    });
  });

  it('records source-event overlap without interpreting the event as logistics', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const candidates = generateCandidates(
      source.records,
      parseExperimentActions(eventCsv),
      DEFAULT_POLICY,
    );
    const overlapping = candidates.find((candidate) => candidate.startTimestamp === '2024-09-02T08:00:00');

    expect(overlapping).toMatchObject({
      documentedEventCount: 1,
      documentedEventRefs: 'experiment_actions.csv:row:2',
    });
    expect(JSON.stringify(overlapping)).not.toMatch(/handover|shipment/i);
  });

  it('ranks ties deterministically by sensor and source-local timestamp', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const base = generateCandidates(source.records, [], DEFAULT_POLICY)[0];
    const winners = selectSensorWinners(
      [
        { ...base, candidateId: 'B', sensorId: 'SENSOR07', sourceFile: 'SENSOR07.CSV' },
        { ...base, candidateId: 'A', sensorId: 'SENSOR06', sourceFile: 'SENSOR06.CSV' },
      ],
      blueprint,
      selectionContext,
      1,
    );

    expect(winners.map((candidate) => candidate.sensorId)).toEqual(['SENSOR06', 'SENSOR07']);
    expect(winners.map((candidate) => candidate.selectionStatus)).toEqual([
      'SHORTLISTED',
      'REJECTED',
    ]);
  });

  it('loads the valid scenario blueprint and exposes selection metadata', () => {
    expect(getBlueprintMetadata(blueprint)).toMatchObject({
      blueprintId: 'CP-DEMO-BLUEPRINT-001',
      blueprintVersion: '0.1.0',
      blueprintStatus: 'DRAFT',
      preferredReplayMode: 'SINGLE_CONTINUOUS_SOURCE_INTERVAL',
      syntheticSegmentCount: 4,
      mendeleyRole: 'SUPPLEMENTAL_ILLUSTRATIVE_CONTEXT',
      zenodoRewriteSourceTimestamp: false,
      zenodoRewriteMeasurementValue: false,
      mendeleyUsedForExcursionCalculation: false,
      productProfileId: 'DEMO_2_8C',
      productProfileExcludedFromSelection: true,
    });
  });

  it('fails fast for an empty or invalid blueprint', () => {
    expect(() => loadBlueprint('')).toThrow('Scenario blueprint is empty.');
    expect(() => loadBlueprint('{not json')).toThrow('Scenario blueprint contains invalid JSON');
  });

  it('fails fast when a required blueprint design field is missing', () => {
    const incomplete = JSON.parse(blueprintText) as Record<string, unknown>;
    delete incomplete.mapping_rules;

    expect(() => loadBlueprint(JSON.stringify(incomplete))).toThrow(
      'Scenario blueprint is missing required design fields: mapping_rules',
    );
  });

  it('propagates blueprint metadata to the evidence report', () => {
    const report = readFileSync(
      path.join(process.cwd(), 'docs/evidence-selection-report.md'),
      'utf8',
    );

    expect(report).toContain('Blueprint ID: `CP-DEMO-BLUEPRINT-001`');
    expect(report).toContain('Blueprint version: `0.1.0`');
    expect(report).toContain('Blueprint status: `DRAFT`');
    expect(report).toContain('Preferred replay mode: `SINGLE_CONTINUOUS_SOURCE_INTERVAL`');
    expect(report).toContain('Mendeley role: `SUPPLEMENTAL_ILLUSTRATIVE_CONTEXT`');
  });

  it('uses blueprint fit before deterministic thermal/event scoring', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const candidates = generateCandidates(source.records, parseExperimentActions(eventCsv));
    const lowerNumericScore = { ...candidates[0], selectionScore: 1, hasPreVariationBaseline: true };
    const higherNumericScore = {
      ...candidates[1],
      selectionScore: 999,
      hasPreVariationBaseline: false,
    };
    const winners = selectSensorWinners(
      [higherNumericScore, lowerNumericScore],
      blueprint,
      selectionContext,
      1,
    );

    expect(winners[0].candidateId).toBe(lowerNumericScore.candidateId);
    expect(winners[0].selectionRationale).toContain(
      'Blueprint loaded successfully; final candidate requires manual scientific review.',
    );
    expect(winners[0].selectionRationale).not.toMatch(/blueprint is empty|blueprint-fit evaluation is unavailable/i);
  });

  it('does not use DEMO_2_8C thresholds to rank evidence', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const candidates = generateCandidates(source.records, parseExperimentActions(eventCsv));
    const changedThresholds = structuredClone(blueprint);
    Object.assign(changedThresholds.assumptions.product_profile, {
      lower_threshold_c: -100,
      upper_threshold_c: 100,
    });

    const baseline = selectSensorWinners(candidates, blueprint, selectionContext, 2);
    const changed = selectSensorWinners(candidates, changedThresholds, selectionContext, 2);
    expect(changed).toEqual(baseline);
  });

  it('serializes the same candidate output on deterministic reruns', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const events = parseExperimentActions(eventCsv);
    const run = () =>
      serializeCandidates(
        selectSensorWinners(
          generateCandidates(source.records, events),
          blueprint,
          selectionContext,
          2,
        ),
      );

    expect(run()).toBe(run());
  });

  it('preserves all condition IDs and leaves unsupported Mendeley semantics explicit', () => {
    const crosswalk = readFileSync(
      path.join(process.cwd(), 'data/scenarios/design/condition-crosswalk.csv'),
      'utf8',
    )
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(','));
    const header = crosswalk[0];
    const rows = crosswalk.slice(1);
    const conditionIndex = header.indexOf('condition_id');
    const mediumIndex = header.indexOf('measurement_medium');
    const statusIndex = header.indexOf('verification_status');

    expect(rows.map((row) => row[conditionIndex])).toEqual(
      Array.from({ length: 13 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`),
    );
    expect(rows.every((row) => row[mediumIndex] === '')).toBe(true);
    expect(rows.every((row) => row[statusIndex] === 'PARTIALLY_VERIFIED')).toBe(true);
    expect(header).not.toContain('timestamp');
  });

  it('has no product-rule or scenario-materialization dependency', () => {
    const coreSource = readFileSync(
      path.join(process.cwd(), 'scripts/evidence-selection-core.cjs'),
      'utf8',
    );
    const cliSource = readFileSync(path.join(process.cwd(), 'scripts/select-evidence.mjs'), 'utf8');

    expect(`${coreSource}\n${cliSource}`).not.toMatch(/lower_threshold_c|upper_threshold_c/);
    expect(coreSource).not.toMatch(/writeFile|shipment_id|batch_id|excursion_flag|compliance_status/i);
  });

  it('retains physical row provenance while skipping a repeated structural header', () => {
    const source = parseZenodoCsv(
      [
        'Date;Time;Temperature (C);Humidity (%)',
        '02.09.2024;08:00:00;10;70',
        'Date;Time;Temperature (C);Humidity (%)',
        '02.09.2024;08:00:05;11;71',
      ].join('\n'),
      'SENSOR06.CSV',
    );

    expect(source.structuralHeaderCount).toBe(2);
    expect(source.records.map((record: EvidenceRecord) => record.rawRef)).toEqual(['row:2', 'row:4']);
  });
});
