export interface EvidenceReport {
  id: string; batch_id: string; version: number; checksum_sha256: string; created_at: string;
  report_code: string | null; scenario_id: string | null; profile_id: string | null; generated_by: string | null; generated_at: string | null;
  segments: string[]; source_assets: string[]; parser_versions: string[]; disclaimer: string | null;
}
export interface ReportAuditEntry { id: string; action: string; entity_type: string; actor_id: string | null; created_at: string }
export interface ReportContext { audit: ReportAuditEntry[]; origin: string | null; lower: number | null; upper: number | null; exceptions: number | null; quality_issues: number | null }
