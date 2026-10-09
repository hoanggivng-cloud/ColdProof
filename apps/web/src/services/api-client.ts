export type ApiRecord = Record<string, unknown>;
export async function readRecords(path: string, signal?: AbortSignal): Promise<ApiRecord[]> {
  const response = await fetch(`/api/backend/${path}`, { signal });
  if (!response.ok) throw new Error(response.status === 503 ? 'Không kết nối được API server. Kiểm tra server và cấu hình API.' : `Không tải được dữ liệu (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  const records = Array.isArray(data) ? data : [data];
  if (!records.every(value => typeof value === 'object' && value !== null && !Array.isArray(value))) throw new Error('Dữ liệu API không đúng định dạng.');
  return records as ApiRecord[];
}
