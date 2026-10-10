'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const evidenceSelectionCore = require('./evidence-selection-core.cjs');
const { evaluateContinuity, parseSourceDateTime } = evidenceSelectionCore;

const MATERIALIZATION_VERSION = '1.0.0';
const MATERIALIZATION_STATUS = 'MATERIALIZED_DRAFT_PENDING_VALIDATION';
const SCENARIO_ID = 'CP-DEMO-001';
const BATCH_ID = 'BATCH-DEMO-001';
const SHIPMENT_ID = 'SHIP-DEMO-001';
const TIMEZONE_STATUS = 'UNKNOWN_SOURCE_LOCAL';
const INTERVAL_SEMANTICS = '[start,end)';
const EXPECTED_INTERVAL_SECONDS = 5;

const LEG_DEFINITIONS = Object.freeze([
  Object.freeze({
    legId: 'LEG-01',
    sequence: 1,
    legType: 'ORIGIN_STORAGE',
    startTimestamp: '2024-09-10T06:00:00',
    endTimestamp: '2024-09-10T07:00:00',
    expectedObservationCount: 720,
  }),
  Object.freeze({
    legId: 'LEG-02',
    sequence: 2,
    legType: 'TRANSPORT',
    startTimestamp: '2024-09-10T07:00:00',
    endTimestamp: '2024-09-10T07:55:00',
    expectedObservationCount: 660,
  }),
  Object.freeze({
    legId: 'LEG-03',
    sequence: 3,
    legType: 'TRANSIT',
    startTimestamp: '2024-09-10T07:55:00',
    endTimestamp: '2024-09-10T09:30:00',
    expectedObservationCount: 1140,
  }),
  Object.freeze({
    legId: 'LEG-04',
    sequence: 4,
    legType: 'DESTINATION_STORAGE',
    startTimestamp: '2024-09-10T09:30:00',
    endTimestamp: '2024-09-10T10:00:00',
    expectedObservationCount: 360,
  }),
]);

const HANDOVER_DEFINITIONS = Object.freeze([
  Object.freeze({
    handoverId: 'HANDOVER-01',
    timestamp: '2024-09-10T07:00:00',
    fromLegId: 'LEG-01',
    toLegId: 'LEG-02',
  }),
  Object.freeze({
    handoverId: 'HANDOVER-02',
    timestamp: '2024-09-10T07:55:00',
    fromLegId: 'LEG-02',
    toLegId: 'LEG-03',
  }),
  Object.freeze({
    handoverId: 'HANDOVER-03',
    timestamp: '2024-09-10T09:30:00',
    fromLegId: 'LEG-03',
    toLegId: 'LEG-04',
  }),
]);

const SEGMENT_COLUMNS = Object.freeze([
  'scenario_id',
  'batch_id',
  'shipment_id',
  'leg_id',
  'sequence',
  'leg_type',
  'start_timestamp',
  'end_timestamp',
  'interval_semantics',
  'expected_observation_count',
  'actual_observation_count',
  'count_origin',
  'origin',
]);

const MAPPING_COLUMNS = Object.freeze([
  'scenario_id',
  'batch_id',
  'shipment_id',
  'measurement_ref',
  'source_id',
  'sensor_id',
  'source_file',
  'source_row_or_ref',
  'source_local_timestamp',
  'leg_id',
  'measurement_origin',
  'mapping_origin',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeCsv(columns, rows) {
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(','));
  return `${columns.join(',')}\n${body.join('\n')}\n`;
}

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
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field !== '' || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const [headers, ...dataRows] = rows.filter((entry) => entry.some((value) => value !== ''));
  invariant(headers !== undefined, 'CSV is empty.');
  return dataRows.map((values, index) => {
    invariant(
      values.length === headers.length,
      `CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`,
    );
    return Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]]));
  });
}

function arithmeticRecord(record) {
  const [dateRaw, timeRaw, extra] = String(record.timestamp).split('T');
  invariant(dateRaw && timeRaw && extra === undefined, `Invalid source-local timestamp: ${record.timestamp}`);
  const parsed = parseSourceDateTime(dateRaw, timeRaw);
  invariant(parsed !== null, `Invalid source-local timestamp: ${record.timestamp}`);
  return {
    ...record,
    arithmeticTimeMs: parsed.arithmeticTimeMs,
  };
}

