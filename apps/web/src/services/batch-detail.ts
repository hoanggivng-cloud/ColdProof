import { readRecords, type ApiRecord } from './api-client';
import type { BatchDetailData, BatchEvent, BatchMeasurement, BatchSegment } from '../types/batch-detail';

const text = (value: unknown) => typeof value === 'string' && value ? value : null;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const records = (value: unknown): ApiRecord[] => Array.isArray(value) ? value.filter((item): item is ApiRecord => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];

function segment(row: ApiRecord): BatchSegment | null {
  const id = text(row.id);
  return id ? { id, source_id: text(row.source_id), device_alias: text(row.device_alias), handover_id: text(row.handover_id), selector: text(row.selector) } : null;
}
function event(row: ApiRecord): BatchEvent | null {
  const id = text(row.id), timestamp = text(row.timestamp), type = text(row.event_type);
  return id && timestamp && type ? { id, timestamp, event_type: type, segment_id: text(row.segment_id), device_alias: text(row.device_alias), handover_id: text(row.handover_id), detail: text(row.detail) } : null;
}
function measurement(row: ApiRecord): BatchMeasurement | null {
  const id = text(row.record_id);
  return id ? { record_id: id, timestamp: text(row.timestamp), temperature_c: number(row.temperature_c), sensor: text(row.source_sensor_id) ?? 'Không rõ cảm biến', segment_id: text(row.segment_id), missing: row.missing_flag === true, conflict: row.conflict_flag === true, excursion: row.excursion_flag === true } : null;
}

/** Reads batch detail and measurements exactly as the API returns them; no thresholds or exceptions are computed here. */
export async function getBatchDetail(id: string, signal?: AbortSignal): Promise<BatchDetailData> {
  const path = `batches/${encodeURIComponent(id)}`;
  const [[batch], rows] = await Promise.all([readRecords(path, signal), readRecords(`${path}/measurements`, signal)]);
  if (!batch || !text(batch.id)) throw new Error('Dữ liệu lô từ server thiếu mã lô.');
  const isPresent = <T,>(value: T | null): value is T => value !== null;
  return {
    batch: {
      id: String(batch.id), scenario_id: text(batch.scenario_id), profile_id: text(batch.profile_id), lower: number(batch.lower_threshold), upper: number(batch.upper_threshold), origin: text(batch.business_context_origin),
      segments: records(batch.segments).map(segment).filter(isPresent),
      timeline: records(batch.timeline).map(event).filter(isPresent).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
    },
    measurements: rows.map(measurement).filter(isPresent),
  };
}
