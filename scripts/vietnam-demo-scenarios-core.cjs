// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require('node:crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('node:fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');

const CATALOG_VERSION = '2.0.0';
const GENERATOR_VERSION = 'vietnam-healthcare-demo-v2';
const ZENODO_DOI = '10.5281/zenodo.15130001';
const MENDELEY_DOI = '10.17632/sz5dgkz7k8.1';
const EXPECTED_FINDING_CODES = new Set([
  'DUPLICATE_RECORD',
  'CONFLICTING_RECORD',
  'OUT_OF_ORDER_RECORD',
  'MISSING_INTERVAL',
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field !== '' || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const [headers, ...values] = rows.filter((candidate) => candidate.some(Boolean));
  return values.map((candidate) => Object.fromEntries(headers.map((header, index) => [header, candidate[index] ?? ''])));
}

function loadSourceTables(repositoryRoot) {
  return {
    manifest: parseCsv(readFileSync(path.join(repositoryRoot, 'data/manifests/source_manifest.csv'), 'utf8')),
    crosswalk: parseCsv(readFileSync(path.join(repositoryRoot, 'data/scenarios/design/condition-crosswalk.csv'), 'utf8')),
    candidates: parseCsv(readFileSync(path.join(repositoryRoot, 'data/scenarios/design/candidate-zenodo-windows.csv'), 'utf8')),
  };
}

const products = [
  ['PROD-DEMO-VACCINE', 'Demo vaccine reference', 'VACCINE'],
  ['PROD-DEMO-BIOLOGIC', 'Demo biologic reference', 'BIOLOGIC'],
  ['PROD-DEMO-DIAGNOSTIC', 'Demo diagnostic reagent reference', 'DIAGNOSTIC_REAGENT'],
  ['PROD-DEMO-MEDICINE', 'Demo temperature-sensitive medicine reference', 'MEDICINE'],
  ['PROD-DEMO-REFERENCE', 'Demo controlled-healthcare reference', 'REFERENCE_MATERIAL'],
].map(([product_id, display_name, product_category]) => ({
  product_id,
  display_name,
  product_category,
  origin: 'SYNTHETIC_DEMO_CONTEXT',
  verification_status: 'SYNTHETIC_DEMO_REFERENCE',
  manufacturer: null,
  storage_claim: null,
  notes: 'Not a claim about a commercial product or manufacturer.',
}));

const locations = [
  ['LOC-HCM', 'Ho Chi Minh City pharmaceutical distribution hub — DEMO', 'Ho Chi Minh City'],
  ['LOC-THU-DUC', 'Thu Duc demo hospital', 'Thu Duc'],
  ['LOC-BINH-DUONG', 'Binh Duong provincial cold hub — DEMO', 'Binh Duong'],
  ['LOC-DONG-NAI', 'Dong Nai demo vaccination center', 'Dong Nai'],
  ['LOC-LONG-AN', 'Long An provincial hub — DEMO', 'Long An'],
  ['LOC-TIEN-GIANG', 'Tien Giang demo clinic', 'Tien Giang'],
  ['LOC-CAN-THO', 'Can Tho vaccination center 01 — DEMO', 'Can Tho'],
  ['LOC-DA-NANG', 'Da Nang central cold hub — DEMO', 'Da Nang'],
  ['LOC-HUE', 'Hue demo hospital', 'Hue'],
  ['LOC-HANOI', 'Northern cold warehouse — DEMO', 'Hanoi'],
  ['LOC-HAI-PHONG', 'Hai Phong demo hospital', 'Hai Phong'],
  ['LOC-BAC-NINH', 'Bac Ninh demo clinic', 'Bac Ninh'],
  ['LOC-NGHE-AN', 'Nghe An provincial hub — DEMO', 'Nghe An'],
].map(([location_id, location_name, province_or_city]) => ({
  location_id,
  location_name,
  province_or_city,
  country_code: 'VN',
  origin: 'SYNTHETIC_DEMO_CONTEXT',
}));

const routes = [
  ['ROUTE-HCM-THU-DUC', 'SHORT_URBAN_DELIVERY', ['LOC-HCM', 'LOC-THU-DUC']],
  ['ROUTE-HCM-BINH-DUONG', 'WAREHOUSE_TO_HOSPITAL', ['LOC-HCM', 'LOC-BINH-DUONG']],
  ['ROUTE-HCM-DONG-NAI', 'WAREHOUSE_TO_VACCINATION_CENTER', ['LOC-HCM', 'LOC-DONG-NAI']],
  ['ROUTE-HCM-LONG-AN-CAN-THO', 'MULTI_STOP_ROUTE', ['LOC-HCM', 'LOC-LONG-AN', 'LOC-CAN-THO']],
  ['ROUTE-LONG-AN-TIEN-GIANG-CAN-THO', 'HANDOVER_ROUTE', ['LOC-LONG-AN', 'LOC-TIEN-GIANG', 'LOC-CAN-THO']],
  ['ROUTE-DA-NANG-HUE', 'INTER_PROVINCIAL_DELIVERY', ['LOC-DA-NANG', 'LOC-HUE']],
  ['ROUTE-HANOI-HAI-PHONG', 'CENTRAL_TO_PROVINCIAL_HUB', ['LOC-HANOI', 'LOC-HAI-PHONG']],
  ['ROUTE-HANOI-BAC-NINH', 'PROVINCIAL_HUB_TO_CLINIC', ['LOC-HANOI', 'LOC-BAC-NINH']],
  ['ROUTE-HANOI-NGHE-AN', 'LONG_INTER_PROVINCIAL_DELIVERY', ['LOC-HANOI', 'LOC-NGHE-AN']],
  ['ROUTE-HCM-LONG-AN', 'PROVINCIAL_HUB_TRANSFER', ['LOC-HCM', 'LOC-LONG-AN']],
  ['ROUTE-CAN-THO-TIEN-GIANG', 'CLINIC_REPLENISHMENT', ['LOC-CAN-THO', 'LOC-TIEN-GIANG']],
  ['ROUTE-DA-NANG-HUE-HANOI', 'MULTI_HUB_REFERENCE_ROUTE', ['LOC-DA-NANG', 'LOC-HUE', 'LOC-HANOI']],
].map(([route_id, route_type, stop_location_ids]) => ({
  route_id,
  route_type,
  stop_location_ids,
  origin: 'SYNTHETIC_DEMO_CONTEXT',
  operational_claim: 'NONE',
}));

const zenodoWindows = [
  ['SENSOR01', '2024-09-06T12:00:00', '2024-09-06T15:00:00', 'row:70964', 'row:73123', 'OBSERVED_CONTINUOUS'],
  ['SENSOR02', '2024-09-06T11:45:00', '2024-09-06T14:45:00', 'row:70786', 'row:72945', 'LONG_ROUTE_NORMAL'],
  ['SENSOR08', '2024-09-04T07:45:00', '2024-09-04T10:45:00', 'row:33237', 'row:35396', 'HIGH_TEMP_PATTERN'],
  ['SENSOR06', '2024-09-04T08:00:00', '2024-09-04T11:00:00', 'row:33459', 'row:35618', 'HANDOVER_BOUNDARY'],
  ['SENSOR09', '2024-09-10T07:30:00', '2024-09-10T10:30:00', 'row:12602', 'row:14761', 'OBSERVED_THERMAL_VARIATION'],
  ['SENSOR04', '2024-09-04T07:45:00', '2024-09-04T10:45:00', 'row:33317', 'row:35476', 'OBSERVED_CONTINUOUS'],
  ['SENSOR07', '2024-09-04T08:15:00', '2024-09-04T11:15:00', 'row:33620', 'row:35779', 'LONG_ROUTE_NORMAL'],
  ['SENSOR03', '2024-09-09T08:00:00', '2024-09-09T11:00:00', 'row:47435', 'row:49594', 'OBSERVED_THERMAL_VARIATION'],
];

const simulatedSpecs = [
  ['VNHC-009', 'NORMAL', 'LOGGER_A', 42, 3000, 'GOLDEN_NORMAL'],
  ['VNHC-010', 'DUPLICATE', 'LOGGER_A', 43, 2000, 'GOLDEN_DUPLICATE'],
  ['VNHC-011', 'CONFLICT', 'LOGGER_A', 44, 2000, 'GOLDEN_CONFLICT'],
  ['VNHC-012', 'OUT_OF_ORDER', 'LOGGER_B', 45, 1500, null],
  ['VNHC-013', 'GAP', 'LOGGER_A', 46, 2000, 'GOLDEN_GAP'],
  ['VNHC-014', 'MULTI_GAP', 'LOGGER_B', 47, 2000, null],
  ['VNHC-015', 'HIGH_TEMP_PATTERN', 'LOGGER_A', 48, 2200, null],
  ['VNHC-016', 'LOW_TEMP_PATTERN', 'LOGGER_B', 49, 1800, null],
  ['VNHC-017', 'MISSING_TEMPERATURE', 'LOGGER_A', 50, 1, null],
  ['VNHC-018', 'INVALID_TEMPERATURE', 'LOGGER_B', 51, 1, null],
  ['VNHC-019', 'INVALID_TIMESTAMP', 'LOGGER_A', 52, 1, null],
  ['VNHC-020', 'TIMEZONE_CONTEXT_REQUIRED', 'LOGGER_B', 53, 1, 'GOLDEN_TIMEZONE'],
  ['VNHC-021', 'DEVICE_IDENTITY_MISMATCH', 'LOGGER_A', 54, 1, null],
  ['VNHC-022', 'CHECKSUM_MISMATCH', 'LOGGER_A', 55, 1, null],
];

const expectedByProfile = {
  NORMAL: ['PASS', []],
  DUPLICATE: ['FLAGGED', ['DUPLICATE_RECORD']],
  CONFLICT: ['FLAGGED', ['CONFLICTING_RECORD']],
  OUT_OF_ORDER: ['FLAGGED', ['OUT_OF_ORDER_RECORD']],
  GAP: ['FLAGGED', ['MISSING_INTERVAL']],
  MULTI_GAP: ['FLAGGED', ['MISSING_INTERVAL']],
  HIGH_TEMP_PATTERN: ['PASS', []],
  LOW_TEMP_PATTERN: ['PASS', []],
  MISSING_TEMPERATURE: ['NOT_ASSESSED', ['MISSING_TEMPERATURE']],
  INVALID_TEMPERATURE: ['NOT_ASSESSED', ['INVALID_TEMPERATURE']],
  INVALID_TIMESTAMP: ['NOT_ASSESSED', ['INVALID_TIMESTAMP']],
  TIMEZONE_CONTEXT_REQUIRED: ['NOT_ASSESSED', ['TIMEZONE_CONTEXT_REQUIRED']],
  DEVICE_IDENTITY_MISMATCH: ['NOT_ASSESSED', ['DEVICE_IDENTITY_MISMATCH']],
  CHECKSUM_MISMATCH: ['NOT_ASSESSED', ['RAW_PAYLOAD_CHECKSUM_MISMATCH']],
  MULTI_DEVICE: ['PASS', []],
  HANDOVER_BOUNDARY: ['PASS', []],
  HANDOVER_WITH_GAP: ['FLAGGED', ['MISSING_INTERVAL']],
  MIXED_LOGGER_FORMATS: ['PASS', []],
};

function manifestEntry(manifest, sourceId) {
  const entry = manifest.find((candidate) => candidate.source_id === sourceId);
  if (!entry) throw new Error(`Missing source manifest entry: ${sourceId}`);
  return entry;
}

function logisticsContext(id, index) {
  return {
    batch_id: `BATCH-${id}`,
    shipment_id: `SHIP-${id}`,
    trip_id: `TRIP-${id}`,
    origin: 'SYNTHETIC_DEMO_CONTEXT',
    sender_receiver_relation: { origin: 'SYNTHETIC_DEMO_CONTEXT' },
    lot_number: { value: `LOT-${id}`, origin: 'SYNTHETIC_DEMO_CONTEXT' },
    association: {
      status: index % 7 === 0 ? 'UNASSIGNED' : 'ASSIGNED',
      method: index % 7 === 0 ? null : 'IMPORT_CONTEXT',
      resolver_origin: 'SYNTHETIC_DEMO_CONTEXT',
    },
  };
}

function baseScenario(id, family, index, profile) {
  return {
    scenario_id: id,
    scenario_name: `${profile.replaceAll('_', ' ').toLowerCase()} — Vietnam healthcare demo`,
    scenario_family: family,
    description: 'Deterministic ColdProof software test scenario with explicitly synthetic Vietnam healthcare logistics context.',
    scenario_origin: 'SYNTHETIC_DEMO_CONTEXT',
    product_reference_id: products[index % products.length].product_id,
    route_id: routes[index % routes.length].route_id,
    business_context: logisticsContext(id, index),
    data_profile: profile,
    labels: ['VIETNAM_HEALTHCARE_DEMO', family, profile],
  };
}

function mendeleyReference(conditionId, manifest, crosswalk) {
  const source = manifestEntry(manifest, `MEN-${conditionId}`);
  const condition = crosswalk.find((candidate) => candidate.condition_id === conditionId);
  if (!condition) throw new Error(`Missing Mendeley crosswalk entry: ${conditionId}`);
  return {
    dataset: 'Average temperature in an insulated box',
    dataset_id: 'sz5dgkz7k8',
    doi: MENDELEY_DOI,
    version: '1',
    source_id: source.source_id,
    source_file: source.file_name,
    source_checksum_sha256: source.checksum_sha256,
    condition_id: conditionId,
    condition_semantics: 'EXPERIMENTAL_CONDITION',
    semantic_status: condition.verification_status,
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
    source_manifest_ref: 'data/manifests/source_manifest.csv',
    crosswalk_ref: 'data/scenarios/design/condition-crosswalk.csv',
  };
}

function loggerConfig(id, format, seed, count, suffix = '') {
  const device = `${format === 'LOGGER_A' ? 'LOGGER-A' : 'B'}-VN-${id.slice(-3)}${suffix}`;
  const config = {
    format,
    device_id: device,
    seed,
    count,
    start_time: format === 'LOGGER_A' ? '2026-10-10T06:00:00+07:00' : '2026-10-10T06:00:00',
    cadence_ms: 5000,
    measurement_origin: 'SYNTHETIC',
  };
  if (format === 'LOGGER_B') {
    config.format_origin = 'VENDOR_INSPIRED';
    config.timezone_context = {
      utc_offset: '+07:00',
      origin: 'NORMALIZATION_CONFIGURATION',
    };
  }
  return config;
}

function expected(profile, rawCount, canonicalCount, deviceCount = 1) {
  const [dq, codes] = expectedByProfile[profile] ?? ['PASS', []];
  const normalization = dq === 'NOT_ASSESSED' ? 'FAILURE' : 'SUCCESS';
  return {
    normalization_expected: normalization,
    dq_status_expected: dq,
    expected_finding_codes: codes,
    expected_raw_record_count: rawCount,
    expected_canonical_record_count: canonicalCount,
    expected_device_count: deviceCount,
    timezone_context_required: profile === 'TIMEZONE_CONTEXT_REQUIRED',
    temperature_pattern_is_excursion_conclusion: false,
  };
}

function simulatedScenario(spec, index) {
  const [id, profile, format, seed, count, goldenLabel] = spec;
  const scenario = baseScenario(id, 'SIMULATED_RUNTIME', index + 8, profile);
  const rawDelta = profile === 'DUPLICATE' || profile === 'CONFLICT' ? 1 : profile === 'GAP' ? -1 : profile === 'MULTI_GAP' ? -2 : 0;
  const blocked = expectedByProfile[profile][0] === 'NOT_ASSESSED';
  const config = loggerConfig(id, format, seed, count);
  if (profile === 'TIMEZONE_CONTEXT_REQUIRED') delete config.timezone_context;
  return {
    ...scenario,
    golden: goldenLabel !== null,
    golden_label: goldenLabel,
    measurement_source: {
      kind: 'SIMULATED_LOGGER',
      measurement_origin: 'SYNTHETIC',
      logger_configs: [config],
      anomaly_injection: { profile, origin: 'SYNTHETIC_TEST_PROFILE', generator_version: GENERATOR_VERSION },
      used_for_dq: true,
      used_for_excursion_calculation: false,
    },
    supplemental_context: [],
    expected: expected(profile, count + rawDelta, blocked ? 0 : count + rawDelta),
    provenance: {
      simulator: '@coldproof/simulated-logger',
      normalizer: '@coldproof/logger-normalizer',
      dq_policy: 'runtime-dq-v1',
      scenario_generator: GENERATOR_VERSION,
    },
  };
}

function buildDefinitions(manifest, crosswalk) {
  const scenarios = [];
  zenodoWindows.forEach(([sensor, start, end, firstRef, lastRef, profile], index) => {
    const id = `VNHC-${String(index + 1).padStart(3, '0')}`;
    const source = manifestEntry(manifest, `ZEN-RAW-S${sensor.slice(-2)}`);
    scenarios.push({
      ...baseScenario(id, 'ZENODO_OBSERVED_BACKED', index, profile),
      golden: false,
      golden_label: null,
      measurement_source: {
        kind: 'ZENODO_WINDOW',
        dataset: 'Temperature and Humidity Time Series of Cold Storage Room Monitoring',
        doi: ZENODO_DOI,
        version: 'v1',
        source_id: source.source_id,
        source_file: source.file_name,
        source_checksum_sha256: source.checksum_sha256,
        sensor_id: sensor,
        window: {
          start,
          end,
          interval_semantics: '[start,end)',
          timezone_status: 'UNKNOWN_SOURCE_LOCAL',
          observation_count: 2160,
          first_source_ref: firstRef,
          last_source_ref: lastRef,
        },
        cadence_ms: 5000,
        measurement_origin: 'REAL_PUBLIC_DATA',
        candidate_id: `ZEN-${sensor.slice(-2)}-${start.replaceAll('-', '').replaceAll(':', '').replace('T', 'T')}-180M`,
        candidate_representation_observation_count: 2161,
        half_open_window_observation_count: 2160,
        selection_method: 'evidence-selection-v1-candidate-window',
        selection_artifact_ref: 'data/scenarios/design/candidate-zenodo-windows.csv',
        source_manifest_ref: 'data/manifests/source_manifest.csv',
        parser_id: 'zenodo-cold-storage',
        parser_version: '1.0.0',
        used_for_dq: true,
        used_for_excursion_calculation: false,
      },
      supplemental_context: [],
      expected: {
        normalization_expected: 'PRE_NORMALIZED_PUBLIC_EVIDENCE',
        dq_status_expected: 'PASS',
        expected_finding_codes: [],
        expected_raw_record_count: 2160,
        expected_canonical_record_count: 2160,
        expected_device_count: 1,
        timezone_context_required: false,
        temperature_pattern_is_excursion_conclusion: false,
      },
      provenance: {
        primary_origin: 'REAL_PUBLIC_DATA',
        logistics_context_origin: 'SYNTHETIC_DEMO_CONTEXT',
        scenario_generator: GENERATOR_VERSION,
      },
    });
  });
  simulatedSpecs.forEach((spec, index) => scenarios.push(simulatedScenario(spec, index)));

  const combined = [
    ['VNHC-023', 'MULTI_DEVICE', [loggerConfig('VNHC-023', 'LOGGER_B', 61, 1500, '-A'), loggerConfig('VNHC-023', 'LOGGER_B', 62, 1500, '-B')], ['C04']],
    ['VNHC-024', 'HANDOVER_BOUNDARY', [loggerConfig('VNHC-024', 'LOGGER_A', 63, 2400)], ['C07']],
    ['VNHC-025', 'HANDOVER_WITH_GAP', [loggerConfig('VNHC-025', 'LOGGER_A', 64, 1800)], ['C08', 'C12']],
    ['VNHC-026', 'MIXED_LOGGER_FORMATS', [loggerConfig('VNHC-026', 'LOGGER_A', 65, 1000, '-A'), loggerConfig('VNHC-026', 'LOGGER_B', 66, 1000, '-B')], ['C05', 'C10']],
  ];
  combined.forEach(([id, profile, configs, conditions], index) => {
    const baseCount = configs.reduce((sum, config) => sum + config.count, 0);
    const rawCount = profile === 'HANDOVER_WITH_GAP' ? baseCount - 1 : baseCount;
    scenarios.push({
      ...baseScenario(id, 'COMBINED_REFERENCE_CONTEXT', index + 22, profile),
      golden: false,
      golden_label: null,
      measurement_source: {
        kind: 'SIMULATED_LOGGER',
        measurement_origin: 'SYNTHETIC',
        logger_configs: configs,
        anomaly_injection: { profile, origin: 'SYNTHETIC_TEST_PROFILE', generator_version: GENERATOR_VERSION },
        used_for_dq: true,
        used_for_excursion_calculation: false,
      },
      supplemental_context: conditions.map((condition) => mendeleyReference(condition, manifest, crosswalk)),
      expected: expected(profile, rawCount, rawCount, configs.length),
      provenance: {
        primary_origin: 'SYNTHETIC',
        supplemental_origin: 'REAL_PUBLIC_DATA',
        relation_origin: 'SYNTHETIC',
        simulator: '@coldproof/simulated-logger',
        normalizer: '@coldproof/logger-normalizer',
        dq_policy: 'runtime-dq-v1',
        scenario_generator: GENERATOR_VERSION,
      },
    });
  });

  [['VNHC-027', ['C01', 'C04', 'C07']], ['VNHC-028', ['C08', 'C10', 'C13']]].forEach(([id, conditions], index) => {
    scenarios.push({
      ...baseScenario(id, 'MENDELEY_CONTEXT_ONLY', index + 26, 'SPATIAL_REFERENCE_ONLY'),
      golden: false,
      golden_label: null,
      measurement_source: {
        kind: 'MENDELEY_CONTEXT_ONLY',
        runtime_timeline: false,
        measurement_origin: 'REAL_PUBLIC_DATA',
        used_for_dq: false,
        used_for_excursion_calculation: false,
        conditions: conditions.map((condition) => mendeleyReference(condition, manifest, crosswalk)),
      },
      supplemental_context: [],
      expected: {
        normalization_expected: 'NOT_APPLICABLE_SPATIAL_REFERENCE',
        dq_status_expected: 'NOT_ASSESSED',
        expected_finding_codes: [],
        expected_raw_record_count: 0,
        expected_canonical_record_count: 0,
        expected_device_count: 0,
        timezone_context_required: false,
        temperature_pattern_is_excursion_conclusion: false,
      },
      provenance: {
        primary_origin: 'REAL_PUBLIC_DATA',
        logistics_context_origin: 'SYNTHETIC_DEMO_CONTEXT',
        scenario_generator: GENERATOR_VERSION,
      },
    });
  });

  const qaCases = {
    'VNHC-001': 'CANONICAL_VALID_DQ_PASS_TRIP_UNASSIGNED',
    'VNHC-009': 'RAW_CANONICAL_DQ_PASS_TRIP_ASSIGNED',
    'VNHC-011': 'RAW_CANONICAL_DQ_FLAGGED_TRIP_ASSIGNED',
    'VNHC-013': 'RAW_CANONICAL_DQ_FLAGGED_GAP_TRIP_ASSIGNED',
    'VNHC-020': 'LOGGER_B_BLOCKED_PENDING_TIMEZONE_CONTEXT',
    'VNHC-022': 'RAW_CHECKSUM_MISMATCH_NO_CANONICAL',
    'VNHC-023': 'MENDELEY_CONTEXT_VISIBLE_NOT_USED_FOR_DQ',
  };
  scenarios.forEach((scenario) => {
    scenario.test_profiles = scenario.scenario_id === 'VNHC-025'
      ? [scenario.data_profile, 'LONG_ROUTE_WITH_ANOMALY']
      : [scenario.data_profile];
    scenario.qa_display_case = qaCases[scenario.scenario_id] ?? null;
    if (scenario.data_profile === 'HANDOVER_BOUNDARY' || scenario.data_profile === 'HANDOVER_WITH_GAP') {
      scenario.business_context.handover_boundaries = [{
        timestamp: '2026-10-10T07:00:00+07:00',
        origin: 'SYNTHETIC_DEMO_CONTEXT',
        thermal_event_termination_semantics: 'NONE',
      }];
    }
  });

  const catalog = {
    catalog_id: 'VIETNAM_HEALTHCARE_DEMO_SCENARIOS',
    catalog_version: CATALOG_VERSION,
    generator_version: GENERATOR_VERSION,
    status: 'DEMO_TEST_DATA',
    scenario_count: scenarios.length,
    scenario_ids: scenarios.map((scenario) => scenario.scenario_id),
    scenario_family_counts: Object.fromEntries(['ZENODO_OBSERVED_BACKED', 'SIMULATED_RUNTIME', 'COMBINED_REFERENCE_CONTEXT', 'MENDELEY_CONTEXT_ONLY'].map((family) => [family, scenarios.filter((scenario) => scenario.scenario_family === family).length])),
    public_source_roles: {
      zenodo: 'REAL_OBSERVED_TIME_SERIES_SOURCE',
      mendeley: 'REAL_OBSERVED_EXPERIMENTAL_SPATIAL_CONTEXT_SOURCE',
    },
    synthetic_context_rule: 'Public physical data does not make synthetic shipment relationships real.',
  };
  const outcomes = {
    manifest_version: '1.0.0',
    scenario_generator_version: GENERATOR_VERSION,
    scenarios: scenarios.map((scenario) => ({
      scenario_id: scenario.scenario_id,
      normalization_expected: scenario.expected.normalization_expected,
      dq_status_expected: scenario.expected.dq_status_expected,
      expected_finding_codes: scenario.expected.expected_finding_codes,
      expected_raw_record_count: scenario.expected.expected_raw_record_count,
      expected_canonical_record_count: scenario.expected.expected_canonical_record_count,
      expected_device_count: scenario.expected.expected_device_count,
      timezone_context_required: scenario.expected.timezone_context_required,
      trip_context_origin: 'SYNTHETIC_DEMO_CONTEXT',
      measurement_origin: scenario.measurement_source.measurement_origin,
      supplemental_context_origin: scenario.supplemental_context.length > 0 ? 'REAL_PUBLIC_DATA_WITH_SYNTHETIC_RELATION' : 'NONE',
    })),
  };
  return { catalog, products: { catalog_version: CATALOG_VERSION, products }, locations: { catalog_version: CATALOG_VERSION, locations }, routes: { catalog_version: CATALOG_VERSION, routes }, scenarios, outcomes };
}

function validateDefinitions(definitions, manifest, crosswalk, candidates = []) {
  const errors = [];
  const { catalog, products: productCatalog, locations: locationCatalog, routes: routeCatalog, scenarios, outcomes } = definitions;
  const ids = scenarios.map((scenario) => scenario.scenario_id);
  if (scenarios.length < 24) errors.push('At least 24 scenarios are required');
  if (new Set(ids).size !== ids.length) errors.push('Scenario IDs must be unique');
  if (catalog.scenario_count !== scenarios.length || JSON.stringify(catalog.scenario_ids) !== JSON.stringify(ids)) errors.push('Catalog index does not match scenarios');
  const productIds = new Set(productCatalog.products.map((product) => product.product_id));
  const locationIds = new Set(locationCatalog.locations.map((location) => location.location_id));
  const routeIds = new Set(routeCatalog.routes.map((route) => route.route_id));
  routeCatalog.routes.forEach((route) => route.stop_location_ids.forEach((id) => { if (!locationIds.has(id)) errors.push(`${route.route_id} references unknown location ${id}`); }));
  const familyMinimums = { ZENODO_OBSERVED_BACKED: 8, SIMULATED_RUNTIME: 10, COMBINED_REFERENCE_CONTEXT: 4, MENDELEY_CONTEXT_ONLY: 2 };
  Object.entries(familyMinimums).forEach(([family, minimum]) => { if (scenarios.filter((scenario) => scenario.scenario_family === family).length < minimum) errors.push(`${family} requires at least ${minimum} scenarios`); });
  scenarios.forEach((scenario) => {
    if (!productIds.has(scenario.product_reference_id)) errors.push(`${scenario.scenario_id} references unknown product`);
    if (!routeIds.has(scenario.route_id)) errors.push(`${scenario.scenario_id} references unknown route`);
    if (scenario.scenario_origin !== 'SYNTHETIC_DEMO_CONTEXT' || scenario.business_context.origin !== 'SYNTHETIC_DEMO_CONTEXT') errors.push(`${scenario.scenario_id} has invalid business origin`);
    if (scenario.business_context.association.resolver_origin !== 'SYNTHETIC_DEMO_CONTEXT') errors.push(`${scenario.scenario_id} has invalid trip resolver origin`);
    scenario.expected.expected_finding_codes.forEach((code) => {
      if (scenario.expected.dq_status_expected !== 'NOT_ASSESSED' && !EXPECTED_FINDING_CODES.has(code)) errors.push(`${scenario.scenario_id} has invalid DQ code ${code}`);
    });
    const mendeley = scenario.measurement_source.kind === 'MENDELEY_CONTEXT_ONLY' ? scenario.measurement_source.conditions : scenario.supplemental_context;
    mendeley.forEach((reference) => {
      const source = manifest.find((entry) => entry.source_id === reference.source_id);
      const condition = crosswalk.find((entry) => entry.condition_id === reference.condition_id);
      if (!source || source.checksum_sha256 !== reference.source_checksum_sha256 || !condition) errors.push(`${scenario.scenario_id} has unresolved Mendeley source ${reference.condition_id}`);
      if (reference.relation_type !== 'ILLUSTRATIVE_CONTEXT' || reference.relation_origin !== 'SYNTHETIC' || reference.used_for_excursion_calculation !== false || reference.used_for_dq !== false || reference.timestamp_status !== 'NOT_APPLICABLE' || reference.device_interpretation !== 'NONE' || reference.causal_claim !== 'NONE' || reference.same_time_claim !== 'NONE' || reference.same_goods_claim !== 'NONE' || reference.same_environment_claim !== 'NONE') errors.push(`${scenario.scenario_id} violates Mendeley combination rules`);
      if ('timestamp' in reference || 'device_id' in reference) errors.push(`${scenario.scenario_id} fabricates Mendeley time/device semantics`);
    });
    if (scenario.measurement_source.kind === 'ZENODO_WINDOW') {
      const source = manifest.find((entry) => entry.source_id === scenario.measurement_source.source_id);
      const candidate = candidates.find((entry) => entry.candidate_id === scenario.measurement_source.candidate_id);
      if (!source || source.checksum_sha256 !== scenario.measurement_source.source_checksum_sha256) errors.push(`${scenario.scenario_id} has invalid Zenodo provenance`);
      if (scenario.measurement_source.window.interval_semantics !== '[start,end)' || scenario.measurement_source.window.timezone_status !== 'UNKNOWN_SOURCE_LOCAL') errors.push(`${scenario.scenario_id} alters Zenodo time semantics`);
      if (!candidate || candidate.sensor_id !== scenario.measurement_source.sensor_id || candidate.source_file !== scenario.measurement_source.source_file || candidate.start_timestamp !== scenario.measurement_source.window.start || candidate.end_timestamp !== scenario.measurement_source.window.end || candidate.expected_interval_seconds !== '5' || candidate.internal_missing_interval_count !== '0' || candidate.duplicate_timestamp_count !== '0' || candidate.out_of_order_count !== '0' || Number(candidate.observation_count) - 1 !== scenario.measurement_source.window.observation_count) errors.push(`${scenario.scenario_id} does not resolve to a clean deterministic Zenodo candidate`);
    }
    if (scenario.measurement_source.kind === 'SIMULATED_LOGGER') {
      scenario.measurement_source.logger_configs.forEach((config) => {
        if (!['LOGGER_A', 'LOGGER_B'].includes(config.format) || !Number.isInteger(config.seed) || !Number.isInteger(config.count) || config.count <= 0 || !Number.isFinite(config.cadence_ms) || config.cadence_ms <= 0) errors.push(`${scenario.scenario_id} has invalid simulator configuration`);
        if (config.format === 'LOGGER_A' && !/(Z|[+-]\d{2}:\d{2})$/.test(config.start_time)) errors.push(`${scenario.scenario_id} LOGGER_A requires an offset-bearing start time`);
        if (config.format === 'LOGGER_B' && (config.start_time.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(config.start_time))) errors.push(`${scenario.scenario_id} fabricates LOGGER_B timezone data`);
        if (config.format === 'LOGGER_B' && config.format_origin !== 'VENDOR_INSPIRED') errors.push(`${scenario.scenario_id} must label LOGGER_B vendor-inspired`);
      });
    }
    if (scenario.expected.dq_status_expected === 'PASS' && scenario.expected.normalization_expected === 'FAILURE') errors.push(`${scenario.scenario_id} cannot be DQ PASS after normalization failure`);
  });
  if (outcomes.scenarios.length !== scenarios.length) errors.push('Expected outcome manifest count mismatch');
  return { success: errors.length === 0, errors };
}

function summaryMarkdown(definitions) {
  const header = `# Vietnam Healthcare Demo Scenario Catalog v${CATALOG_VERSION}\n\nThis catalog combines real public physical observations with explicitly synthetic Vietnam healthcare/logistics context for software testing. Public physical data does not make synthetic shipment relationships real. Mendeley and Zenodo are never treated as one physical timeline.\n\n| ID | Name | Family | Product | Route | Source | Profile | Expected result | Mendeley context |\n|---|---|---|---|---|---|---|---|---|`;
  const rows = definitions.scenarios.map((scenario) => {
    const source = scenario.measurement_source.kind === 'ZENODO_WINDOW' ? `ZENODO/${scenario.measurement_source.sensor_id}` : scenario.measurement_source.kind === 'SIMULATED_LOGGER' ? scenario.measurement_source.logger_configs.map((config) => config.format).join('+') : 'MENDELEY';
    const conditions = (scenario.measurement_source.kind === 'MENDELEY_CONTEXT_ONLY' ? scenario.measurement_source.conditions : scenario.supplemental_context).map((reference) => reference.condition_id).join(', ') || '—';
    return `| ${scenario.scenario_id} | ${scenario.scenario_name} | ${scenario.scenario_family} | ${scenario.product_reference_id} | ${scenario.route_id} | ${source} | ${scenario.data_profile} | ${scenario.expected.normalization_expected} / ${scenario.expected.dq_status_expected}${scenario.expected.expected_finding_codes.length ? ` (${scenario.expected.expected_finding_codes.join(', ')})` : ''} | ${conditions} |`;
  });
  return `${header}\n${rows.join('\n')}\n`;
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildRawRecord(event, scenarioId, index, options = {}) {
  const originalPayload = JSON.stringify(event.payload);
  const device = event.source_format === 'LOGGER_A' ? event.payload.device_id : event.payload.serial;
  return {
    ingest_id: `ing_${scenarioId.toLowerCase()}_${String(index + 1).padStart(6, '0')}`,
    received_at: '2026-10-10T00:00:00Z',
    source_type: 'SIMULATED_LOGGER',
    source_format: event.source_format,
    origin: 'SYNTHETIC',
    external_device_id: options.externalDeviceId ?? device,
    original_payload: originalPayload,
    content_checksum_sha256: options.badChecksum ? '0'.repeat(64) : createHash('sha256').update(originalPayload, 'utf8').digest('hex'),
    ingestion_metadata: { transport: 'HTTP_JSON', content_type: 'application/json', payload_encoding: 'UTF-8', request_ref: `demo:${scenarioId}` },
  };
}

function applyProfile(events, profile) {
  const output = events.map((event) => structuredClone(event));
  if (profile === 'DUPLICATE') output.splice(2, 0, structuredClone(output[1]));
  if (profile === 'CONFLICT') {
    const conflict = structuredClone(output[1]);
    if (conflict.source_format === 'LOGGER_A') conflict.payload.temperature += 2;
    else conflict.payload.temp_c = String(Number(conflict.payload.temp_c) + 2);
    output.splice(2, 0, conflict);
  }
  if (profile === 'OUT_OF_ORDER' && output.length >= 3) [output[1], output[2]] = [output[2], output[1]];
  if (profile === 'GAP') output.splice(Math.min(2, output.length - 1), 1);
  if (profile === 'HANDOVER_WITH_GAP') output.splice(Math.min(720, output.length - 1), 1);
  if (profile === 'MULTI_GAP') { output.splice(5, 1); output.splice(2, 1); }
  if (profile === 'HIGH_TEMP_PATTERN' || profile === 'LOW_TEMP_PATTERN') {
    output.forEach((event, index) => {
      const value = profile === 'HIGH_TEMP_PATTERN' ? 8.5 + (index % 7) / 10 : 1.5 - (index % 5) / 10;
      if (event.source_format === 'LOGGER_A') event.payload.temperature = value;
      else event.payload.temp_c = value.toFixed(1);
    });
  }
  if (profile === 'MISSING_TEMPERATURE') delete output[0].payload.temperature;
  if (profile === 'INVALID_TEMPERATURE') output[0].payload.temp_c = 'abc';
  if (profile === 'INVALID_TIMESTAMP') output[0].payload.recorded_at = 'invalid';
  return output;
}

async function executeRuntimeScenario(scenario, dependencies) {
  if (scenario.measurement_source.kind !== 'SIMULATED_LOGGER') throw new Error(`${scenario.scenario_id} does not have a runtime logger source`);
  const rawRecords = [];
  for (const config of scenario.measurement_source.logger_configs) {
    const events = dependencies.generateEvents({ format: config.format, device: config.device_id, count: config.count, seed: config.seed, startTime: config.start_time, cadenceMs: config.cadence_ms });
    rawRecords.push(...applyProfile(events, scenario.data_profile));
  }
  const processing = rawRecords.map((event, index) => buildRawRecord(event, scenario.scenario_id, index, {
    badChecksum: scenario.data_profile === 'CHECKSUM_MISMATCH',
    externalDeviceId: scenario.data_profile === 'DEVICE_IDENTITY_MISMATCH' ? 'MISMATCHED-DEVICE' : undefined,
  })).map((raw) => {
    const config = scenario.measurement_source.logger_configs.find((candidate) => candidate.device_id === raw.external_device_id) ?? scenario.measurement_source.logger_configs[0];
    const context = config.timezone_context ? { normalization_context: { timezone: config.timezone_context } } : {};
    return { raw, result: dependencies.processLoggerIngest(raw, context) };
  });
  const measurements = processing.flatMap(({ result }) => result.success ? [result.normalization.measurement] : []);
  const dq = processing.some(({ result }) => !result.success) ? null : dependencies.assessProcessedSequence(measurements, { expected_interval_ms: 5000, tolerance_ms: 0 });
  return { scenario_id: scenario.scenario_id, raw_records: processing.map(({ raw }) => raw), processing_results: processing.map(({ result }) => result), canonical_measurements: measurements, dq };
}

module.exports = { CATALOG_VERSION, GENERATOR_VERSION, parseCsv, loadSourceTables, buildDefinitions, validateDefinitions, summaryMarkdown, canonicalJson, buildRawRecord, applyProfile, executeRuntimeScenario };