function assignLeg(timestamp) {
  return LEG_DEFINITIONS.find(
    (leg) => timestamp >= leg.startTimestamp && timestamp < leg.endTimestamp,
  );
}

function validateDecision(decision, blueprint) {
  invariant(decision.decision_version === '2.0.0', 'Evidence Decision v2.0.0 is required.');
  invariant(decision.decision_status === 'APPROVED', 'Evidence Decision v2 must be APPROVED.');
  invariant(decision.blueprint_id === blueprint.blueprint_id, 'Decision blueprint_id mismatch.');
  invariant(
    blueprint.observed_evidence?.time_series?.evidence_decision_ref ===
      'data/scenarios/design/evidence-decision-v2.json',
    'Blueprint does not resolve through Evidence Decision v2.',
  );

  const selected = decision.selected_time_series_evidence;
  invariant(selected.sensor_id === 'SENSOR09', 'Approved sensor must be SENSOR09.');
  invariant(selected.source_file === 'SENSOR09.CSV', 'Approved source file must be SENSOR09.CSV.');
  invariant(selected.start_timestamp === '2024-09-10T06:00:00', 'Approved start mismatch.');
  invariant(selected.end_timestamp === '2024-09-10T10:00:00', 'Approved end mismatch.');
  invariant(selected.interval_semantics === INTERVAL_SEMANTICS, 'Approved interval must be half-open.');
  invariant(selected.observation_count === 2880, 'Approved observation count must be 2880.');
  invariant(selected.duration_seconds === 14400, 'Approved duration must be 14400 seconds.');
  invariant(selected.timezone_status === TIMEZONE_STATUS, 'Timezone status must remain source-local.');
  return selected;
}

function classifySourceEvent(event, selected) {
  if (event.startTimestamp === selected.end_timestamp) return 'BOUNDARY_TOUCH_ONLY';
  if (
    event.startTimestamp === event.endTimestamp &&
    event.startTimestamp >= selected.start_timestamp &&
    event.startTimestamp < selected.end_timestamp
  ) {
    return 'WITHIN_SELECTED_WINDOW';
  }
  return 'TEMPORAL_OVERLAP';
}

function selectSourceEvents(events, selected) {
  return events
    .filter(
      (event) =>
        (event.startTimestamp < selected.end_timestamp &&
          event.endTimestamp >= selected.start_timestamp) ||
        event.startTimestamp === selected.end_timestamp,
    )
    .filter((event) => event.startTimestamp <= selected.end_timestamp)
    .map((event) => ({
      source_ref: event.sourceRef,
      event_type: event.action,
      start_timestamp: event.startTimestamp,
      end_timestamp: event.endTimestamp,
      window_relation: classifySourceEvent(event, selected),
      origin: 'REAL_PUBLIC_DATA',
      event_scope: 'SOURCE_EXPERIMENT_EVENT',
      logistics_role: 'NONE',
      causal_relation_to_handover: 'NONE',
    }));
}

