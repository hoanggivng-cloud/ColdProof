export type ProfileSource = 'FORM_FIXTURE' | 'SERVER_BATCH' | 'BOTH';
export interface ProfileRow { id: string; label: string | null; source: ProfileSource; lower: number | null; upper: number | null; durationMinutes: number | null; batchIds: string[] }
