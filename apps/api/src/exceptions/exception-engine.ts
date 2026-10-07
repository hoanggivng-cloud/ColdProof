import type { CanonicalMeasurement } from '@coldproof/canonical-schema';
import type { ExceptionCandidate, QualityIssue } from '@coldproof/shared-types';

export interface ProductProfile {
  id: string;
  lower_threshold: number;
  upper_threshold: number;
}

export interface ExcursionInterval {
  id: string;
  batch_id: string;
  segment_id?: string;
  profile_id: string;
  record_ids: string[];
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  peak_temp: number;
  min_temp: number;
  status: 'PENDING_REVIEW';
}

/**
 * Detect sensor conflicts (FR-DQ-003, S04).
 * When 2 sensors measure within the same time window and exhibit a temperature discrepancy (>= 1.0°C),
 * BOTH sensor streams MUST be retained in the database with conflict_flag = true.
 * A QualityIssue with code 'SENSOR_CONFLICT' is generated for human QA review.
 * NEVER discard or average either stream!
 */
export function detectSensorConflicts(
  measurements: CanonicalMeasurement[],
  divergenceThresholdC: number = 1.0
): { issues: QualityIssue[]; conflictRecordIds: Set<string> } {
  const issues: QualityIssue[] = [];
  const conflictRecordIds = new Set<string>();

  // Group measurements by timestamp (or nearest minute)
  const timeBuckets = new Map<string, CanonicalMeasurement[]>();

  for (const m of measurements) {
    if (!m.timestamp || m.temperature_c === undefined || m.temperature_c === null) {
      continue;
    }
    // Normalize to ISO minute for alignment
    const timeKey = m.timestamp.slice(0, 16);
    const bucket = timeBuckets.get(timeKey) ?? [];
    bucket.push(m);
    timeBuckets.set(timeKey, bucket);
  }

  let issueCounter = 1;
  for (const [timeKey, bucket] of timeBuckets.entries()) {
    if (bucket.length < 2) continue;

    // Compare distinct sensors
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const m1 = bucket[i];
        const m2 = bucket[j];
        const sensor1 = m1.source_sensor_id ?? m1.source_file ?? 'sensor-1';
        const sensor2 = m2.source_sensor_id ?? m2.source_file ?? 'sensor-2';

        if (sensor1 !== sensor2) {
          const diff = Math.abs((m1.temperature_c ?? 0) - (m2.temperature_c ?? 0));
          if (diff >= divergenceThresholdC) {
            conflictRecordIds.add(m1.record_id);
            conflictRecordIds.add(m2.record_id);

            issues.push({
              id: `CONFLICT-${issueCounter++}`,
              record_ids: [m1.record_id, m2.record_id],
              code: 'SENSOR_CONFLICT',
              detail: `Sensor divergence of ${diff.toFixed(2)}°C detected at ${timeKey} between ${sensor1} (${m1.temperature_c}°C) and ${sensor2} (${m2.temperature_c}°C). Both streams retained for QA review.`,
            });
          }
        }
      }
    }
  }

  return { issues, conflictRecordIds };
}

/**
 * Detect temperature excursions (FR-EXC-002, FR-EXC-001, FR-EXC-003).
 * Evaluates measurements against product_profile thresholds.
 *
 * Guardrail 1 (Time-series vs Spatial): Mendeley/spatial measurements without timestamp do not claim duration.
 * Guardrail 2 (Segment Boundary Reset): Excursion streaks reset at segment boundaries (no cross-segment bridging).
 * Guardrail 4 (No Pharma Disposition): Status is strictly 'PENDING_REVIEW'. No automatic PASS/REJECT.
 */
export function detectExcursions(
  measurements: CanonicalMeasurement[],
  profile: ProductProfile
): {
  exceptions: ExceptionCandidate[];
  intervals: ExcursionInterval[];
  excursionRecordIds: Set<string>;
} {
  const exceptions: ExceptionCandidate[] = [];
  const intervals: ExcursionInterval[] = [];
  const excursionRecordIds = new Set<string>();

  if (!measurements.length) {
    return { exceptions, intervals, excursionRecordIds };
  }

  // Group measurements by segment to enforce Segment Boundary Reset (Guardrail 2)
  const segmentGroups = new Map<string, CanonicalMeasurement[]>();
  for (const m of measurements) {
    const segKey = m.segment_id ?? 'DEFAULT_SEGMENT';
    const group = segmentGroups.get(segKey) ?? [];
    group.push(m);
    segmentGroups.set(segKey, group);
  }

  let excCounter = 1;

  for (const [segId, segMeasurements] of segmentGroups.entries()) {
    // Sort strictly chronologically within segment
    const sorted = [...segMeasurements].sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    let currentStreak: CanonicalMeasurement[] = [];

    const flushStreak = () => {
      if (!currentStreak.length) return;

      const recordIds = currentStreak.map(m => m.record_id);
      recordIds.forEach(id => excursionRecordIds.add(id));

      const temps = currentStreak.map(m => m.temperature_c!).filter(t => t !== undefined && t !== null);
      const peakTemp = Math.max(...temps);
      const minTemp = Math.min(...temps);

      // Check if time-series or spatial (Guardrail 1)
      const hasTimestamps = currentStreak.every(m => Boolean(m.timestamp));
      let durationMinutes: number | undefined = undefined;
      let startTime: string | undefined = undefined;
      let endTime: string | undefined = undefined;

      if (hasTimestamps) {
        startTime = currentStreak[0].timestamp;
        endTime = currentStreak[currentStreak.length - 1].timestamp;
        const diffMs = new Date(endTime!).getTime() - new Date(startTime!).getTime();
        // duration in minutes (inclusive of interval span or diff)
        durationMinutes = Math.max(0, Math.round(diffMs / 60000));
      }

      const batchId = currentStreak[0].batch_id ?? 'UNKNOWN_BATCH';
      const excId = `EXC-${batchId}-${excCounter++}`;

      intervals.push({
        id: excId,
        batch_id: batchId,
        segment_id: segId,
        profile_id: profile.id,
        record_ids: recordIds,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: durationMinutes,
        peak_temp: peakTemp,
        min_temp: minTemp,
        status: 'PENDING_REVIEW', // Guardrail 4: No pharma disposition
      });

      exceptions.push({
        id: excId,
        batch_id: batchId,
        record_ids: recordIds,
        profile_id: profile.id,
      });

      currentStreak = [];
    };

    for (const m of sorted) {
      if (m.temperature_c === undefined || m.temperature_c === null) {
        flushStreak();
        continue;
      }

      const isBreach =
        m.temperature_c < profile.lower_threshold || m.temperature_c > profile.upper_threshold;

      if (isBreach) {
        currentStreak.push(m);
      } else {
        flushStreak();
      }
    }

    // Flush any pending streak at segment end (Segment Boundary Reset)
    flushStreak();
  }

  return { exceptions, intervals, excursionRecordIds };
}

