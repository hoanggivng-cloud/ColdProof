import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { LoggerAEventSchema, LoggerBEventSchema } from '@coldproof/parser-contracts';
import {
  assessProcessedSequence,
  processLoggerIngest,
} from '@coldproof/runtime-data-pipeline';
import { QAComparisonRecordSchema } from '@coldproof/shared-types';

import simulatorCore, {
  type SimulatorConfig,
} from '../../scripts/simulated-logger-core.cjs';
import demoCore from '../../scripts/vietnam-demo-scenarios-core.cjs';

const repositoryRoot = path.resolve(__dirname, '../..');
const sourceTables = demoCore.loadSourceTables(repositoryRoot);
const definitions = demoCore.buildDefinitions(
  sourceTables.manifest,
  sourceTables.crosswalk,
);

function dependencies() {
  return {
    generateEvents(config: {
      format: 'LOGGER_A' | 'LOGGER_B';
      device: string;
      count: number;
      seed: number;
      startTime: string;
      cadenceMs: number;
    }) {
      const simulatorConfig: SimulatorConfig = {
        help: false,
        format: config.format,
        deviceId: config.device,
        count: config.count,
        seed: config.seed,
        startTime: config.startTime,
        cadenceMs: config.cadenceMs,
        intervalMs: 0,
        dryRun: true,
      };
      return simulatorCore.generateLoggerEvents(simulatorConfig, {
        LOGGER_A: LoggerAEventSchema,
        LOGGER_B: LoggerBEventSchema,
      });
    },
    processLoggerIngest,
    assessProcessedSequence,
  };
}

function scenario(id: string) {
  const value = definitions.scenarios.find(
    (candidate) => candidate.scenario_id === id,
  );
  if (!value) throw new Error(`Missing test scenario ${id}`);
  return value;
}

function uniqueCodes(values: string[]): string[] {
  return [...new Set(values)].sort();
}

