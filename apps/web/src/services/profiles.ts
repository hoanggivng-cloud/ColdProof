import { readRecords } from './api-client';
import { setupPresets } from '../mocks/shipment-setup';
import type { ProfileRow } from '../types/profiles';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function getFormProfiles(): ProfileRow[] {
  return setupPresets.map(item => ({ id: item.id, label: item.label, source: 'FORM_FIXTURE', lower: item.lower, upper: item.upper, durationMinutes: item.durationMinutes, batchIds: [] }));
}
export async function getServerProfiles(signal?: AbortSignal): Promise<ProfileRow[]> {
  const profiles = new Map<string, ProfileRow>();
  for (const batch of await readRecords('batches', signal)) {
    if (typeof batch.profile_id !== 'string' || !batch.profile_id || typeof batch.id !== 'string') continue;
    const row = profiles.get(batch.profile_id) ?? { id: batch.profile_id, label: null, source: 'SERVER_BATCH', lower: number(batch.lower_threshold), upper: number(batch.upper_threshold), durationMinutes: null, batchIds: [] };
    row.batchIds.push(batch.id);
    profiles.set(row.id, row);
  }
  return [...profiles.values()];
}
export function mergeProfiles(form: ProfileRow[], server: ProfileRow[]): ProfileRow[] {
  const rows = new Map(form.map(row => [row.id, { ...row, batchIds: [...row.batchIds] }]));
  for (const row of server) {
    const existing = rows.get(row.id);
    rows.set(row.id, existing ? { ...existing, source: 'BOTH', batchIds: row.batchIds } : row);
  }
  return [...rows.values()];
}
export function profilesCSV(rows: ProfileRow[]): string {
  const cell = (value: string) => `"${(/^[=+\-@\t\r\n]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const text = (value: number | null) => value === null ? '' : String(value);
  return '﻿' + [['profile_id', 'label', 'source', 'lower_c', 'upper_c', 'demo_duration_minutes', 'server_batch_ids'], ...rows.map(row => [row.id, row.label ?? '', row.source, text(row.lower), text(row.upper), text(row.durationMinutes), row.batchIds.join(' ')])].map(row => row.map(cell).join(',')).join('\r\n');
}