function buildReadme() {
  return `# CP-DEMO-001 materialized scenario\n\n` +
    `Status: \`${MATERIALIZATION_STATUS}\`\n\n` +
    `This repository scenario pack combines real public physical observations with controlled synthetic logistics context for software evidence testing. It is not a real pharmaceutical shipment, a compliance conclusion, or a QA approval.\n\n` +
    `## Observed evidence\n\n` +
    `- SENSOR09 measurements in the approved source-local half-open interval \`[2024-09-10T06:00:00,2024-09-10T10:00:00)\`.\n` +
    `- Zenodo experiment annotations retained as independent source events. They are not logistics handovers and imply no causal relationship.\n` +
    `- Mendeley C04 and C07 spatial conditions referenced as metadata-only illustrative context. They have no timestamps and are not assigned to legs.\n\n` +
    `## Synthetic context\n\n` +
    `The scenario, batch, shipment, four logistics legs, three handovers, and the Zenodo-to-Mendeley illustrative relationship are synthetic. Source measurements, timestamps, values, and raw references are not rewritten.\n\n` +
    `## Assumption\n\n` +
    `\`DEMO_2_8C\` is a ColdProof scenario assumption. Zenodo does not provide it as a pharmaceutical product profile. No authoritative excursion policy or final excursion result is included.\n\n` +
    `## Canonicalization limitation\n\n` +
    `The materializer uses the existing ZenodoAdapter for source parsing. The source timestamps have no verified timezone, while CanonicalTimeSeriesMeasurement requires an explicit offset. This pack therefore maps deterministic parsed source-record references and records canonical normalization as pending explicit timezone context. It does not invent UTC, append \`Z\`, or fabricate an offset.\n\n` +
    `## Artifact roles\n\n` +
    `- \`scenario.json\`: identity, status, origins, and artifact references.\n` +
    `- \`source-window.json\`: approved evidence binding and source-quality validation.\n` +
    `- \`segments.csv\`: four synthetic half-open leg definitions.\n` +
    `- \`measurement-leg-map.csv\`: one deterministic source-record reference per selected observation.\n` +
    `- \`handovers.json\`: three synthetic scenario boundaries.\n` +
    `- \`source-events.json\`: independent Zenodo experiment annotations.\n` +
    `- \`spatial-context.json\`: metadata-only Mendeley C04/C07 references.\n` +
    `- \`assumptions.json\`: the non-source DEMO_2_8C assumption and unresolved policy fields.\n` +
    `- \`provenance.json\`: frozen-source, parser, decision, and origin lineage.\n\n` +
    `The legacy backend fixture that uses \`CP-DEMO-001\` as a batch ID is not this authoritative repository materialization. This pack does not synchronize with or modify that fixture.\n`;
}

