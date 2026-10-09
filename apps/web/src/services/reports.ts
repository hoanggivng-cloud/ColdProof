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
    segments: list(provenance.segments), source_assets: list(provenance.source_assets), parser_versions: list(provenance.parser_versions), disclaimer: text(provenance.disclaimer),
  };
}
function auditEntry(row: ApiRecord): ReportAuditEntry {
  return { id: required(row, 'id'), action: required(row, 'action'), entity_type: required(row, 'entity_type'), actor_id: text(row.actor_id), created_at: required(row, 'created_at') };
}
export async function getReports(signal?: AbortSignal): Promise<EvidenceReport[]> {
  return (await readRecords('reports', signal)).map(report);
}
export async function getReportContext(item: EvidenceReport, signal?: AbortSignal): Promise<ReportContext> {
  const path = `batches/${encodeURIComponent(item.batch_id)}`;
  const [audit, batch, issues] = await Promise.all([readRecords('audit', signal), readRecords(path, signal), readRecords(`${path}/exceptions`, signal)]);
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const count = (value: unknown) => Array.isArray(value) ? value.length : null;
  return { audit: audit.filter(row => row.entity_id === item.id).map(auditEntry), origin: text(batch[0]?.business_context_origin), lower: number(batch[0]?.lower_threshold), upper: number(batch[0]?.upper_threshold), exceptions: count(issues[0]?.exceptions), quality_issues: count(issues[0]?.quality_issues) };
}
export function reportsCSV(rows: EvidenceReport[]): string {
  const cell = (value: string) => `"${(/^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  return '﻿' + [['report_id', 'report_code', 'batch_id', 'version', 'profile_id', 'checksum_sha256', 'created_at'], ...rows.map(row => [row.id, row.report_code ?? '', row.batch_id, String(row.version), row.profile_id ?? '', row.checksum_sha256, row.created_at])].map(row => row.map(cell).join(',')).join('\r\n');
}
