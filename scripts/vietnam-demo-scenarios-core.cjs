// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require('node:crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('node:fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');

const CATALOG_VERSION = '2.1.0';
const GENERATOR_VERSION = 'vietnam-healthcare-demo-v2.1';
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
  {
    product_id: 'PROD-DEMO-VACCINE',
    public_reference_code: 'PROD-REF-VAXIGRIP-TETRA',
    display_name: 'Vaxigrip Tetra',
    manufacturer: null,
    manufacturer_verification_status: 'NOT_RECORDED',
    source_reference: {
      publisher: 'Sanofi',
      title: 'Professional informations — VAXIGRIP TETRA',
      url_or_identifier: 'https://www.sanofi.com/en/south-africa/professional-informations',
    },
  },
  {
    product_id: 'PROD-DEMO-BIOLOGIC',
    public_reference_code: 'PROD-REF-INFLUVAC-TETRA',
    display_name: 'Influvac Tetra',
    manufacturer: 'Abbott Biologicals B.V.',
    manufacturer_verification_status: 'VERIFIED',
    source_reference: {
      publisher: 'Singapore National Drug Formulary',
      title: 'INFLUVAC TETRA product information — SIN15591P',
      url_or_identifier: 'https://www.ndf.gov.sg/about-drugs/product-information/sin15591p/',
    },
  },
  {
    product_id: 'PROD-DEMO-DIAGNOSTIC',
    public_reference_code: 'PROD-REF-GARDASIL-9',
    display_name: 'Gardasil 9',
    manufacturer: 'Merck Sharp & Dohme LLC',
    manufacturer_verification_status: 'VERIFIED',
    source_reference: {
      publisher: 'U.S. Food and Drug Administration',
      title: 'GARDASIL 9',
      url_or_identifier: 'https://www.fda.gov/vaccines-blood-biologics/vaccines/gardasil-9',
    },
  },
  {
    product_id: 'PROD-DEMO-MEDICINE',
    public_reference_code: 'PROD-REF-PREVENAR-13',
    display_name: 'Prevenar 13',
    manufacturer: null,
    manufacturer_verification_status: 'NOT_RECORDED',
    source_reference: {
      publisher: 'Pfizer',
      title: 'Prevenar 13 product information',
      url_or_identifier: 'https://labeling.pfizer.com/ShowLabeling.aspx?id=15296',
    },
  },
  {
    product_id: 'PROD-DEMO-REFERENCE',
    public_reference_code: 'PROD-REF-PREVENAR-20',
    display_name: 'Prevenar 20',
    manufacturer: null,
    manufacturer_verification_status: 'NOT_RECORDED',
    source_reference: {
      publisher: 'Pfizer',
      title: 'Prevenar 20 product information',
      url_or_identifier: 'https://labeling.pfizer.com/ShowLabeling.aspx?id=17862',
    },
  },
].map((product) => ({
  ...product,
  product_category: 'VACCINE',
  reference_origin: 'PUBLIC_PRODUCT_REFERENCE',
  verification_status: 'VERIFIED',
  identity_verification_method: 'OFFICIAL_PUBLIC_SOURCE',
  identity_verified_on: '2026-10-10',
  storage_claim: null,
  regulatory_claim: null,
  notes: 'Danh tính sản phẩm là tham chiếu công khai; mọi lô hàng trong catalog đều là ngữ cảnh demo tổng hợp.',
}));

