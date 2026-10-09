export interface BatchSegment { id: string; source_id: string | null; device_alias: string | null; handover_id: string | null; selector: string | null }
export interface BatchEvent { id: string; timestamp: string; event_type: string; segment_id: string | null; device_alias: string | null; handover_id: string | null; detail: string | null }
export interface BatchInfo { id: string; scenario_id: string | null; profile_id: string | null; lower: number | null; upper: number | null; origin: string | null; segments: BatchSegment[]; timeline: BatchEvent[] }
export interface BatchMeasurement { record_id: string; timestamp: string | null; temperature_c: number | null; sensor: string; segment_id: string | null; missing: boolean; conflict: boolean; excursion: boolean }
export interface BatchDetailData { batch: BatchInfo; measurements: BatchMeasurement[] }
