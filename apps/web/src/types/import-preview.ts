/** Presentation contract only: raw preview rows are not canonical records. */
export interface ImportPreviewRow {
  source_ref: string; timestamp_raw: string | null; timestamp: string | null; temp_c: number;
  device_id: string; flag: 'VALID' | 'EXCURSION_LOW' | 'PARSE_TIMESTAMP_ERROR' | 'DUPLICATE_TIMESTAMP';
  detail: string; origin: 'SYNTHETIC';
}
export interface ImportPreview {
  origin: 'SYNTHETIC'; file_name: string; device_id: string; format: string; timezone: string; unit: string;
  status: 'REQUIRES_REVIEW'; lower: number; upper: number; profile_id: string;
  summary: { total: number; flagged: number; minimum: number; maximum: number; excursions: number };
  rows: ImportPreviewRow[];
}
