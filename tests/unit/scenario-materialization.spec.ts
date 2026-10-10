import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import core from '../../scripts/scenario-materialization-core.cjs';

const scenarioDirectory = path.join(
  process.cwd(),
  'data/scenarios/materialized/CP-DEMO-001',
);

function readArtifact(fileName: string): string {
  return readFileSync(path.join(scenarioDirectory, fileName), 'utf8');
}

function artifactMap(): Map<string, string> {
  return new Map(
    [
      'scenario.json',
      'source-window.json',
      'segments.csv',
      'measurement-leg-map.csv',
      'handovers.json',
      'source-events.json',
      'spatial-context.json',
      'assumptions.json',
      'provenance.json',
      'README.md',
    ].map((fileName) => [fileName, readArtifact(fileName)]),
  );
}

describe('CP-DEMO-001 repository materialization', () => {
  const mappings = core.parseCsv(readArtifact('measurement-leg-map.csv'));

  it('passes the repository-level artifact contract', () => {
    expect(() => core.validateArtifactContents(artifactMap())).not.toThrow();
  });

  it('uses deterministic stable artifact bytes', () => {
    expect(() =>
      execFileSync(process.execPath, ['scripts/materialize-scenario.mjs', '--check'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it.each([
    ['2024-09-10T06:59:55', 'LEG-01'],
    ['2024-09-10T07:00:00', 'LEG-02'],
    ['2024-09-10T07:54:55', 'LEG-02'],
    ['2024-09-10T07:55:00', 'LEG-03'],
    ['2024-09-10T09:29:55', 'LEG-03'],
    ['2024-09-10T09:30:00', 'LEG-04'],
  ])('assigns half-open boundary %s to %s', (timestamp, expectedLeg) => {
    expect(core.assignLeg(timestamp)?.legId).toBe(expectedLeg);
  });

  it('excludes the exact 10:00 source measurement', () => {
    expect(core.assignLeg('2024-09-10T10:00:00')).toBeUndefined();
    expect(mappings.some((row) => row.source_local_timestamp === '2024-09-10T10:00:00')).toBe(false);
  });

  it('maps every selected measurement to exactly one leg with required counts', () => {
    expect(mappings).toHaveLength(2880);
    expect(new Set(mappings.map((row) => row.measurement_ref)).size).toBe(2880);

    const counts = new Map<string, number>();
    for (const mapping of mappings) {
      counts.set(mapping.leg_id, (counts.get(mapping.leg_id) ?? 0) + 1);
      expect(core.assignLeg(mapping.source_local_timestamp)?.legId).toBe(mapping.leg_id);
    }
    expect(Object.fromEntries(counts)).toEqual({
      'LEG-01': 720,
      'LEG-02': 660,
      'LEG-03': 1140,
      'LEG-04': 360,
    });
  });

  it('preserves provenance and origin semantics without inventing UTC', () => {
    const provenance = JSON.parse(readArtifact('provenance.json'));
    const sourceWindow = JSON.parse(readArtifact('source-window.json'));

    expect(sourceWindow.timezone_status).toBe('UNKNOWN_SOURCE_LOCAL');
    expect(sourceWindow.canonical_normalization).toMatchObject({
      status: 'PENDING_EXPLICIT_TIMEZONE_CONTEXT',
      invented_timezone_used: false,
    });
    expect(mappings.every((row) => row.measurement_origin === 'REAL_PUBLIC_DATA')).toBe(true);
    expect(mappings.every((row) => row.mapping_origin === 'DERIVED')).toBe(true);
    expect(mappings.every((row) => !/[zZ]$/.test(row.source_local_timestamp))).toBe(true);
    expect(provenance.primary_source.source_checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps source experiment events separate from synthetic handovers', () => {
    const events = JSON.parse(readArtifact('source-events.json')).events as Array<Record<string, unknown>>;
    const handovers = JSON.parse(readArtifact('handovers.json')).handovers as Array<Record<string, unknown>>;

    expect(events).toHaveLength(4);
    expect(events.every((event) => event.origin === 'REAL_PUBLIC_DATA')).toBe(true);
    expect(events.every((event) => event.logistics_role === 'NONE')).toBe(true);
    expect(events.every((event) => event.causal_relation_to_handover === 'NONE')).toBe(true);
    expect(events.filter((event) => event.window_relation === 'BOUNDARY_TOUCH_ONLY')).toHaveLength(1);
    expect(handovers).toHaveLength(3);
    expect(handovers.every((handover) => handover.origin === 'SYNTHETIC')).toBe(true);
    expect(handovers.every((handover) => handover.inferred_from_source_event === false)).toBe(true);
  });

  it('keeps C04 and C07 as metadata-only illustrative conditions', () => {
    const spatial = JSON.parse(readArtifact('spatial-context.json'));
    expect(spatial.conditions.map((entry: { condition_id: string }) => entry.condition_id)).toEqual([
      'C04',
      'C07',
    ]);
    for (const condition of spatial.conditions) {
      expect(condition).toMatchObject({
        condition_semantics: 'EXPERIMENTAL_CONDITION',
        relation: 'ILLUSTRATIVE_CONTEXT',
        scope: 'SCENARIO',
        relation_origin: 'SYNTHETIC_RELATION',
        measurement_origin: 'REAL_PUBLIC_DATA',
        timestamp_status: 'NOT_APPLICABLE',
        assigned_leg_id: null,
        used_for_excursion_calculation: false,
      });
    }
  });

  it('keeps scenario, batch, and shipment identifiers distinct', () => {
    const scenario = JSON.parse(readArtifact('scenario.json'));
    expect(new Set([scenario.scenario_id, scenario.batch_id, scenario.shipment_id]).size).toBe(3);
    expect(scenario).toMatchObject({
      scenario_id: 'CP-DEMO-001',
      batch_id: 'BATCH-DEMO-001',
      shipment_id: 'SHIP-DEMO-001',
      materialization_status: 'MATERIALIZED_DRAFT_PENDING_VALIDATION',
    });
  });
});