function buildMaterializationArtifacts(input) {
  const {
    decision,
    blueprint,
    parsedRecords,
    sourceAsset,
    eventAsset,
    experimentEvents,
    spatialContexts,
    evidenceDecisionSha256,
  } = input;
  const selected = validateDecision(decision, blueprint);

  invariant(sourceAsset.source_id === 'ZEN-RAW-S09', 'Expected frozen source ZEN-RAW-S09.');
  invariant(sourceAsset.file_name === selected.source_file, 'Frozen source filename mismatch.');
  invariant(sourceAsset.origin_class === 'REAL_PUBLIC_DATA', 'Zenodo source origin mismatch.');
  invariant(/^[a-f0-9]{64}$/.test(sourceAsset.checksum_sha256), 'Invalid Zenodo checksum.');

  const selectedRecords = parsedRecords.filter(
    (record) =>
      record.timestamp >= selected.start_timestamp && record.timestamp < selected.end_timestamp,
  );
  invariant(
    selectedRecords.length === selected.observation_count,
    `Expected ${selected.observation_count} selected records; found ${selectedRecords.length}.`,
  );
  invariant(
    selectedRecords.every((record) => record.recordType === 'TIMESERIES'),
    'Selected source records must be TIMESERIES.',
  );
  invariant(
    selectedRecords.every((record) => record.warnings.length === 0),
    'Selected source records contain parser warnings.',
  );

  const arithmeticRecords = selectedRecords.map(arithmeticRecord);
  const continuity = evaluateContinuity(arithmeticRecords, EXPECTED_INTERVAL_SECONDS);
  invariant(continuity.internalMissingIntervalCount === 0, 'Selected window contains a missing interval.');
  invariant(continuity.duplicateTimestampCount === 0, 'Selected window contains duplicate timestamps.');
  invariant(continuity.outOfOrderCount === 0, 'Selected window contains out-of-order timestamps.');
  invariant(arithmeticRecords[0].timestamp === selected.start_timestamp, 'Selected window start missing.');
  invariant(
    arithmeticRecords.at(-1).timestamp === decision.source_verification.last_included_timestamp,
    'Selected window last included timestamp mismatch.',
  );

  const boundaryRecord = parsedRecords.find((record) => record.timestamp === selected.end_timestamp);
  invariant(boundaryRecord !== undefined, 'Expected source record at the excluded end boundary.');

  const actualCounts = new Map(LEG_DEFINITIONS.map((leg) => [leg.legId, 0]));
  const mappingRows = arithmeticRecords.map((record) => {
    const leg = assignLeg(record.timestamp);
    invariant(leg !== undefined, `No leg assignment for ${record.timestamp}.`);
    actualCounts.set(leg.legId, actualCounts.get(leg.legId) + 1);
    return {
      scenario_id: SCENARIO_ID,
      batch_id: BATCH_ID,
      shipment_id: SHIPMENT_ID,
      measurement_ref: `${sourceAsset.source_id}:${record.rawRef}`,
      source_id: sourceAsset.source_id,
      sensor_id: selected.sensor_id,
      source_file: selected.source_file,
      source_row_or_ref: record.rawRef,
      source_local_timestamp: record.timestamp,
      leg_id: leg.legId,
      measurement_origin: 'REAL_PUBLIC_DATA',
      mapping_origin: 'DERIVED',
    };
  });

  const segmentRows = LEG_DEFINITIONS.map((leg) => {
    const actualObservationCount = actualCounts.get(leg.legId);
    invariant(
      actualObservationCount === leg.expectedObservationCount,
      `${leg.legId} expected ${leg.expectedObservationCount}; found ${actualObservationCount}.`,
    );
    return {
      scenario_id: SCENARIO_ID,
      batch_id: BATCH_ID,
      shipment_id: SHIPMENT_ID,
      leg_id: leg.legId,
      sequence: leg.sequence,
      leg_type: leg.legType,
      start_timestamp: leg.startTimestamp,
      end_timestamp: leg.endTimestamp,
      interval_semantics: INTERVAL_SEMANTICS,
      expected_observation_count: leg.expectedObservationCount,
      actual_observation_count: actualObservationCount,
      count_origin: 'DERIVED',
      origin: 'SYNTHETIC',
    };
  });

  invariant(new Set(mappingRows.map((row) => row.measurement_ref)).size === 2880, 'Duplicate measurement assignment.');
  invariant(new Set(mappingRows.map((row) => row.source_local_timestamp)).size === 2880, 'Duplicate selected timestamp.');
  invariant(!mappingRows.some((row) => row.source_local_timestamp === selected.end_timestamp), 'End boundary was included.');
  invariant(new Set([SCENARIO_ID, BATCH_ID, SHIPMENT_ID]).size === 3, 'Scenario identities must be distinct.');

  const selectedEvents = selectSourceEvents(experimentEvents, selected);
  invariant(selectedEvents.length === 4, `Expected four relevant source-event references; found ${selectedEvents.length}.`);
  invariant(
    selectedEvents.filter((event) => event.window_relation === 'BOUNDARY_TOUCH_ONLY').length === 1,
    'Expected one source event touching the end boundary.',
  );

  const requiredConditions = ['C04', 'C07'];
  invariant(
    spatialContexts.map((entry) => entry.condition_id).join(',') === requiredConditions.join(','),
    'Spatial context must contain C04 then C07.',
  );
  invariant(
    spatialContexts.every(
      (entry) =>
        entry.relation === 'ILLUSTRATIVE_CONTEXT' &&
        entry.scope === 'SCENARIO' &&
        entry.relation_origin === 'SYNTHETIC_RELATION' &&
        entry.measurement_origin === 'REAL_PUBLIC_DATA' &&
        entry.assigned_leg_id === null &&
        entry.used_for_excursion_calculation === false &&
        entry.timestamp_status === 'NOT_APPLICABLE',
    ),
    'Invalid Mendeley illustrative-context semantics.',
  );

  const scenario = {
    materialization_schema_version: '1.0.0',
    materialization_version: MATERIALIZATION_VERSION,
    materialization_status: MATERIALIZATION_STATUS,
    scenario_id: SCENARIO_ID,
    batch_id: BATCH_ID,
    shipment_id: SHIPMENT_ID,
    identity_origin: {
      scenario: 'SYNTHETIC',
      batch: 'SYNTHETIC',
      shipment: 'SYNTHETIC',
    },
    evidence_decision_ref: 'data/scenarios/design/evidence-decision-v2.json',
    evidence_decision_version: '2.0.0',
    evidence_decision_status: 'APPROVED',
    selected_measurement_count: 2880,
    leg_count: 4,
    handover_count: 3,
    artifact_refs: [
      'source-window.json',
      'segments.csv',
      'measurement-leg-map.csv',
      'handovers.json',
      'source-events.json',
      'spatial-context.json',
      'assumptions.json',
      'provenance.json',
      'README.md',
    ],
    authoritative_results_status: 'NOT_CREATED_EXCURSION_POLICY_NOT_FROZEN',
    legacy_backend_fixture_relationship: 'NONE_NOT_SYNCHRONIZED',
  };

  const sourceWindow = {
    source_window_id: 'CP-DEMO-001-ZENODO-S09-WINDOW-001',
    scenario_id: SCENARIO_ID,
    evidence_decision_ref: 'data/scenarios/design/evidence-decision-v2.json',
    evidence_decision_version: '2.0.0',
    evidence_decision_status: 'APPROVED',
    source_id: sourceAsset.source_id,
    source_dataset: sourceAsset.dataset,
    source_file: selected.source_file,
    source_sensor_id: selected.sensor_id,
    source_checksum_sha256: sourceAsset.checksum_sha256,
    start_timestamp: selected.start_timestamp,
    end_timestamp: selected.end_timestamp,
    interval_semantics: INTERVAL_SEMANTICS,
    timezone_status: TIMEZONE_STATUS,
    observation_count: selectedRecords.length,
    expected_interval_seconds: EXPECTED_INTERVAL_SECONDS,
    first_included_source_ref: selectedRecords[0].rawRef,
    last_included_source_ref: selectedRecords.at(-1).rawRef,
    excluded_end_boundary_source_ref: boundaryRecord.rawRef,
    source_quality: {
      internal_missing_interval_count: continuity.internalMissingIntervalCount,
      expected_missing_sample_count: continuity.expectedMissingSampleCount,
      duplicate_timestamp_count: continuity.duplicateTimestampCount,
      out_of_order_count: continuity.outOfOrderCount,
      origin: 'DERIVED',
    },
    parsing: {
      adapter_id: 'zenodo-cold-storage',
      adapter_version: '1.0.0',
      output_contract: 'ParsedTimeSeriesRecord',
    },
    canonical_normalization: {
      implementation_ref: 'apps/api/src/normalization/normalization.service.ts#normalizeTimeSeries',
      target_contract: 'CanonicalTimeSeriesMeasurement',
      status: 'PENDING_EXPLICIT_TIMEZONE_CONTEXT',
      reason: 'The approved source timezone is unknown and the canonical contract requires an explicit offset.',
      invented_timezone_used: false,
    },
    measurement_origin: 'REAL_PUBLIC_DATA',
    mapping_origin: 'DERIVED',
  };

  const handovers = {
    scenario_id: SCENARIO_ID,
    handovers: HANDOVER_DEFINITIONS.map((handover) => ({
      handover_id: handover.handoverId,
      timestamp: handover.timestamp,
      from_leg_id: handover.fromLegId,
      to_leg_id: handover.toLegId,
      origin: 'SYNTHETIC',
      boundary_basis: 'SCENARIO_DESIGN',
      inferred_from_source_event: false,
    })),
  };

  const sourceEvents = {
    scenario_id: SCENARIO_ID,
    source_asset_ref: eventAsset.source_id,
    source_file: eventAsset.file_name,
    source_checksum_sha256: eventAsset.checksum_sha256,
    selected_measurement_window: {
      start_timestamp: selected.start_timestamp,
      end_timestamp: selected.end_timestamp,
      interval_semantics: INTERVAL_SEMANTICS,
    },
    events: selectedEvents,
  };

  const spatialContext = {
    scenario_id: SCENARIO_ID,
    relationship: {
      relation: 'ILLUSTRATIVE_CONTEXT',
      scope: 'SCENARIO',
      relation_origin: 'SYNTHETIC_RELATION',
      same_time_claim: false,
      same_goods_claim: false,
      same_environment_claim: false,
      causal_relation_to_zenodo: 'NONE',
    },
    conditions: spatialContexts,
  };

  const assumptions = {
    scenario_id: SCENARIO_ID,
    product_profile: {
      profile_id: 'DEMO_2_8C',
      lower_c: 2,
      upper_c: 8,
      origin: 'ASSUMPTION',
      source_dataset_claim: 'NONE',
      purpose: 'ColdProof software rule context only',
    },
    excursion_policy: {
      status: 'NOT_FROZEN',
      authoritative_results_created: false,
      unresolved: [
        'hysteresis',
        'debounce',
        'minimum_excursion_duration',
        'gap_policy',
        'excursion_merge_behavior',
        'segment_boundary_behavior',
        'authoritative_duration_semantics',
      ],
    },
  };

  const provenance = {
    materialization_id: 'coldproof-scenario-materializer',
    materialization_version: MATERIALIZATION_VERSION,
    scenario_id: SCENARIO_ID,
    evidence_decision: {
      path: 'data/scenarios/design/evidence-decision-v2.json',
      version: '2.0.0',
      status: 'APPROVED',
      checksum_sha256: evidenceDecisionSha256,
    },
    primary_source: {
      dataset: sourceAsset.dataset,
      source_id: sourceAsset.source_id,
      source_file: sourceAsset.file_name,
      relative_path: sourceAsset.relative_path,
      source_checksum_sha256: sourceAsset.checksum_sha256,
      source_sensor_id: selected.sensor_id,
      source_row_or_ref_range: {
        first: selectedRecords[0].rawRef,
        last: selectedRecords.at(-1).rawRef,
      },
      selected_interval: {
        start_timestamp: selected.start_timestamp,
        end_timestamp: selected.end_timestamp,
        interval_semantics: INTERVAL_SEMANTICS,
        timezone_status: TIMEZONE_STATUS,
      },
      parser_id: 'zenodo-cold-storage',
      parser_version: '1.0.0',
      canonical_normalization_path: 'ParsedTimeSeriesRecord -> normalizeTimeSeries -> CanonicalTimeSeriesMeasurement',
      canonical_normalization_status: 'PENDING_EXPLICIT_TIMEZONE_CONTEXT',
      measurement_origin: 'REAL_PUBLIC_DATA',
    },
    experiment_event_source: {
      source_id: eventAsset.source_id,
      relative_path: eventAsset.relative_path,
      source_checksum_sha256: eventAsset.checksum_sha256,
      origin: 'REAL_PUBLIC_DATA',
    },
    supplemental_spatial_sources: spatialContexts.map((entry) => ({
      condition_id: entry.condition_id,
      source_id: entry.source_id,
      source_file: entry.source_file,
      relative_path: entry.relative_path,
      source_checksum_sha256: entry.source_checksum_sha256,
      measurement_origin: entry.measurement_origin,
      relation_origin: entry.relation_origin,
    })),
    origin_categories: {
      observed_measurements: 'REAL_PUBLIC_DATA',
      observed_source_events: 'REAL_PUBLIC_DATA',
      business_context: 'SYNTHETIC',
      illustrative_relation: 'SYNTHETIC_RELATION',
      product_profile: 'ASSUMPTION',
      mappings_and_counts: 'DERIVED',
    },
    checksum_scope_note: 'SHA-256 identifies the frozen referenced file; it does not establish sensor accuracy or chain of custody.',
  };

  const artifacts = new Map([
    ['scenario.json', stableJson(scenario)],
    ['source-window.json', stableJson(sourceWindow)],
    ['segments.csv', serializeCsv(SEGMENT_COLUMNS, segmentRows)],
    ['measurement-leg-map.csv', serializeCsv(MAPPING_COLUMNS, mappingRows)],
    ['handovers.json', stableJson(handovers)],
    ['source-events.json', stableJson(sourceEvents)],
    ['spatial-context.json', stableJson(spatialContext)],
    ['assumptions.json', stableJson(assumptions)],
    ['provenance.json', stableJson(provenance)],
    ['README.md', buildReadme()],
  ]);

  validateArtifactContents(artifacts);
  return {
    artifacts,
    summary: {
      selectedObservationCount: mappingRows.length,
      legCounts: Object.fromEntries(actualCounts),
      handoverCount: HANDOVER_DEFINITIONS.length,
      sourceEventCount: selectedEvents.length,
      spatialConditionCount: spatialContexts.length,
      continuity,
      firstSourceRef: selectedRecords[0].rawRef,
      lastSourceRef: selectedRecords.at(-1).rawRef,
      excludedBoundarySourceRef: boundaryRecord.rawRef,
    },
  };
}

