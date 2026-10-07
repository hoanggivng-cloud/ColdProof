import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_POLICY,
  evaluateContinuity,
  generateCandidates,
  getBlueprintMetadata,
  loadBlueprint,
  loadEvidenceDecision,
  parseExperimentActions,
  parseZenodoCsv,
  resolveApprovedCandidate,
  selectSensorWinners,
  serializeCandidates,
  validateApprovedSourceInterval,
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
  const historicalDecisionText = readFileSync(
    path.join(process.cwd(), 'data/scenarios/design/evidence-decision.json'),
    'utf8',
  );
  const historicalDecision = loadEvidenceDecision(historicalDecisionText);
  const decisionText = readFileSync(
    path.join(
      process.cwd(),
      blueprint.observed_evidence.time_series.evidence_decision_ref,
    ),
    'utf8',
  );
  const decision = loadEvidenceDecision(decisionText);
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
      timeSeriesSelectionStatus: 'RESOLVED_BY_EVIDENCE_DECISION',
      evidenceDecisionRef: 'data/scenarios/design/evidence-decision-v2.json',
    });
  });

  it('resolves blueprint selection through the authoritative evidence decision', () => {
    expect(blueprint.observed_evidence.time_series).toMatchObject({
      selection_status: 'RESOLVED_BY_EVIDENCE_DECISION',
      evidence_decision_ref: 'data/scenarios/design/evidence-decision-v2.json',
    });
    expect(blueprint.observed_evidence.time_series).not.toHaveProperty('exact_sensor_id');
    expect(blueprint.observed_evidence.time_series).not.toHaveProperty('exact_window_start');
    expect(blueprint.observed_evidence.time_series).not.toHaveProperty('exact_window_end');
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

  it('resolves historical v1 against the generated shortlist', () => {
    const selected = historicalDecision.selected_time_series_evidence;
    const candidate = {
      candidate_id: selected.candidate_id!,
      sensor_id: selected.sensor_id,
      source_file: selected.source_file,
      start_timestamp: selected.start_timestamp,
      end_timestamp: selected.end_timestamp,
      duration_seconds: selected.duration_seconds,
      observation_count: selected.observation_count,
      selection_status: 'SHORTLISTED',
    };

    expect(resolveApprovedCandidate([candidate], historicalDecision, blueprint)).toBe(candidate);
  });

  it('fails when the historical v1 candidate is absent from the generated shortlist', () => {
    expect(() => resolveApprovedCandidate([], historicalDecision, blueprint)).toThrow(
      'is missing from generated candidates',
    );
  });

  it('fails when the historical v1 sensor or window differs from its generated candidate', () => {
    const selected = historicalDecision.selected_time_series_evidence;
    const mismatched = {
      candidate_id: selected.candidate_id!,
      sensor_id: 'SENSOR08',
      source_file: selected.source_file,
      start_timestamp: '2024-09-10T06:00:00',
      end_timestamp: selected.end_timestamp,
      duration_seconds: selected.duration_seconds,
      observation_count: selected.observation_count,
      selection_status: 'SHORTLISTED',
    };

    expect(() => resolveApprovedCandidate([mismatched], historicalDecision, blueprint)).toThrow(
      'does not match generated candidate fields: sensor_id, start_timestamp',
    );
  });

  it('fails explicitly for a malformed evidence decision', () => {
    expect(() => loadEvidenceDecision('{not json')).toThrow(
      'Evidence decision contains invalid JSON',
    );
    const incomplete = JSON.parse(decisionText) as Record<string, unknown>;
    delete incomplete.selected_time_series_evidence;
    expect(() => loadEvidenceDecision(JSON.stringify(incomplete))).toThrow(
      'Evidence decision is missing required fields',
    );
  });

  it('applies human approval as an overlay without changing generated ranking', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const winners = selectSensorWinners(
      generateCandidates(source.records, parseExperimentActions(eventCsv)),
      blueprint,
      selectionContext,
      2,
    );
    const shortlisted = winners.find((candidate) => candidate.selectionStatus === 'SHORTLISTED');
    expect(shortlisted).toBeDefined();
    const overlayDecision = structuredClone(historicalDecision);
    Object.assign(overlayDecision.selected_time_series_evidence, {
      candidate_id: shortlisted?.candidateId,
      sensor_id: shortlisted?.sensorId,
      source_file: shortlisted?.sourceFile,
      start_timestamp: shortlisted?.startTimestamp,
      end_timestamp: shortlisted?.endTimestamp,
      duration_seconds: shortlisted?.durationSeconds,
      observation_count: shortlisted?.observationCount,
    });
    const before = structuredClone(winners);

    resolveApprovedCandidate(winners, overlayDecision, blueprint);

    expect(winners).toEqual(before);
  });

  it('keeps the committed candidate CSV machine-generated and approval-neutral', () => {
    const candidateCsv = readFileSync(
      path.join(process.cwd(), 'data/scenarios/design/candidate-zenodo-windows.csv'),
      'utf8',
    );
    const [headerLine, ...lines] = candidateCsv.trim().split(/\r?\n/);
    const headers = headerLine.split(',');
    const rows = lines.map((line) =>
      Object.fromEntries(headers.map((header, index) => [header, line.split(',')[index]])),
    );
    const sensor09 = rows.find(
      (row) =>
        row.candidate_id === historicalDecision.selected_time_series_evidence.candidate_id,
    );

    expect(rows.filter((row) => row.selection_status === 'SHORTLISTED')).toHaveLength(5);
    expect(rows.some((row) => row.selection_status === 'SELECTED')).toBe(false);
    expect(sensor09?.selection_status).toBe('SHORTLISTED');
    expect(candidateCsv).not.toContain('contextcontinuity');
  });

  it('promotes v2 while preserving the exact v1 artifact as historical provenance', () => {
    expect(historicalDecision).toMatchObject({
      decision_version: '1.0.0',
      decision_status: 'APPROVED',
      selected_time_series_evidence: {
        sensor_id: 'SENSOR09',
        start_timestamp: '2024-09-10T07:30:00',
        end_timestamp: '2024-09-10T10:30:00',
        observation_count: 2161,
      },
    });
    expect(blueprint.observed_evidence.time_series.evidence_decision_ref).toBe(
      'data/scenarios/design/evidence-decision-v2.json',
    );
    expect(decision).toMatchObject({
      decision_version: '2.0.0',
      decision_status: 'APPROVED',
      decision_origin: 'TEAM_APPROVED_DESIGN_REFINEMENT',
      prior_decision_ref: 'data/scenarios/design/evidence-decision.json',
      supersedes_prior_decision: true,
      selected_time_series_evidence: {
        sensor_id: 'SENSOR09',
        source_file: 'SENSOR09.CSV',
        start_timestamp: '2024-09-10T06:00:00',
        end_timestamp: '2024-09-10T10:00:00',
        interval_semantics: '[start,end)',
        observation_count: 2880,
        timezone_status: 'UNKNOWN_SOURCE_LOCAL',
      },
      reference_only_rule_comparison: {
        assumption_id: 'DEMO_2_8C',
        used_for_evidence_ranking: false,
      },
    });

    expect(decision.prior_decision_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(() =>
      execFileSync(
        'git',
        ['cat-file', '-e', `${decision.prior_decision_commit}^{commit}`],
        { stdio: 'pipe' },
      ),
    ).not.toThrow();

    const priorDecisionAtCommit = JSON.parse(
      execFileSync(
        'git',
        [
          'show',
          `${decision.prior_decision_commit}:data/scenarios/design/evidence-decision.json`,
        ],
        { encoding: 'utf8' },
      ),
    );
    expect(priorDecisionAtCommit).toEqual(historicalDecision);

    const candidateCsv = readFileSync(
      path.join(process.cwd(), 'data/scenarios/design/candidate-zenodo-windows.csv'),
      'utf8',
    );
    expect(candidateCsv).not.toContain('2024-09-10T06:00:00');
    expect(candidateCsv).not.toContain('TEAM_APPROVED_DESIGN_REFINEMENT');
  });

  it('validates an approved design-refinement interval against source evidence', () => {
    const source = parseZenodoCsv(buildSyntheticSource(), 'SENSOR06.CSV');
    const sourceDecision = structuredClone(decision);
    Object.assign(sourceDecision.selected_time_series_evidence, {
      sensor_id: 'SENSOR06',
      source_file: 'SENSOR06.CSV',
      start_timestamp: '2024-09-02T08:00:00',
      end_timestamp: '2024-09-02T10:00:00',
      duration_seconds: 7200,
      observation_count: 1440,
    });

    const validated = validateApprovedSourceInterval(source, sourceDecision, blueprint);

    expect(validated.records).toHaveLength(1440);
    expect(validated.firstRecord.timestamp).toBe('2024-09-02T08:00:00');
    expect(validated.lastRecord.timestamp).toBe('2024-09-02T09:59:55');
    expect(validated.continuity).toMatchObject({
      internalMissingIntervalCount: 0,
      duplicateTimestampCount: 0,
      outOfOrderCount: 0,
    });
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
