import type { ImportPreview } from '../types/import-preview';
export const importPreview: ImportPreview = {
  origin: 'SYNTHETIC', file_name: 'logger-preview-demo.csv', device_id: 'DEV-DEMO-01',
  format: 'CSV mô phỏng', timezone: 'UTC', unit: '°C', status: 'REQUIRES_REVIEW',
  lower: 2, upper: 8, profile_id: 'PROFILE-DEMO-COLD',
  summary: { total: 6, flagged: 3, minimum: 1.8, maximum: 4.3, excursions: 1 },
  rows: [
    { source_ref: 'row:1', timestamp_raw: '2026-10-09T01:20:00Z', timestamp: '2026-10-09T01:20:00Z', temp_c: 4.1, device_id: 'DEV-DEMO-01', flag: 'VALID', detail: 'Giữ bản ghi', origin: 'SYNTHETIC' },
    { source_ref: 'row:2', timestamp_raw: '2026-10-09T01:21:00Z', timestamp: '2026-10-09T01:21:00Z', temp_c: 1.8, device_id: 'DEV-DEMO-01', flag: 'EXCURSION_LOW', detail: 'Cờ mẫu: cần QA xem xét', origin: 'SYNTHETIC' },
    { source_ref: 'row:3', timestamp_raw: null, timestamp: null, temp_c: 4.3, device_id: 'DEV-DEMO-01', flag: 'PARSE_TIMESTAMP_ERROR', detail: 'Giữ dòng gốc; thiếu timestamp', origin: 'SYNTHETIC' },
    { source_ref: 'row:4', timestamp_raw: '2026-10-09T01:22:00Z', timestamp: '2026-10-09T01:22:00Z', temp_c: 4.2, device_id: 'DEV-DEMO-01', flag: 'VALID', detail: 'Giữ bản ghi', origin: 'SYNTHETIC' },
    { source_ref: 'row:5', timestamp_raw: '2026-10-09T01:22:00Z', timestamp: '2026-10-09T01:22:00Z', temp_c: 4.2, device_id: 'DEV-DEMO-01', flag: 'DUPLICATE_TIMESTAMP', detail: 'Giữ dòng trùng và tham chiếu nguồn', origin: 'SYNTHETIC' },
    { source_ref: 'row:6', timestamp_raw: '2026-10-09T01:23:00Z', timestamp: '2026-10-09T01:23:00Z', temp_c: 4.2, device_id: 'DEV-DEMO-01', flag: 'VALID', detail: 'Giữ bản ghi', origin: 'SYNTHETIC' },
  ],
};
