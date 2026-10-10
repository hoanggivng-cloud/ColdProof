import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import type { LoggerEvent, RawIngestRecord } from '@coldproof/parser-contracts';
import type { RuntimeDataQualityResult } from '@coldproof/runtime-data-quality';
import type { RuntimeProcessingResult } from '@coldproof/runtime-data-pipeline';

export type SourceTableRow = Record<string, string>;

export interface DemoLoggerConfig {
  format: 'LOGGER_A' | 'LOGGER_B';
  device_id: string;
  seed: number;
  count: number;
  start_time: string;
  cadence_ms: number;
  measurement_origin: 'SYNTHETIC';
  format_origin?: 'VENDOR_INSPIRED';
  timezone_context?: { utc_offset: string; origin: 'NORMALIZATION_CONFIGURATION' };
}

export interface MendeleyContextReference {
  dataset: string;
  dataset_id: string;
  doi: string;
  version: string;
  source_id: string;
  source_file: string;
  source_checksum_sha256: string;
  condition_id: string;
  condition_semantics: 'EXPERIMENTAL_CONDITION';
  semantic_status: string;
  relation_type: 'ILLUSTRATIVE_CONTEXT';
  relation_origin: 'SYNTHETIC';
  used_for_dq: false;
  used_for_excursion_calculation: false;
  causal_claim: 'NONE';
  same_time_claim: 'NONE';
  same_goods_claim: 'NONE';
  same_environment_claim: 'NONE';
  timestamp_status: 'NOT_APPLICABLE';
  device_interpretation: 'NONE';
  source_manifest_ref: string;
  crosswalk_ref: string;
}

export interface ZenodoMeasurementSource {
  kind: 'ZENODO_WINDOW';
  source_id: string;
  source_file: string;
  source_checksum_sha256: string;
  sensor_id: string;
  measurement_origin: 'REAL_PUBLIC_DATA';
  window: {
    start: string;
    end: string;
    interval_semantics: '[start,end)';
    timezone_status: 'UNKNOWN_SOURCE_LOCAL';
    observation_count: number;
    first_source_ref: string;
    last_source_ref: string;
  };
  [key: string]: unknown;
}

export interface SimulatedMeasurementSource {
  kind: 'SIMULATED_LOGGER';
  measurement_origin: 'SYNTHETIC';
  logger_configs: DemoLoggerConfig[];
  used_for_dq: true;
  used_for_excursion_calculation: false;
  [key: string]: unknown;
}

export interface MendeleyOnlyMeasurementSource {
  kind: 'MENDELEY_CONTEXT_ONLY';
  measurement_origin: 'REAL_PUBLIC_DATA';
  conditions: MendeleyContextReference[];
  runtime_timeline: false;
  used_for_dq: false;
  used_for_excursion_calculation: false;
}

export type DemoMeasurementSource = ZenodoMeasurementSource | SimulatedMeasurementSource | MendeleyOnlyMeasurementSource;

export interface DemoScenarioExpected {
  normalization_expected: string;
  dq_status_expected: 'NOT_ASSESSED' | 'PASS' | 'FLAGGED';
  expected_finding_codes: string[];
  expected_raw_record_count: number;
  expected_canonical_record_count: number;
  expected_device_count: number;
  timezone_context_required: boolean;
  temperature_pattern_is_excursion_conclusion: false;
}

export interface DemoScenario {
  scenario_id: string;
  scenario_name: string;
  scenario_family: 'ZENODO_OBSERVED_BACKED' | 'SIMULATED_RUNTIME' | 'COMBINED_REFERENCE_CONTEXT' | 'MENDELEY_CONTEXT_ONLY';
  description: string;
  scenario_origin: 'SYNTHETIC_DEMO_CONTEXT';
  product_reference_id: string;
  route_id: string;
  business_context: Record<string, unknown>;
  data_profile: string;
  test_profiles: string[];
  qa_display_case: string | null;
  labels: string[];
  golden: boolean;
  golden_label: string | null;
  measurement_source: DemoMeasurementSource;
  supplemental_context: MendeleyContextReference[];
  expected: DemoScenarioExpected;
  provenance: Record<string, unknown>;
}

export interface DemoDefinitions {
  catalog: { scenario_count: number; scenario_ids: string[]; scenario_family_counts: Record<string, number>; [key: string]: unknown };
  products: { products: Array<{ product_id: string }>; [key: string]: unknown };
  locations: { locations: Array<{ location_id: string }>; [key: string]: unknown };
  routes: { routes: Array<{ route_id: string }>; [key: string]: unknown };
  scenarios: DemoScenario[];
  outcomes: { scenarios: Array<{ scenario_id: string }>; [key: string]: unknown };
}

export interface GeneratedScenarioRuntime {
  scenario_id: string;
  raw_records: RawIngestRecord[];
  processing_results: RuntimeProcessingResult[];
  canonical_measurements: CanonicalTimeSeriesMeasurement[];
  dq: RuntimeDataQualityResult | null;
}

export const CATALOG_VERSION: string;
export const GENERATOR_VERSION: string;
export function parseCsv(text: string): SourceTableRow[];
export function loadSourceTables(repositoryRoot: string): { manifest: SourceTableRow[]; crosswalk: SourceTableRow[]; candidates: SourceTableRow[] };
export function buildDefinitions(manifest: SourceTableRow[], crosswalk: SourceTableRow[]): DemoDefinitions;
export function validateDefinitions(definitions: DemoDefinitions, manifest: SourceTableRow[], crosswalk: SourceTableRow[], candidates?: SourceTableRow[]): { success: boolean; errors: string[] };
export function summaryMarkdown(definitions: DemoDefinitions): string;
export function canonicalJson(value: unknown): string;
export function buildRawRecord(event: LoggerEvent, scenarioId: string, index: number, options?: { badChecksum?: boolean; externalDeviceId?: string }): RawIngestRecord;
export function applyProfile(events: LoggerEvent[], profile: string): LoggerEvent[];
export function executeRuntimeScenario(
  scenario: DemoScenario,
  dependencies: {
    generateEvents(config: { format: 'LOGGER_A' | 'LOGGER_B'; device: string; count: number; seed: number; startTime: string; cadenceMs: number }): LoggerEvent[];
    processLoggerIngest: typeof import('@coldproof/runtime-data-pipeline').processLoggerIngest;
    assessProcessedSequence: typeof import('@coldproof/runtime-data-pipeline').assessProcessedSequence;
  },
): Promise<GeneratedScenarioRuntime>;
