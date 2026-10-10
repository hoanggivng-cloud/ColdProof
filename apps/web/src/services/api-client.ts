export type ApiRecord = Record<string, unknown>;

export async function readRecords(path: string, signal?: AbortSignal): Promise<ApiRecord[]> {
  const response = await fetch(`/api/backend/${path}`, { signal });
  if (!response.ok) throw new Error(response.status === 503 ? 'Không kết nối được API server. Kiểm tra server và cấu hình API.' : `Không tải được dữ liệu (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  const records = Array.isArray(data) ? data : [data];
  if (!records.every(value => typeof value === 'object' && value !== null && !Array.isArray(value))) throw new Error('Dữ liệu API không đúng định dạng.');
  return records as ApiRecord[];
}

export async function writeRecord(path: string, method: string = 'POST', payload?: unknown, signal?: AbortSignal): Promise<ApiRecord | ApiRecord[]> {
  const init: RequestInit = {
    method,
    signal,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  };
  const response = await fetch(`/api/backend/${path}`, init);
  if (!response.ok) {
      let errorMsg = `Thao tác thất bại (HTTP ${response.status}).`;
      try {
          const body = await response.json();
          if (body && body.message) errorMsg = typeof body.message === 'string' ? body.message : JSON.stringify(body.message);
      } catch {}
      throw new Error(response.status === 503 ? 'Không kết nối được API server.' : errorMsg);
  }
  const data: unknown = await response.json();
  return data as ApiRecord | ApiRecord[];
}