describe('Vietnam Healthcare Demo Scenarios v2', () => {
  it('validates the full catalog, unique IDs, and reference integrity', () => {
    const validation = demoCore.validateDefinitions(
      definitions,
      sourceTables.manifest,
      sourceTables.crosswalk,
      sourceTables.candidates,
    );

    expect(validation).toEqual({ success: true, errors: [] });
    expect(definitions.scenarios).toHaveLength(28);
    expect(definitions.catalog.scenario_family_counts).toEqual({
      ZENODO_OBSERVED_BACKED: 8,
      SIMULATED_RUNTIME: 14,
      COMBINED_REFERENCE_CONTEXT: 4,
      MENDELEY_CONTEXT_ONLY: 2,
    });
    expect(new Set(definitions.scenarios.map((item) => item.scenario_id)).size).toBe(28);
  });

  it('covers every required profile and keeps the expected manifest aligned', () => {
    const required = [
      'NORMAL', 'DUPLICATE', 'CONFLICT', 'OUT_OF_ORDER', 'GAP',
      'MULTI_GAP', 'HIGH_TEMP_PATTERN', 'LOW_TEMP_PATTERN',
      'MISSING_TEMPERATURE', 'INVALID_TEMPERATURE', 'INVALID_TIMESTAMP',
      'TIMEZONE_CONTEXT_REQUIRED', 'DEVICE_IDENTITY_MISMATCH',
      'CHECKSUM_MISMATCH', 'MULTI_DEVICE', 'HANDOVER_BOUNDARY',
      'HANDOVER_WITH_GAP', 'LONG_ROUTE_NORMAL',
      'LONG_ROUTE_WITH_ANOMALY', 'MIXED_LOGGER_FORMATS',
    ];
    const present = new Set(
      definitions.scenarios.flatMap((item) => item.test_profiles),
    );

    expect(required.filter((profile) => !present.has(profile))).toEqual([]);
    expect(definitions.outcomes.scenarios.map((item) => item.scenario_id)).toEqual(
      definitions.scenarios.map((item) => item.scenario_id),
    );
  });

  it('keeps verified public product identity separate from synthetic logistics', () => {
    expect(definitions.products.products).toHaveLength(5);
    expect(definitions.products.products.map((product) => product.product_id)).toEqual([
      'PROD-DEMO-VACCINE',
      'PROD-DEMO-BIOLOGIC',
      'PROD-DEMO-DIAGNOSTIC',
      'PROD-DEMO-MEDICINE',
      'PROD-DEMO-REFERENCE',
    ]);
    for (const product of definitions.products.products) {
      expect(product).toMatchObject({
        reference_origin: 'PUBLIC_PRODUCT_REFERENCE',
        verification_status: 'VERIFIED',
        product_category: 'VACCINE',
        storage_claim: null,
        regulatory_claim: null,
      });
      expect(product.source_reference.publisher).not.toBe('');
      expect(product.source_reference.title).not.toBe('');
      expect(product.source_reference.url_or_identifier).toMatch(/^https:\/\//);
      expect(product.public_reference_code).toMatch(/^PROD-REF-[A-Z0-9-]+$/);
      expect(product).not.toHaveProperty('batch_id');
      expect(product).not.toHaveProperty('shipment_id');
      expect(product).not.toHaveProperty('lot_number');
    }

    const distribution = definitions.scenarios.reduce<Record<string, number>>(
      (counts, item) => ({
        ...counts,
        [item.product_reference_id]: (counts[item.product_reference_id] ?? 0) + 1,
      }),
      {},
    );
    expect(Object.values(distribution).sort((left, right) => left - right)).toEqual([
      5, 5, 6, 6, 6,
    ]);
    for (const item of definitions.scenarios) {
      expect(item.business_context).toMatchObject({
        origin: 'SYNTHETIC_DEMO_CONTEXT',
        batch_context: { origin: 'SYNTHETIC_DEMO_CONTEXT' },
        shipment_context: { origin: 'SYNTHETIC_DEMO_CONTEXT' },
        trip_context: { origin: 'SYNTHETIC_DEMO_CONTEXT' },
        sender_receiver_relation: { origin: 'SYNTHETIC_DEMO_CONTEXT' },
      });
    }
  });

  it('preserves Vietnamese UTF-8 display text and stable technical identifiers', () => {
    expect(definitions.locations.locations).toHaveLength(13);
    expect(definitions.routes.routes).toHaveLength(12);
    expect(definitions.locations.locations.find(
      (location) => location.location_id === 'LOC-CAN-THO',
    )).toMatchObject({
      display_name: 'Trung tâm tiêm chủng Cần Thơ 01 — DEMO',
      city: 'Cần Thơ',
      facility_type: 'VACCINATION_CENTER',
      origin: 'SYNTHETIC_DEMO_CONTEXT',
    });
    expect(definitions.routes.routes.find(
      (route) => route.route_id === 'ROUTE-HCM-LONG-AN-CAN-THO',
    )?.display_label).toBe('TP.HCM → Long An → Cần Thơ');
    expect(scenario('VNHC-020').scenario_name).toBe(
      'Logger B — thiếu ngữ cảnh múi giờ',
    );
    expect(demoCore.canonicalJson(definitions.locations)).toContain('Cần Thơ');
    expect(demoCore.canonicalJson(definitions.locations)).not.toContain('\\u1ea7');
    expect(definitions.scenarios.map((item) => item.scenario_id)).toEqual(
      Array.from({ length: 28 }, (_, index) =>
        `VNHC-${String(index + 1).padStart(3, '0')}`,
      ),
    );
  });

  it('derives tracked definitions and the Markdown summary byte-for-byte', () => {
    const trackedSummary = readFileSync(
      path.join(repositoryRoot, 'data/demo/vietnam-healthcare/catalog-summary.md'),
      'utf8',
    );
    expect(trackedSummary).toBe(demoCore.summaryMarkdown(definitions));

    for (const item of definitions.scenarios) {
      const tracked = readFileSync(
        path.join(
          repositoryRoot,
          `data/demo/vietnam-healthcare/scenarios/${item.scenario_id}.json`,
        ),
        'utf8',
      );
      expect(tracked).toBe(demoCore.canonicalJson(item));
    }
  });

  it('references exact frozen Zenodo bytes without embedding or changing them', () => {
    const candidates = demoCore.parseCsv(
      readFileSync(
        path.join(
          repositoryRoot,
          'data/scenarios/design/candidate-zenodo-windows.csv',
        ),
        'utf8',
      ),
    );
    const zenodoScenarios = definitions.scenarios.filter(
      (item) => item.scenario_family === 'ZENODO_OBSERVED_BACKED',
    );
    expect(zenodoScenarios).toHaveLength(8);
    for (const item of zenodoScenarios) {
      if (item.measurement_source.kind !== 'ZENODO_WINDOW') {
        throw new Error('Expected Zenodo measurement source');
      }
      const measurementSource = item.measurement_source;
      const source = sourceTables.manifest.find(
        (entry) => entry.source_id === measurementSource.source_id,
      );
      if (!source) throw new Error('Missing Zenodo source');
      const bytes = readFileSync(path.join(repositoryRoot, source.relative_path));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        source.checksum_sha256,
      );
      expect(measurementSource).not.toHaveProperty('measurements');
      expect(measurementSource.window).toMatchObject({
        interval_semantics: '[start,end)',
        timezone_status: 'UNKNOWN_SOURCE_LOCAL',
        observation_count: 2160,
      });
      const candidate = candidates.find(
        (entry) => entry.candidate_id === measurementSource.candidate_id,
      );
      expect(candidate).toMatchObject({
        sensor_id: measurementSource.sensor_id,
        source_file: measurementSource.source_file,
        start_timestamp: measurementSource.window.start,
        end_timestamp: measurementSource.window.end,
        internal_missing_interval_count: '0',
        duplicate_timestamp_count: '0',
        out_of_order_count: '0',
      });
    }
  });

  it('never merges Mendeley into a runtime timeline or treats conditions as devices', () => {
    const references = definitions.scenarios.flatMap((item) =>
      item.measurement_source.kind === 'MENDELEY_CONTEXT_ONLY'
        ? item.measurement_source.conditions
        : item.supplemental_context,
    );
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatchObject({
        relation_type: 'ILLUSTRATIVE_CONTEXT',
        relation_origin: 'SYNTHETIC',
        used_for_dq: false,
        used_for_excursion_calculation: false,
        causal_claim: 'NONE',
        same_time_claim: 'NONE',
        same_goods_claim: 'NONE',
        same_environment_claim: 'NONE',
        timestamp_status: 'NOT_APPLICABLE',
        device_interpretation: 'NONE',
      });
      expect(reference).not.toHaveProperty('timestamp');
      expect(reference).not.toHaveProperty('device_id');
    }
    for (const item of definitions.scenarios.filter(
      (candidate) => candidate.scenario_family === 'COMBINED_REFERENCE_CONTEXT',
    )) {
      expect(item.measurement_source.kind).toBe('SIMULATED_LOGGER');
      expect(item.supplemental_context.length).toBeGreaterThan(0);
    }
  });

  it('reproduces the same simulated scenario from the same definition', async () => {
    const first = await demoCore.executeRuntimeScenario(
      scenario('VNHC-009'),
      dependencies(),
    );
    const second = await demoCore.executeRuntimeScenario(
      scenario('VNHC-009'),
      dependencies(),
    );
    expect(second).toEqual(first);
  });

  it.each(['VNHC-009', 'VNHC-010', 'VNHC-011', 'VNHC-013', 'VNHC-020'])(
    'generates golden scenario %s with its exact expected outcome',
    async (id) => {
      const definition = scenario(id);
      const runtime = await demoCore.executeRuntimeScenario(
        definition,
        dependencies(),
      );
      const normalizationIssues = uniqueCodes(
        runtime.processing_results.flatMap((result) =>
          result.success
            ? []
            : result.normalization.issues.map((issue) => issue.code),
        ),
      );
      const actualCodes = runtime.dq?.success
        ? uniqueCodes(runtime.dq.findings.map((finding) => finding.code))
        : normalizationIssues;

      expect(runtime.raw_records).toHaveLength(
        definition.expected.expected_raw_record_count,
      );
      expect(runtime.canonical_measurements).toHaveLength(
        definition.expected.expected_canonical_record_count,
      );
      expect(runtime.dq?.assessment_status ?? 'NOT_ASSESSED').toBe(
        definition.expected.dq_status_expected,
      );
      expect(actualCodes).toEqual(
        [...definition.expected.expected_finding_codes].sort(),
      );
    },
  );

  it('keeps duplicate, conflict, out-of-order, and gap findings distinct', async () => {
    const cases = [
      ['VNHC-010', 'DUPLICATE_RECORD'],
      ['VNHC-011', 'CONFLICTING_RECORD'],
      ['VNHC-012', 'OUT_OF_ORDER_RECORD'],
      ['VNHC-013', 'MISSING_INTERVAL'],
    ];
    for (const [id, expectedCode] of cases) {
      const runtime = await demoCore.executeRuntimeScenario(
        scenario(id),
        dependencies(),
      );
      if (!runtime.dq?.success) throw new Error(`${id} DQ was not assessed`);
      expect(uniqueCodes(runtime.dq.findings.map((finding) => finding.code))).toEqual([
        expectedCode,
      ]);
    }
  });

  it.each([
    ['VNHC-017', 'MISSING_TEMPERATURE'],
    ['VNHC-018', 'INVALID_TEMPERATURE'],
    ['VNHC-019', 'INVALID_TIMESTAMP'],
    ['VNHC-020', 'TIMEZONE_CONTEXT_REQUIRED'],
    ['VNHC-021', 'DEVICE_IDENTITY_MISMATCH'],
    ['VNHC-022', 'RAW_PAYLOAD_CHECKSUM_MISMATCH'],
  ])('preserves normalization failure semantics for %s', async (id, code) => {
    const runtime = await demoCore.executeRuntimeScenario(
      scenario(id),
      dependencies(),
    );
    expect(runtime.canonical_measurements).toEqual([]);
    expect(runtime.dq).toBeNull();
    expect(
      runtime.processing_results.flatMap((result) =>
        result.success
          ? []
          : result.normalization.issues.map((issue) => issue.code),
      ),
    ).toContain(code);
  });

  it('does not fabricate a measurement for a gap', async () => {
    const runtime = await demoCore.executeRuntimeScenario(
      scenario('VNHC-013'),
      dependencies(),
    );
    expect(runtime.raw_records).toHaveLength(1999);
    expect(runtime.canonical_measurements).toHaveLength(1999);
    expect(runtime.dq?.success && runtime.dq.summary.missing_interval_count).toBe(1);
  });

  it('isolates runtime DQ by device in the multi-device scenario', async () => {
    const runtime = await demoCore.executeRuntimeScenario(
      scenario('VNHC-023'),
      dependencies(),
    );
    expect(runtime.dq?.success).toBe(true);
    if (!runtime.dq?.success) throw new Error('Expected DQ result');
    expect(runtime.dq.assessment_status).toBe('PASS');
    expect(runtime.dq.summary.device_count).toBe(2);
    expect(runtime.dq.findings).toEqual([]);
  });

  it('validates LOGGER_A and LOGGER_B scenario output against D3 contracts', () => {
    for (const id of ['VNHC-009', 'VNHC-012']) {
      const definition = scenario(id);
      if (definition.measurement_source.kind !== 'SIMULATED_LOGGER') {
        throw new Error('Expected simulated logger source');
      }
      const config = definition.measurement_source.logger_configs[0];
      const [event] = dependencies().generateEvents({
        format: config.format,
        device: config.device_id,
        count: 1,
        seed: config.seed,
        startTime: config.start_time,
        cadenceMs: config.cadence_ms,
      });
      const schema = config.format === 'LOGGER_A'
        ? LoggerAEventSchema
        : LoggerBEventSchema;
      expect(schema.safeParse(event).success).toBe(true);
    }
  });

  it('preserves the complete Raw to Canonical to DQ to Trip QA projection', async () => {
    const runtime = await demoCore.executeRuntimeScenario(
      scenario('VNHC-009'),
      dependencies(),
    );
    const raw = runtime.raw_records[0];
    const result = runtime.processing_results[0];
    if (!result.success || !runtime.dq?.success) {
      throw new Error('Expected successful QA fixture inputs');
    }
    const canonical = result.normalization.measurement;
    const comparison = QAComparisonRecordSchema.parse({
      projection_version: 'qa-comparison-v1',
      raw,
      canonical,
      normalization: {
        timezone_resolution: result.normalization.timezone_resolution,
        normalization_notes: result.normalization.normalization_notes,
      },
      data_quality: {
        assessment_status: runtime.dq.assessment_status,
        policy_id: runtime.dq.policy.policy_id,
        finding_ids: [],
        findings: [],
      },
      trip_association: {
        canonical_record_id: canonical.record_id,
        raw_ingest_id: raw.ingest_id,
        source_sensor_id: canonical.source_sensor_id,
        observed_at: canonical.timestamp,
        association_status: 'ASSIGNED',
        trip_id: 'TRIP-VNHC-009',
        association_method: 'IMPORT_CONTEXT',
        association_provenance: {
          origin: 'SYNTHETIC_DEMO_CONTEXT',
          resolver_id: 'vietnam-healthcare-demo-v2',
          resolver_version: '2.0.0',
        },
      },
    });
    expect(comparison.raw.original_payload).toBe(raw.original_payload);
    expect(comparison.canonical.raw_ingest_id).toBe(raw.ingest_id);
    expect(comparison.trip_association.canonical_record_id).toBe(
      canonical.record_id,
    );
  });

  it('reconciles every standard runtime raw record with canonical output or one blocking rejection', async () => {
    const runtimeDefinitions = definitions.scenarios.filter(
      (item) => item.measurement_source.kind === 'SIMULATED_LOGGER',
    );
    let rawRecordCount = 0;
    let canonicalRecordCount = 0;
    const rejections: Array<{
      scenario_id: string;
      rejected_count: number;
      failure_code: string;
      expected_stage: string;
    }> = [];
    for (const definition of runtimeDefinitions) {
      const runtime = await demoCore.executeRuntimeScenario(
        definition,
        dependencies(),
      );
      rawRecordCount += runtime.raw_records.length;
      canonicalRecordCount += runtime.canonical_measurements.length;
      const rejected = runtime.processing_results.filter((result) => !result.success);
      if (rejected.length > 0) {
        const first = rejected[0];
        if (first.success) throw new Error('Expected rejected processing result');
        rejections.push({
          scenario_id: definition.scenario_id,
          rejected_count: rejected.length,
          failure_code: first.normalization.issues[0].code,
          expected_stage: 'NORMALIZATION',
        });
      }
    }
    const reconciliation = definitions.outcomes.record_count_reconciliation;
    expect(rawRecordCount).toBe(25_704);
    expect(canonicalRecordCount).toBe(25_698);
    expect(rawRecordCount - canonicalRecordCount).toBe(6);
    expect(rejections).toEqual(reconciliation.rejections_by_scenario);
    expect(rawRecordCount).toBe(
      canonicalRecordCount + reconciliation.normalization_rejected_count,
    );
  });

  it('keeps temperature-pattern DQ PASS distinct from temperature compliance', async () => {
    for (const id of ['VNHC-015', 'VNHC-016']) {
      const runtime = await demoCore.executeRuntimeScenario(
        scenario(id),
        dependencies(),
      );
      expect(runtime.dq?.assessment_status).toBe('PASS');
      expect(scenario(id).expected.temperature_pattern_is_excursion_conclusion).toBe(false);
      expect(scenario(id).expected.expected_stage).toBe('NONE');
    }
  });
});