function validateArtifactContents(artifacts) {
  const scenario = JSON.parse(artifacts.get('scenario.json'));
  const sourceWindow = JSON.parse(artifacts.get('source-window.json'));
  const segmentRows = parseCsv(artifacts.get('segments.csv'));
  const mappingRows = parseCsv(artifacts.get('measurement-leg-map.csv'));
  const handovers = JSON.parse(artifacts.get('handovers.json'));
  const sourceEvents = JSON.parse(artifacts.get('source-events.json'));
  const spatial = JSON.parse(artifacts.get('spatial-context.json'));
  const assumptions = JSON.parse(artifacts.get('assumptions.json'));

  invariant(scenario.materialization_status === MATERIALIZATION_STATUS, 'Invalid materialization status.');
  invariant(new Set([scenario.scenario_id, scenario.batch_id, scenario.shipment_id]).size === 3, 'Scenario identities collide.');
  invariant(sourceWindow.timezone_status === TIMEZONE_STATUS, 'Timezone status changed.');
  invariant(sourceWindow.canonical_normalization.invented_timezone_used === false, 'Invented timezone detected.');
  invariant(segmentRows.length === 4, 'Exactly four legs are required.');
  invariant(mappingRows.length === 2880, 'Exactly 2880 measurement mappings are required.');
  invariant(handovers.handovers.length === 3, 'Exactly three handovers are required.');
  invariant(new Set(mappingRows.map((row) => row.measurement_ref)).size === 2880, 'Mapping references are not unique.');
  invariant(mappingRows.every((row) => row.measurement_origin === 'REAL_PUBLIC_DATA'), 'Observed origin mismatch.');
  invariant(mappingRows.every((row) => row.mapping_origin === 'DERIVED'), 'Mapping origin mismatch.');
  invariant(mappingRows.every((row) => !/[zZ]$/.test(row.source_local_timestamp)), 'Invented UTC suffix detected.');
  invariant(mappingRows.every((row) => assignLeg(row.source_local_timestamp)?.legId === row.leg_id), 'Incorrect leg assignment.');
  invariant(!mappingRows.some((row) => row.source_local_timestamp >= '2024-09-10T10:00:00'), 'Out-of-window mapping detected.');
  invariant(handovers.handovers.every((entry) => entry.origin === 'SYNTHETIC'), 'Handover origin mismatch.');
  invariant(sourceEvents.events.every((entry) => entry.logistics_role === 'NONE'), 'Source event became a handover.');
  invariant(sourceEvents.events.every((entry) => entry.origin === 'REAL_PUBLIC_DATA'), 'Source event origin mismatch.');
  invariant(spatial.conditions.map((entry) => entry.condition_id).join(',') === 'C04,C07', 'Spatial conditions mismatch.');
  invariant(spatial.conditions.every((entry) => entry.assigned_leg_id === null), 'Spatial context assigned to a leg.');
  invariant(spatial.conditions.every((entry) => entry.used_for_excursion_calculation === false), 'Spatial context used for excursion calculation.');
  invariant(assumptions.product_profile.origin === 'ASSUMPTION', 'DEMO_2_8C origin mismatch.');
  invariant(assumptions.excursion_policy.authoritative_results_created === false, 'Authoritative excursion output detected.');
}

module.exports = {
  BATCH_ID,
  HANDOVER_DEFINITIONS,
  INTERVAL_SEMANTICS,
  LEG_DEFINITIONS,
  MAPPING_COLUMNS,
  MATERIALIZATION_STATUS,
  MATERIALIZATION_VERSION,
  SCENARIO_ID,
  SEGMENT_COLUMNS,
  SHIPMENT_ID,
  TIMEZONE_STATUS,
  assignLeg,
  buildMaterializationArtifacts,
  parseCsv,
  selectSourceEvents,
  serializeCsv,
  stableJson,
  validateArtifactContents,
};
