export interface EvidenceRecord {
  sensorId: string;
  fileName: string;
  rawRef: string;
  timestamp: string;
  arithmeticTimeMs: number;
  temperatureC: number;
  humidityPct: number;
}

export interface SourceEvent {
  action: string;
  startTimestamp: string;
  endTimestamp: string;
  startTimeMs: number;
  endTimeMs: number;
  sourceRef: string;
}

export interface CandidatePolicy {
  expectedIntervalSeconds: number;
  candidateDurationsMinutes: readonly number[];
  candidateStartStepMinutes: number;
  baselineMinutes: number;
  variationBinMinutes: number;
  baselineRangeThresholdC: number;
  postVariationMeanShiftThresholdC: number;
  shortlistSize: number;
}

export interface EvidenceCandidate {
  candidateId: string;
  sensorId: string;
  sourceFile: string;
  startTimestamp: string;
  endTimestamp: string;
  durationSeconds: number;
  observationCount: number;
  internalMissingIntervalCount: number;
  expectedMissingSampleCount: number;
  documentedEventCount: number;
  documentedEventRefs: string;
  sourceContinuityStatus: string;
  selectionScore: number;
  eligibilityStatus?: string;
  eligibilityReasons?: string;
  blueprintFitStatus?: string;
  blueprintFitScore?: number;
  blueprintFitReasons?: string;
  rank?: number | string;
  selectionStatus?: string;
  selectionRationale?: string;
  rejectionReason?: string;
  [key: string]: unknown;
}

export interface EvidenceBlueprint {
  blueprint_id: string;
  blueprint_version: string;
  status: string;
  observed_evidence: {
    time_series: { source_dataset: string; role: string; [key: string]: unknown };
    spatial: { role: string; [key: string]: unknown };
  };
  synthetic_context: { segments: Array<Record<string, unknown>>; [key: string]: unknown };
  assumptions: {
    product_profile: {
      profile_id: string;
      does_not_describe_source_dataset: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  evidence_selection_criteria: {
    zenodo: { required: string[]; preferred: string[]; not_required: string[] };
    mendeley: Record<string, unknown>;
  };
  replay_policy: { preferred_mode: string; [key: string]: unknown };
  mapping_rules: {
    zenodo_to_segment: {
      rewrite_source_timestamp: boolean;
      rewrite_measurement_value: boolean;
      [key: string]: unknown;
    };
    mendeley_to_scenario: {
      used_for_excursion_calculation: boolean;
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
}

export interface EvidenceDecision {
  decision_version: string;
  blueprint_id: string;
  decision_status: string;
  selected_time_series_evidence: {
    candidate_id: string;
    sensor_id: string;
    source_file: string;
    start_timestamp: string;
    end_timestamp: string;
    duration_seconds: number;
    observation_count: number;
    selection_origin: string;
    timezone_status: string;
  };
  selection_rationale: string[];
  known_limitations: string[];
  [key: string]: unknown;
}

export interface SerializedEvidenceCandidate {
  candidate_id: string;
  sensor_id: string;
  source_file: string;
  start_timestamp: string;
  end_timestamp: string;
  duration_seconds: number | string;
  observation_count: number | string;
  selection_status: string;
  [key: string]: unknown;
}

export interface SelectionContext {
  provenanceFiles: Set<string>;
  malformedRowsByFile: Map<string, number>;
}

export interface ParsedSource {
  sensorId: string;
  fileName: string;
  records: EvidenceRecord[];
  malformedRows: Array<{ rawRef: string; code: string }>;
  structuralHeaderCount: number;
  blankLineCount: number;
}

export const DEFAULT_POLICY: Readonly<CandidatePolicy>;
export function loadBlueprint(text: string): EvidenceBlueprint;
export function loadEvidenceDecision(text: string): EvidenceDecision;
export function getBlueprintMetadata(blueprint: EvidenceBlueprint): {
  blueprintId: string;
  blueprintVersion: string;
  blueprintStatus: string;
  preferredReplayMode: string;
  syntheticSegmentCount: number;
  zenodoRequiredCriteria: string[];
  zenodoPreferredCriteria: string[];
  mendeleyRole: string;
  zenodoRewriteSourceTimestamp: boolean;
  zenodoRewriteMeasurementValue: boolean;
  mendeleyUsedForExcursionCalculation: boolean;
  productProfileId: string;
  productProfileExcludedFromSelection: boolean;
  timeSeriesSelectionStatus: string;
  evidenceDecisionRef?: string;
};
export function resolveApprovedCandidate<
  T extends EvidenceCandidate | SerializedEvidenceCandidate,
>(candidates: T[], decision: EvidenceDecision, blueprint?: EvidenceBlueprint): T;
export function evaluateContinuity(
  records: EvidenceRecord[],
  expectedIntervalSeconds?: number,
): {
  internalMissingIntervalCount: number;
  expectedMissingSampleCount: number;
  duplicateTimestampCount: number;
  outOfOrderCount: number;
  gaps: Array<{
    previous: EvidenceRecord;
    next: EvidenceRecord;
    observedGapSeconds: number;
    missingCount: number;
  }>;
};
export function generateCandidates(
  records: EvidenceRecord[],
  events: SourceEvent[],
  policy?: CandidatePolicy,
): EvidenceCandidate[];
export function parseExperimentActions(text: string): SourceEvent[];
export function parseZenodoCsv(text: string, fileName: string): ParsedSource;
export function selectSensorWinners(
  candidates: EvidenceCandidate[],
  blueprint: EvidenceBlueprint,
  context: SelectionContext,
  shortlistSize?: number,
): EvidenceCandidate[];
export function evaluateCandidateAgainstBlueprint(
  candidate: EvidenceCandidate,
  blueprint: EvidenceBlueprint,
  context: SelectionContext,
): EvidenceCandidate;
export function serializeCandidates(candidates: EvidenceCandidate[]): string;
