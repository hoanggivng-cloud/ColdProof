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
  expected_failure_code: string | null;
  expected_stage: 'NORMALIZATION' | 'DATA_QUALITY' | 'NONE';
  expected_raw_record_count: number;
  expected_canonical_record_count: number;
  expected_device_count: number;
  timezone_context_required: boolean;
  temperature_pattern_is_excursion_conclusion: false;
}

export interface DemoBusinessContext {
  origin: 'SYNTHETIC_DEMO_CONTEXT';
  batch_context: { batch_id: string; lot_number: string; origin: 'SYNTHETIC_DEMO_CONTEXT' };
  shipment_context: { shipment_id: string; origin: 'SYNTHETIC_DEMO_CONTEXT' };
  trip_context: { trip_id: string; origin: 'SYNTHETIC_DEMO_CONTEXT' };
  sender_receiver_relation: { sender_location_id: string; receiver_location_id: string; origin: 'SYNTHETIC_DEMO_CONTEXT' };
  association: { status: 'ASSIGNED' | 'UNASSIGNED'; method: 'IMPORT_CONTEXT' | null; resolver_origin: 'SYNTHETIC_DEMO_CONTEXT' };
  handover_boundaries?: Array<{ timestamp: string; origin: 'SYNTHETIC_DEMO_CONTEXT'; thermal_event_termination_semantics: 'NONE' }>;
}

export interface DemoScenario {
  scenario_id: string;
  scenario_name: string;
  scenario_family: 'ZENODO_OBSERVED_BACKED' | 'SIMULATED_RUNTIME' | 'COMBINED_REFERENCE_CONTEXT' | 'MENDELEY_CONTEXT_ONLY';
  description: string;
  scenario_origin: 'SYNTHETIC_DEMO_CONTEXT';
  product_reference_id: string;
  route_id: string;
  business_context: DemoBusinessContext;
  data_profile: string;
  test_purposes: Array<'PIPELINE' | 'NORMALIZATION' | 'DATA_QUALITY' | 'TRIP_ASSOCIATION' | 'QA_REVIEW' | 'FRONTEND_DEMO' | 'REFERENCE_CONTEXT'>;
  test_severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  test_severity_semantics: 'DEMO_TEST_ONLY';
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
  products: { products: Array<{ product_id: string; public_reference_code: string; display_name: string; manufacturer: string | null; manufacturer_verification_status: string; product_category: string; reference_origin: string; verification_status: string; identity_verification_method: string; identity_verified_on: string; source_reference: { publisher: string; title: string; url_or_identifier: string }; storage_claim: null; regulatory_claim: null; notes: string }>; [key: string]: unknown };
  locations: { locations: Array<{ location_id: string; display_name: string; city: string; country_code: string; facility_type: string; origin: string }>; [key: string]: unknown };
  routes: { routes: Array<{ route_id: string; display_label: string; origin_location_id: string; destination_location_id: string; waypoint_location_ids: string[]; route_type: string; origin: string }>; [key: string]: unknown };
  scenarios: DemoScenario[];
  outcomes: { scenarios: Array<{ scenario_id: string }>; record_count_reconciliation: { scope: string; raw_record_count: number; canonical_record_count: number; normalization_rejected_count: number; invariant: string; rejections_by_scenario: Array<{ scenario_id: string; rejected_count: number; failure_code: string; expected_stage: string }> }; [key: string]: unknown };
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
