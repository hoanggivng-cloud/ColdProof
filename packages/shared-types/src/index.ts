export const IMPORT_STATUSES = ['QUEUED', 'PARSING', 'NORMALIZING', 'QUALITY_CHECK', 'COMPLETE', 'FAILED'] as const;
export type ImportStatus = typeof IMPORT_STATUSES[number];
export interface ScaffoldStatus { module: string; status: 'TODO'; message: string }
export interface QualityIssue { id: string; record_ids: string[]; code: 'MISSING_INTERVAL' | 'SENSOR_CONFLICT' | 'INVALID_VALUE'; detail: string }
export interface ExceptionCandidate { id: string; batch_id: string; record_ids: string[]; profile_id: string }
export interface EvidencePackage { id: string; version: number; source_ids: string[]; checksums: string[]; transformation_refs: string[] }
export type Role = 'ADMIN' | 'DATA_ENGINEER' | 'QA_REVIEWER' | 'VIEWER';