const locations = [
  ['LOC-HCM', 'Kho phân phối dược phẩm TP.HCM — DEMO', 'Thành phố Hồ Chí Minh', 'DISTRIBUTION_HUB'],
  ['LOC-THU-DUC', 'Bệnh viện Demo Thủ Đức', 'Thủ Đức', 'HOSPITAL'],
  ['LOC-BINH-DUONG', 'Kho lạnh tỉnh Bình Dương — DEMO', 'Bình Dương', 'COLD_STORAGE'],
  ['LOC-DONG-NAI', 'Trung tâm tiêm chủng Đồng Nai 01 — DEMO', 'Đồng Nai', 'VACCINATION_CENTER'],
  ['LOC-LONG-AN', 'Trung tâm phân phối tỉnh Long An — DEMO', 'Long An', 'PROVINCIAL_HUB'],
  ['LOC-TIEN-GIANG', 'Phòng khám Demo Tiền Giang', 'Tiền Giang', 'CLINIC'],
  ['LOC-CAN-THO', 'Trung tâm tiêm chủng Cần Thơ 01 — DEMO', 'Cần Thơ', 'VACCINATION_CENTER'],
  ['LOC-DA-NANG', 'Kho lạnh miền Trung tại Đà Nẵng — DEMO', 'Đà Nẵng', 'COLD_STORAGE'],
  ['LOC-HUE', 'Bệnh viện Demo Huế', 'Huế', 'HOSPITAL'],
  ['LOC-HANOI', 'Kho lạnh miền Bắc tại Hà Nội — DEMO', 'Hà Nội', 'COLD_STORAGE'],
  ['LOC-HAI-PHONG', 'Bệnh viện Demo Hải Phòng', 'Hải Phòng', 'HOSPITAL'],
  ['LOC-BAC-NINH', 'Phòng khám Demo Bắc Ninh', 'Bắc Ninh', 'CLINIC'],
  ['LOC-NGHE-AN', 'Trung tâm phân phối tỉnh Nghệ An — DEMO', 'Nghệ An', 'PROVINCIAL_HUB'],
].map(([location_id, display_name, city, facility_type]) => ({
  location_id,
  display_name,
  city,
  country_code: 'VN',
  facility_type,
  origin: 'SYNTHETIC_DEMO_CONTEXT',
}));

