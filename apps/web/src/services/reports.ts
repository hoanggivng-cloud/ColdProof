import { readRecords, type ApiRecord } from './api-client';
import type { EvidenceReport, ReportAuditEntry, ReportContext } from '../types/reports';
const text = (value: unknown) => typeof value === 'string' && value ? value : null;
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const required = (row: ApiRecord, key: string) => { const value = text(row[key]); if (!value) throw new Error('Dữ liệu hồ sơ từ server thiếu trường bắt buộc.'); return value; };
function report(row: ApiRecord): EvidenceReport {
  if (typeof row.version !== 'number') throw new Error('Phiên bản hồ sơ từ server không đúng định dạng.');
  const provenance: ApiRecord = typeof row.provenance === 'object' && row.provenance !== null && !Array.isArray(row.provenance) ? row.provenance as ApiRecord : {};
  return {
    id: required(row, 'id'), batch_id: required(row, 'batch_id'), version: row.version, checksum_sha256: required(row, 'checksum_sha256'), created_at: required(row, 'created_at'),
    report_code: text(provenance.report_id), scenario_id: text(provenance.scenario_id), profile_id: text(provenance.product_profile), generated_by: text(provenance.generated_by), generated_at: text(provenance.generated_at),
    segments: Array.isArray(provenance.segments) ? provenance.segments.map(s => typeof s === 'string' ? s : String((s as ApiRecord).id)) : [], source_assets: list(provenance.source_assets), parser_versions: list(provenance.parser_versions), disclaimer: text(provenance.disclaimer),
  };
}
function auditEntry(row: ApiRecord): ReportAuditEntry {
  return { id: required(row, 'id'), action: required(row, 'action'), entity_type: required(row, 'entity_type'), actor_id: text(row.actor_id), created_at: required(row, 'created_at') };
}
export async function getReports(signal?: AbortSignal): Promise<EvidenceReport[]> {
  return (await readRecords('reports', signal)).map(report);
}
export async function getReportContext(item: EvidenceReport, signal?: AbortSignal): Promise<ReportContext> {
  const [audit, reports] = await Promise.all([readRecords(`reports/${encodeURIComponent(item.id)}/audit`, signal), readRecords(`reports/${encodeURIComponent(item.id)}`, signal)]);
  const provenance = (reports[0]?.provenance ?? {}) as ApiRecord;
  const batch = (provenance.batch ?? {}) as ApiRecord;
  const thresholds = (provenance.thresholds ?? {}) as ApiRecord;
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return { audit: audit.map(auditEntry), origin: text(batch.context_origin), lower: number(thresholds.lower), upper: number(thresholds.upper), exceptions: number(provenance.exceptions_count), quality_issues: number(provenance.quality_issues_count) };
}
export function reportsCSV(rows: EvidenceReport[]): string {
  const cell = (value: string) => `"${(/^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  return '﻿' + [['report_id', 'report_code', 'batch_id', 'version', 'profile_id', 'checksum_sha256', 'created_at'], ...rows.map(row => [row.id, row.report_code ?? '', row.batch_id, String(row.version), row.profile_id ?? '', row.checksum_sha256, row.created_at])].map(row => row.map(cell).join(',')).join('\r\n');
}