const routes = [
  ['ROUTE-HCM-THU-DUC', 'SHORT_URBAN_DELIVERY', 'TP.HCM → Thủ Đức', ['LOC-HCM', 'LOC-THU-DUC']],
  ['ROUTE-HCM-BINH-DUONG', 'WAREHOUSE_TO_HOSPITAL', 'TP.HCM → Bình Dương', ['LOC-HCM', 'LOC-BINH-DUONG']],
  ['ROUTE-HCM-DONG-NAI', 'WAREHOUSE_TO_VACCINATION_CENTER', 'TP.HCM → Đồng Nai', ['LOC-HCM', 'LOC-DONG-NAI']],
  ['ROUTE-HCM-LONG-AN-CAN-THO', 'MULTI_STOP_ROUTE', 'TP.HCM → Long An → Cần Thơ', ['LOC-HCM', 'LOC-LONG-AN', 'LOC-CAN-THO']],
  ['ROUTE-LONG-AN-TIEN-GIANG-CAN-THO', 'HANDOVER_ROUTE', 'Long An → Tiền Giang → Cần Thơ', ['LOC-LONG-AN', 'LOC-TIEN-GIANG', 'LOC-CAN-THO']],
  ['ROUTE-DA-NANG-HUE', 'INTER_PROVINCIAL_DELIVERY', 'Đà Nẵng → Huế', ['LOC-DA-NANG', 'LOC-HUE']],
  ['ROUTE-HANOI-HAI-PHONG', 'CENTRAL_TO_PROVINCIAL_HUB', 'Hà Nội → Hải Phòng', ['LOC-HANOI', 'LOC-HAI-PHONG']],
  ['ROUTE-HANOI-BAC-NINH', 'PROVINCIAL_HUB_TO_CLINIC', 'Hà Nội → Bắc Ninh', ['LOC-HANOI', 'LOC-BAC-NINH']],
  ['ROUTE-HANOI-NGHE-AN', 'LONG_INTER_PROVINCIAL_DELIVERY', 'Hà Nội → Nghệ An', ['LOC-HANOI', 'LOC-NGHE-AN']],
  ['ROUTE-HCM-LONG-AN', 'PROVINCIAL_HUB_TRANSFER', 'TP.HCM → Long An', ['LOC-HCM', 'LOC-LONG-AN']],
  ['ROUTE-CAN-THO-TIEN-GIANG', 'CLINIC_REPLENISHMENT', 'Cần Thơ → Tiền Giang', ['LOC-CAN-THO', 'LOC-TIEN-GIANG']],
  ['ROUTE-DA-NANG-HUE-HANOI', 'MULTI_HUB_REFERENCE_ROUTE', 'Đà Nẵng → Huế → Hà Nội', ['LOC-DA-NANG', 'LOC-HUE', 'LOC-HANOI']],
].map(([route_id, route_type, display_label, stopLocationIds]) => ({
  route_id,
  route_type,
  display_label,
  origin_location_id: stopLocationIds[0],
  destination_location_id: stopLocationIds.at(-1),
  waypoint_location_ids: stopLocationIds.slice(1, -1),
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

const scenarioNames = {
  'VNHC-001': 'Kho lạnh công cộng SENSOR01 — tuyến TP.HCM → Thủ Đức',
  'VNHC-002': 'Tuyến dài SENSOR02 — TP.HCM → Bình Dương',
  'VNHC-003': 'SENSOR08 — mẫu nhiệt độ cao trên tuyến TP.HCM → Đồng Nai',
  'VNHC-004': 'SENSOR06 — ranh giới bàn giao trên tuyến TP.HCM → Cần Thơ',
  'VNHC-005': 'SENSOR09 — biến thiên nhiệt quan sát trên tuyến nhiều điểm',
  'VNHC-006': 'SENSOR04 — tuyến Đà Nẵng → Huế liên tục',
  'VNHC-007': 'SENSOR07 — tuyến dài Hà Nội → Hải Phòng',
  'VNHC-008': 'SENSOR03 — biến thiên nhiệt trên tuyến Hà Nội → Bắc Ninh',
  'VNHC-009': 'Tuyến giao vaccine nội thành — dữ liệu bình thường',
  'VNHC-010': 'Giao vaccine TP.HCM → Bình Dương — bản ghi trùng lặp',
  'VNHC-011': 'Chuyến giao vaccine Cần Thơ → Tiền Giang — xung đột cùng thời điểm',
  'VNHC-012': 'Hà Nội → Hải Phòng — dữ liệu đến sai thứ tự',
  'VNHC-013': 'TP.HCM → Long An → Cần Thơ — thiếu khoảng dữ liệu logger',
  'VNHC-014': 'TP.HCM → Bình Dương — nhiều khoảng dữ liệu bị thiếu',
  'VNHC-015': 'TP.HCM → Đồng Nai — mẫu nhiệt độ cao',
  'VNHC-016': 'TP.HCM → Long An → Cần Thơ — mẫu nhiệt độ thấp',
  'VNHC-017': 'Long An → Tiền Giang → Cần Thơ — thiếu nhiệt độ',
  'VNHC-018': 'Đà Nẵng → Huế — giá trị nhiệt độ không hợp lệ',
  'VNHC-019': 'Hà Nội → Hải Phòng — dấu thời gian không hợp lệ',
  'VNHC-020': 'Logger B — thiếu ngữ cảnh múi giờ',
  'VNHC-021': 'Hà Nội → Nghệ An — sai định danh thiết bị',
  'VNHC-022': 'TP.HCM → Long An — checksum payload không khớp',
  'VNHC-023': 'Hai logger dự phòng — ngữ cảnh minh họa C04',
  'VNHC-024': 'Tuyến bàn giao Đà Nẵng → Huế → Hà Nội — ngữ cảnh C07',
  'VNHC-025': 'Tuyến có bàn giao và khoảng thiếu — ngữ cảnh C08/C12',
  'VNHC-026': 'LOGGER_A + LOGGER_B — ngữ cảnh minh họa C05/C10',
  'VNHC-027': 'So sánh không gian hộp cách nhiệt — C01/C04/C07',
  'VNHC-028': 'So sánh điều kiện thí nghiệm — C08/C10/C13',
};

const scenarioRouteOverrides = {
  'VNHC-009': 'ROUTE-HCM-THU-DUC',
  'VNHC-010': 'ROUTE-HCM-BINH-DUONG',
  'VNHC-012': 'ROUTE-HANOI-HAI-PHONG',
  'VNHC-013': 'ROUTE-HCM-LONG-AN-CAN-THO',
};

function testMetadata(family, profile) {
  const blocking = new Set(['MISSING_TEMPERATURE', 'INVALID_TEMPERATURE', 'INVALID_TIMESTAMP', 'TIMEZONE_CONTEXT_REQUIRED', 'DEVICE_IDENTITY_MISMATCH', 'CHECKSUM_MISMATCH']);
  const flagged = new Set(['DUPLICATE', 'CONFLICT', 'OUT_OF_ORDER', 'GAP', 'MULTI_GAP', 'HANDOVER_WITH_GAP']);
  if (family === 'MENDELEY_CONTEXT_ONLY') return { test_purposes: ['REFERENCE_CONTEXT', 'FRONTEND_DEMO'], test_severity: 'INFO' };
  if (family === 'COMBINED_REFERENCE_CONTEXT') return { test_purposes: ['REFERENCE_CONTEXT', 'QA_REVIEW', 'FRONTEND_DEMO'], test_severity: flagged.has(profile) ? 'MEDIUM' : 'INFO' };
  if (family === 'ZENODO_OBSERVED_BACKED') return { test_purposes: ['PIPELINE', 'TRIP_ASSOCIATION', 'FRONTEND_DEMO'], test_severity: 'INFO' };
  if (blocking.has(profile)) return { test_purposes: ['NORMALIZATION', 'QA_REVIEW'], test_severity: 'HIGH' };
  if (flagged.has(profile)) return { test_purposes: ['DATA_QUALITY', 'QA_REVIEW'], test_severity: ['CONFLICT', 'OUT_OF_ORDER', 'MULTI_GAP'].includes(profile) ? 'MEDIUM' : 'LOW' };
  return { test_purposes: ['PIPELINE', 'FRONTEND_DEMO'], test_severity: 'INFO' };
}

function logisticsContext(id, index, route) {
  return {
    origin: 'SYNTHETIC_DEMO_CONTEXT',
    batch_context: {
      batch_id: `BATCH-${id}`,
      lot_number: `LOT-${id}`,
      origin: 'SYNTHETIC_DEMO_CONTEXT',
    },
    shipment_context: {
      shipment_id: `SHIP-${id}`,
      origin: 'SYNTHETIC_DEMO_CONTEXT',
    },
    trip_context: {
      trip_id: `TRIP-${id}`,
      origin: 'SYNTHETIC_DEMO_CONTEXT',
    },
    sender_receiver_relation: {
      sender_location_id: route.origin_location_id,
      receiver_location_id: route.destination_location_id,
      origin: 'SYNTHETIC_DEMO_CONTEXT',
    },
    association: {
      status: index % 7 === 0 ? 'UNASSIGNED' : 'ASSIGNED',
      method: index % 7 === 0 ? null : 'IMPORT_CONTEXT',
      resolver_origin: 'SYNTHETIC_DEMO_CONTEXT',
    },
  };
}

function baseScenario(id, family, index, profile) {
  const route = routes.find((candidate) => candidate.route_id === scenarioRouteOverrides[id]) ?? routes[index % routes.length];
  return {
    scenario_id: id,
    scenario_name: scenarioNames[id],
    scenario_family: family,
    description: `Kịch bản kiểm thử ColdProof xác định, sử dụng hồ sơ ${profile}; ngữ cảnh vận chuyển y tế Việt Nam là dữ liệu demo tổng hợp.`,
    scenario_origin: 'SYNTHETIC_DEMO_CONTEXT',
    product_reference_id: products[index % products.length].product_id,
    route_id: route.route_id,
    business_context: logisticsContext(id, index, route),
    data_profile: profile,
    ...testMetadata(family, profile),
    test_severity_semantics: 'DEMO_TEST_ONLY',
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
    expected_failure_code: normalization === 'FAILURE' ? codes[0] : null,
    expected_stage: normalization === 'FAILURE' ? 'NORMALIZATION' : dq === 'FLAGGED' ? 'DATA_QUALITY' : 'NONE',
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
        expected_failure_code: null,
        expected_stage: 'NONE',
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
        expected_failure_code: null,
        expected_stage: 'NONE',
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
    test_severity_semantics: 'DEMO_TEST_ONLY_NOT_REGULATORY_OR_PATIENT_RISK',
  };
  const runtimeScenarios = scenarios.filter((scenario) => scenario.measurement_source.kind === 'SIMULATED_LOGGER');
  const rejectionsByScenario = runtimeScenarios
    .filter((scenario) => scenario.expected.expected_raw_record_count > scenario.expected.expected_canonical_record_count)
    .map((scenario) => ({
      scenario_id: scenario.scenario_id,
      rejected_count: scenario.expected.expected_raw_record_count - scenario.expected.expected_canonical_record_count,
      failure_code: scenario.expected.expected_failure_code,
      expected_stage: scenario.expected.expected_stage,
    }));
  const recordCountReconciliation = {
    scope: 'SIMULATED_RUNTIME_AND_COMBINED_REFERENCE_CONTEXT',
    raw_record_count: runtimeScenarios.reduce((total, scenario) => total + scenario.expected.expected_raw_record_count, 0),
    canonical_record_count: runtimeScenarios.reduce((total, scenario) => total + scenario.expected.expected_canonical_record_count, 0),
    normalization_rejected_count: rejectionsByScenario.reduce((total, rejection) => total + rejection.rejected_count, 0),
    invariant: 'raw_record_count = canonical_record_count + normalization_rejected_count',
    rejections_by_scenario: rejectionsByScenario,
  };
  const outcomes = {
    manifest_version: '1.1.0',
    scenario_generator_version: GENERATOR_VERSION,
    record_count_reconciliation: recordCountReconciliation,
    scenarios: scenarios.map((scenario) => ({
      scenario_id: scenario.scenario_id,
      normalization_expected: scenario.expected.normalization_expected,
      dq_status_expected: scenario.expected.dq_status_expected,
      expected_finding_codes: scenario.expected.expected_finding_codes,
      expected_failure_code: scenario.expected.expected_failure_code,
      expected_stage: scenario.expected.expected_stage,
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
  const publicReferenceCodes = new Set(productCatalog.products.map((product) => product.public_reference_code));
  const locationIds = new Set(locationCatalog.locations.map((location) => location.location_id));
  const routeIds = new Set(routeCatalog.routes.map((route) => route.route_id));
  const facilityTypes = new Set(['DISTRIBUTION_HUB', 'COLD_STORAGE', 'HOSPITAL', 'VACCINATION_CENTER', 'CLINIC', 'PROVINCIAL_HUB']);
  const testPurposes = new Set(['PIPELINE', 'NORMALIZATION', 'DATA_QUALITY', 'TRIP_ASSOCIATION', 'QA_REVIEW', 'FRONTEND_DEMO', 'REFERENCE_CONTEXT']);
  productCatalog.products.forEach((product) => {
    if (product.reference_origin !== 'PUBLIC_PRODUCT_REFERENCE' || !['VERIFIED', 'REQUIRES_HUMAN_VERIFICATION'].includes(product.verification_status)) errors.push(`${product.product_id} has invalid public-reference provenance`);
    if (product.verification_status === 'VERIFIED' && (product.identity_verification_method !== 'OFFICIAL_PUBLIC_SOURCE' || !/^\d{4}-\d{2}-\d{2}$/.test(product.identity_verified_on))) errors.push(`${product.product_id} has invalid verification metadata`);
    if (product.verification_status === 'VERIFIED' && (!product.source_reference?.publisher || !product.source_reference?.title || !product.source_reference?.url_or_identifier)) errors.push(`${product.product_id} is VERIFIED without a source reference`);
    if (product.manufacturer !== null && product.manufacturer_verification_status !== 'VERIFIED') errors.push(`${product.product_id} has an unsupported manufacturer`);
    if (['batch_id', 'lot_number', 'shipment_id', 'sender', 'receiver', 'route'].some((field) => Object.hasOwn(product, field))) errors.push(`${product.product_id} mixes product identity with synthetic logistics`);
  });
  if (publicReferenceCodes.size !== productCatalog.products.length) errors.push('Public product reference codes must be unique');
  locationCatalog.locations.forEach((location) => {
    if (location.origin !== 'SYNTHETIC_DEMO_CONTEXT' || location.country_code !== 'VN' || !facilityTypes.has(location.facility_type) || !location.display_name || !location.city) errors.push(`${location.location_id} has invalid Vietnam demo facility metadata`);
  });
  routeCatalog.routes.forEach((route) => {
    [route.origin_location_id, ...route.waypoint_location_ids, route.destination_location_id].forEach((id) => { if (!locationIds.has(id)) errors.push(`${route.route_id} references unknown location ${id}`); });
    if (route.origin !== 'SYNTHETIC_DEMO_CONTEXT' || !route.display_label) errors.push(`${route.route_id} has invalid synthetic route metadata`);
  });
  const familyMinimums = { ZENODO_OBSERVED_BACKED: 8, SIMULATED_RUNTIME: 10, COMBINED_REFERENCE_CONTEXT: 4, MENDELEY_CONTEXT_ONLY: 2 };
  Object.entries(familyMinimums).forEach(([family, minimum]) => { if (scenarios.filter((scenario) => scenario.scenario_family === family).length < minimum) errors.push(`${family} requires at least ${minimum} scenarios`); });
  scenarios.forEach((scenario) => {
    if (!productIds.has(scenario.product_reference_id)) errors.push(`${scenario.scenario_id} references unknown product`);
    if (!routeIds.has(scenario.route_id)) errors.push(`${scenario.scenario_id} references unknown route`);
    if (scenario.scenario_origin !== 'SYNTHETIC_DEMO_CONTEXT' || scenario.business_context.origin !== 'SYNTHETIC_DEMO_CONTEXT') errors.push(`${scenario.scenario_id} has invalid business origin`);
    const route = routeCatalog.routes.find((candidate) => candidate.route_id === scenario.route_id);
    const contexts = [scenario.business_context.batch_context, scenario.business_context.shipment_context, scenario.business_context.trip_context, scenario.business_context.sender_receiver_relation];
    if (contexts.some((context) => context.origin !== 'SYNTHETIC_DEMO_CONTEXT')) errors.push(`${scenario.scenario_id} has non-synthetic logistics context`);
    if (route && (scenario.business_context.sender_receiver_relation.sender_location_id !== route.origin_location_id || scenario.business_context.sender_receiver_relation.receiver_location_id !== route.destination_location_id)) errors.push(`${scenario.scenario_id} sender/receiver does not match its route`);
    if (scenario.business_context.association.resolver_origin !== 'SYNTHETIC_DEMO_CONTEXT') errors.push(`${scenario.scenario_id} has invalid trip resolver origin`);
    if (!scenario.test_purposes?.length || scenario.test_purposes.some((purpose) => !testPurposes.has(purpose))) errors.push(`${scenario.scenario_id} has invalid test purpose metadata`);
    if (!['INFO', 'LOW', 'MEDIUM', 'HIGH'].includes(scenario.test_severity) || scenario.test_severity_semantics !== 'DEMO_TEST_ONLY') errors.push(`${scenario.scenario_id} has invalid demo test severity`);
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
    if (scenario.expected.normalization_expected === 'FAILURE' && (scenario.expected.expected_stage !== 'NORMALIZATION' || scenario.expected.dq_status_expected !== 'NOT_ASSESSED' || !scenario.expected.expected_failure_code || scenario.expected.expected_canonical_record_count !== 0)) errors.push(`${scenario.scenario_id} has inconsistent normalization failure semantics`);
    if (scenario.expected.dq_status_expected === 'FLAGGED' && scenario.expected.expected_stage !== 'DATA_QUALITY') errors.push(`${scenario.scenario_id} has inconsistent DQ failure stage`);
  });
  if (outcomes.scenarios.length !== scenarios.length) errors.push('Expected outcome manifest count mismatch');
  const reconciliation = outcomes.record_count_reconciliation;
  if (reconciliation.raw_record_count !== 25704 || reconciliation.canonical_record_count !== 25698 || reconciliation.normalization_rejected_count !== 6 || reconciliation.raw_record_count !== reconciliation.canonical_record_count + reconciliation.normalization_rejected_count || reconciliation.rejections_by_scenario.length !== 6) errors.push('Runtime raw/canonical count reconciliation is invalid');
  return { success: errors.length === 0, errors };
}

function summaryMarkdown(definitions) {
  const productById = new Map(definitions.products.products.map((product) => [product.product_id, product]));
  const routeById = new Map(definitions.routes.routes.map((route) => [route.route_id, route]));
  const header = `# Danh mục kịch bản demo y tế Việt Nam v${CATALOG_VERSION}\n\nDanh mục kết hợp quan sát vật lý công khai với ngữ cảnh vận chuyển y tế Việt Nam được tạo tổng hợp để kiểm thử phần mềm. Dữ liệu vật lý công khai không biến quan hệ lô hàng tổng hợp thành sự kiện có thật. Mendeley và Zenodo không được xem là cùng một dòng thời gian vật lý.\n\n` +
    `DQ \`PASS\` chỉ có nghĩa là không phát hiện bất thường chất lượng dữ liệu theo cấu hình hiện tại; không phải kết luận nhiệt độ đạt chuẩn hay tuân thủ.\n\n` +
    '| ID | Tên kịch bản | Sản phẩm tham chiếu | Tuyến hiển thị | Nguồn / logger | Hồ sơ | Chuẩn hóa | DQ | Trạng thái chuyến | Ngữ cảnh Mendeley | Mục đích kiểm thử |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = definitions.scenarios.map((scenario) => {
    const source = scenario.measurement_source.kind === 'ZENODO_WINDOW' ? `ZENODO/${scenario.measurement_source.sensor_id}` : scenario.measurement_source.kind === 'SIMULATED_LOGGER' ? scenario.measurement_source.logger_configs.map((config) => config.format).join('+') : 'MENDELEY';
    const conditions = (scenario.measurement_source.kind === 'MENDELEY_CONTEXT_ONLY' ? scenario.measurement_source.conditions : scenario.supplemental_context).map((reference) => reference.condition_id).join(', ') || '—';
    const product = productById.get(scenario.product_reference_id);
    const route = routeById.get(scenario.route_id);
    return `| ${scenario.scenario_id} | ${scenario.scenario_name} | ${product.display_name} | ${route.display_label} | ${source} | ${scenario.data_profile} | ${scenario.expected.normalization_expected}${scenario.expected.expected_failure_code ? ` (${scenario.expected.expected_failure_code})` : ''} | ${scenario.expected.dq_status_expected}${scenario.expected.expected_finding_codes.length && scenario.expected.expected_stage === 'DATA_QUALITY' ? ` (${scenario.expected.expected_finding_codes.join(', ')})` : ''} | ${scenario.business_context.association.status} / SYNTHETIC_DEMO_CONTEXT | ${conditions} | ${scenario.test_purposes.join(', ')} |`;
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
