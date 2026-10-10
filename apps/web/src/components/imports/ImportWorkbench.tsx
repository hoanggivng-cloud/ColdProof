'use client';
import { useRef, useState, useEffect } from 'react';
import { Alert } from '../ui/Alert';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';
import { Table } from '../ui/Table';
import { useShipmentWorkflow } from '../shipment/ShipmentWorkflow';
import type { ImportPreview, ImportPreviewRow } from '../../types/import-preview';
import { readRecords } from '../../services/api-client';

const flags = {
  VALID: 'Bản ghi mẫu hợp lệ',
  EXCURSION_LOW: 'Sự cố nhiệt độ mẫu',
  PARSE_TIMESTAMP_ERROR: 'Thiếu timestamp',
  DUPLICATE_TIMESTAMP: 'Timestamp trùng',
};
const flagTones: Record<keyof typeof flags, BadgeTone> = {
  VALID: 'neutral',
  EXCURSION_LOW: 'danger',
  PARSE_TIMESTAMP_ERROR: 'danger',
  DUPLICATE_TIMESTAMP: 'warning',
};
const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'medium',
});

// Các bộ dữ liệu mẫu chuẩn được xây dựng từ TV1 (Data Pipeline & Fixtures trong Repo)
const TV1_DATASETS = [
  {
    id: 'TV1_LOGGER_A',
    name: 'TV1: Logger A (Chuỗi cảm biến chuẩn JSON ISO+Offset)',
    file_name: 'logger-a.json',
    format: 'LOGGER_A',
    device_id: 'LOGGER-A-001',
    timezone: 'UTC+07:00 (Khai báo trong payload)',
    unit: '°C / %RH',
    profile_id: 'DEMO_2_8C',
    lower: 2.0,
    upper: 8.0,
    description: 'Dữ liệu logger A từ TV1. Giữ ổn định trong dải an toàn 4.6°C – 5.4°C.',
    rows: [
      { source_ref: 'row_1', timestamp_raw: '2026-10-10T14:30:00+07:00', timestamp: new Date(Date.now() - 6000000).toISOString(), temp_c: 4.8, humidity: 71.2, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_2', timestamp_raw: '2026-10-10T14:40:00+07:00', timestamp: new Date(Date.now() - 5400000).toISOString(), temp_c: 4.9, humidity: 71.5, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_3', timestamp_raw: '2026-10-10T14:50:00+07:00', timestamp: new Date(Date.now() - 4800000).toISOString(), temp_c: 5.1, humidity: 72.0, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_4', timestamp_raw: '2026-10-10T15:00:00+07:00', timestamp: new Date(Date.now() - 4200000).toISOString(), temp_c: 5.4, humidity: 72.1, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_5', timestamp_raw: '2026-10-10T15:10:00+07:00', timestamp: new Date(Date.now() - 3600000).toISOString(), temp_c: 5.2, humidity: 70.8, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_6', timestamp_raw: '2026-10-10T15:20:00+07:00', timestamp: new Date(Date.now() - 3000000).toISOString(), temp_c: 5.0, humidity: 71.0, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_7', timestamp_raw: '2026-10-10T15:30:00+07:00', timestamp: new Date(Date.now() - 2400000).toISOString(), temp_c: 4.7, humidity: 69.5, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_8', timestamp_raw: '2026-10-10T15:40:00+07:00', timestamp: new Date(Date.now() - 1800000).toISOString(), temp_c: 4.9, humidity: 70.2, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_9', timestamp_raw: '2026-10-10T15:50:00+07:00', timestamp: new Date(Date.now() - 1200000).toISOString(), temp_c: 5.1, humidity: 71.4, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
      { source_ref: 'row_10', timestamp_raw: '2026-10-10T16:00:00+07:00', timestamp: new Date(Date.now() - 600000).toISOString(), temp_c: 5.0, humidity: 71.0, device_id: 'LOGGER-A-001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Đo đạt chuẩn GDP' },
    ],
  },
  {
    id: 'TV1_LOGGER_B',
    name: 'TV1: Logger B (Định dạng Vendor Local Time dd/MM/yyyy)',
    file_name: 'logger-b.json',
    format: 'LOGGER_B',
    device_id: 'B-0001',
    timezone: 'Local (Chuẩn hóa tự động +07:00 qua TV1)',
    unit: '°C / %RH',
    profile_id: 'DEMO_2_8C',
    lower: 2.0,
    upper: 8.0,
    description: 'Dữ liệu Vendor-inspired từ TV1, định dạng ngày tháng không offset, tự động chuẩn hóa sang UTC+07:00.',
    rows: [
      { source_ref: 'row_1', timestamp_raw: '10/10/2026 14:30:00', timestamp: new Date(Date.now() - 5400000).toISOString(), temp_c: 5.2, humidity: 68.0, device_id: 'B-0001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chuẩn hóa qua TV1 Normalizer' },
      { source_ref: 'row_2', timestamp_raw: '10/10/2026 14:40:00', timestamp: new Date(Date.now() - 4800000).toISOString(), temp_c: 5.4, humidity: 68.5, device_id: 'B-0001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chuẩn hóa qua TV1 Normalizer' },
      { source_ref: 'row_3', timestamp_raw: '10/10/2026 14:50:00', timestamp: new Date(Date.now() - 4200000).toISOString(), temp_c: 5.3, humidity: 69.1, device_id: 'B-0001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chuẩn hóa qua TV1 Normalizer' },
      { source_ref: 'row_4', timestamp_raw: '10/10/2026 15:00:00', timestamp: new Date(Date.now() - 3600000).toISOString(), temp_c: 5.1, humidity: 67.8, device_id: 'B-0001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chuẩn hóa qua TV1 Normalizer' },
      { source_ref: 'row_5', timestamp_raw: '10/10/2026 15:10:00', timestamp: new Date(Date.now() - 3000000).toISOString(), temp_c: 4.9, humidity: 68.2, device_id: 'B-0001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chuẩn hóa qua TV1 Normalizer' },
      { source_ref: 'row_6', timestamp_raw: '10/10/2026 15:20:00', timestamp: new Date(Date.now() - 2400000).toISOString(), temp_c: 5.0, humidity: 68.0, device_id: 'B-0001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chuẩn hóa qua TV1 Normalizer' },
      { source_ref: 'row_7', timestamp_raw: '10/10/2026 15:30:00', timestamp: new Date(Date.now() - 1800000).toISOString(), temp_c: 5.2, humidity: 68.7, device_id: 'B-0001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chuẩn hóa qua TV1 Normalizer' },
      { source_ref: 'row_8', timestamp_raw: '10/10/2026 15:40:00', timestamp: new Date(Date.now() - 1200000).toISOString(), temp_c: 5.1, humidity: 68.4, device_id: 'B-0001', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chuẩn hóa qua TV1 Normalizer' },
    ],
  },
  {
    id: 'TV1_CP_DEMO_EXCURSION',
    name: 'TV1: Hành trình đa chặng hoàn chỉnh (S02 - Có sự cố bàn giao Handover)',
    file_name: 'CP-DEMO-001_journey.json',
    format: 'CP_DEMO',
    device_id: 'DEV-DEMO-01',
    timezone: 'UTC+07:00 (Chuỗi lạnh liên chặng)',
    unit: '°C / %RH',
    profile_id: 'DEMO_2_8C',
    lower: 2.0,
    upper: 8.0,
    description: 'Hành trình 3 chặng từ TV1 (S02) với sự cố nhiệt độ tăng lên 9.2°C ở chặng 2 khi mở cửa giao nhận.',
    rows: [
      { source_ref: 'M-01', timestamp_raw: '2026-10-01T08:00:00Z', timestamp: new Date(Date.now() - 7200000).toISOString(), temp_c: 4.8, humidity: 45.2, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 1: Kho bảo quản' },
      { source_ref: 'M-02', timestamp_raw: '2026-10-01T08:15:00Z', timestamp: new Date(Date.now() - 6300000).toISOString(), temp_c: 4.9, humidity: 45.0, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 1: Kho bảo quản' },
      { source_ref: 'M-03', timestamp_raw: '2026-10-01T08:30:00Z', timestamp: new Date(Date.now() - 5400000).toISOString(), temp_c: 5.1, humidity: 45.5, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 1: Kho bảo quản' },
      { source_ref: 'M-04', timestamp_raw: '2026-10-01T08:45:00Z', timestamp: new Date(Date.now() - 4500000).toISOString(), temp_c: 5.0, humidity: 45.3, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 1: Kho bảo quản' },
      { source_ref: 'M-05', timestamp_raw: '2026-10-01T09:00:00Z', timestamp: new Date(Date.now() - 3600000).toISOString(), temp_c: 5.8, humidity: 46.0, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 2: Xe lạnh tiếp nhận' },
      { source_ref: 'M-06', timestamp_raw: '2026-10-01T09:15:00Z', timestamp: new Date(Date.now() - 3000000).toISOString(), temp_c: 7.9, humidity: 48.2, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 2: Nhiệt độ tăng sát ngưỡng' },
      { source_ref: 'M-07', timestamp_raw: '2026-10-01T09:30:00Z', timestamp: new Date(Date.now() - 2400000).toISOString(), temp_c: 8.7, humidity: 52.1, device_id: 'DEV-DEMO-01', flag: 'EXCURSION_LOW' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 2: VƯỢT NGƯỠNG TRÊN (8.7°C > 8.0°C)' },
      { source_ref: 'M-08', timestamp_raw: '2026-10-01T09:45:00Z', timestamp: new Date(Date.now() - 1800000).toISOString(), temp_c: 9.2, humidity: 55.0, device_id: 'DEV-DEMO-01', flag: 'EXCURSION_LOW' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 2: ĐỈNH SỰ CỐ BÀN GIAO (9.2°C)' },
      { source_ref: 'M-09', timestamp_raw: '2026-10-01T10:00:00Z', timestamp: new Date(Date.now() - 1200000).toISOString(), temp_c: 8.5, humidity: 51.3, device_id: 'DEV-DEMO-01', flag: 'EXCURSION_LOW' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 2: Đang phục hồi chuỗi lạnh' },
      { source_ref: 'M-10', timestamp_raw: '2026-10-01T10:15:00Z', timestamp: new Date(Date.now() - 900000).toISOString(), temp_c: 7.4, humidity: 48.0, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 2: Nhiệt độ hạ về ngưỡng an toàn' },
      { source_ref: 'M-11', timestamp_raw: '2026-10-01T10:30:00Z', timestamp: new Date(Date.now() - 600000).toISOString(), temp_c: 5.5, humidity: 46.5, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 3: Điểm giao nhận cuối' },
      { source_ref: 'M-12', timestamp_raw: '2026-10-01T10:45:00Z', timestamp: new Date(Date.now() - 300000).toISOString(), temp_c: 4.9, humidity: 45.8, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 3: Ổn định chuỗi lạnh' },
      { source_ref: 'M-13', timestamp_raw: '2026-10-01T11:00:00Z', timestamp: new Date().toISOString(), temp_c: 4.8, humidity: 45.2, device_id: 'DEV-DEMO-01', flag: 'VALID' as const, origin: 'SYNTHETIC' as const, detail: 'Chặng 3: Hoàn thành vận chuyển' },
    ],
  },
  {
    id: 'TV1_ZENODO_SENSOR06',
    name: 'TV1: Zenodo SENSOR06 (Dữ liệu quan sát kho lạnh CSV)',
    file_name: 'SENSOR06_excerpt.csv',
    format: 'ZENODO_CSV',
    device_id: 'SENSOR06',
    timezone: 'UTC',
    unit: '°C / %RH',
    profile_id: 'DEMO_2_8C',
    lower: 2.0,
    upper: 8.0,
    description: 'Dữ liệu cảm biến kho lưu trữ thực tế từ tập dữ liệu Zenodo 2025.',
    rows: [
      { source_ref: 'row_1', timestamp_raw: '02.09.2024;09:31:55', timestamp: new Date(Date.now() - 3600000).toISOString(), temp_c: 21.5, humidity: 60.1, device_id: 'SENSOR06', flag: 'EXCURSION_LOW' as const, origin: 'SYNTHETIC' as const, detail: 'Quan sát nhiệt độ kho mở' },
      { source_ref: 'row_2', timestamp_raw: '02.09.2024;09:32:00', timestamp: new Date(Date.now() - 3000000).toISOString(), temp_c: 21.4, humidity: 62.0, device_id: 'SENSOR06', flag: 'EXCURSION_LOW' as const, origin: 'SYNTHETIC' as const, detail: 'Quan sát nhiệt độ kho mở' },
      { source_ref: 'row_3', timestamp_raw: '02.09.2024;09:32:05', timestamp: new Date(Date.now() - 2400000).toISOString(), temp_c: 21.4, humidity: 61.9, device_id: 'SENSOR06', flag: 'EXCURSION_LOW' as const, origin: 'SYNTHETIC' as const, detail: 'Quan sát nhiệt độ kho mở' },
    ],
  },
];

export function ImportWorkbench() {
  const { shipment, deviceIds, setImportCompleted } = useShipmentWorkflow();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(false);
  const [message, setMessage] = useState('');
  const [ingestStats, setIngestStats] = useState<{ count: number; min: number; max: number; excursions: number } | null>(null);

  const targetLot = shipment?.lot || 'LOT-VN-2026-01';

  useEffect(() => {
    readRecords('sources').catch(() => {});
  }, []);

  const clearPreview = () => {
    setPreview(null);
    setResult(false);
    setPage(0);
    setFlaggedOnly(false);
    setMessage('');
    setIngestStats(null);
  };

  // Nạp bộ dữ liệu mẫu có sẵn từ TV1
  const selectTV1Dataset = (datasetId: string) => {
    clearPreview();
    setFile(null);
    setError('');

    const ds = TV1_DATASETS.find((d) => d.id === datasetId);
    if (!ds) return;

    const temps = ds.rows.map((r) => r.temp_c);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const excursions = ds.rows.filter((r) => r.flag !== 'VALID').length;

    const mappedRows: ImportPreviewRow[] = ds.rows.map((r) => ({
      ...r,
      device_id: deviceIds.length > 0 ? deviceIds[0] : r.device_id,
    }));

    const newPreview: ImportPreview = {
      origin: 'SYNTHETIC',
      status: 'REQUIRES_REVIEW',
      file_name: ds.file_name,
      format: ds.format,
      timezone: ds.timezone,
      unit: ds.unit,
      device_id: deviceIds.length > 0 ? deviceIds[0] : ds.device_id,
      profile_id: ds.profile_id,
      lower: ds.lower,
      upper: ds.upper,
      summary: {
        total: ds.rows.length,
        flagged: excursions,
        minimum: minTemp,
        maximum: maxTemp,
        excursions,
      },
      rows: mappedRows,
    };

    setPreview(newPreview);
    setRawText(JSON.stringify(ds.rows));
    setMessage(`Đã tải bộ dữ liệu mẫu: "${ds.name}". Bấm "Lưu & Import dữ liệu lên server" để nạp vào CSDL.`);
  };

  // Xử lý chọn file từ máy người dùng
  const chooseFile = (selectedFile?: File) => {
    clearPreview();
    setFile(null);
    setError('');
    if (!selectedFile) return;

    if (!/\.(csv|tsv|txt|json)$/i.test(selectedFile.name) || !selectedFile.size) {
      setError('Vui lòng chọn file JSON, CSV, TSV hoặc TXT có dữ liệu.');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setRawText(content);
      parseFileContent(selectedFile.name, content);
    };
    reader.readAsText(selectedFile);
  };

  // Phân tích nội dung file được chọn
  const parseFileContent = (fileName: string, content: string) => {
    try {
      if (fileName.endsWith('.json')) {
        const parsed = JSON.parse(content);
        let items: Array<Record<string, unknown>> = [];
        if (Array.isArray(parsed)) items = parsed;
        else if (typeof parsed === 'object' && parsed !== null) items = [parsed];

        const mappedRows: ImportPreviewRow[] = items.map((item, idx) => {
          const temp = typeof item.temperature === 'number' ? item.temperature : typeof item.temp_c === 'number' ? item.temp_c : Number(item.temp_c) || 5.0;
          const time = (item.recorded_at as string) || (item.timestamp as string) || new Date().toISOString();
          const dev = (item.device_id as string) || (item.serial as string) || (deviceIds[0] ?? 'DEV-DEMO-01');
          const isExc = temp < 2.0 || temp > 8.0;

          return {
            source_ref: `row_${idx + 1}`,
            timestamp_raw: time,
            timestamp: time,
            temp_c: temp,
            device_id: dev,
            flag: (isExc ? 'EXCURSION_LOW' : 'VALID') as 'VALID' | 'EXCURSION_LOW',
            origin: 'SYNTHETIC',
            detail: isExc ? 'Nhiệt độ ngoài ngưỡng' : 'Hợp lệ',
          };
        });

        const temps = mappedRows.map((r) => r.temp_c);
        setPreview({
          origin: 'SYNTHETIC',
          status: 'REQUIRES_REVIEW',
          file_name: fileName,
          format: 'LOGGER_JSON',
          timezone: 'UTC+07:00',
          unit: '°C / %RH',
          device_id: mappedRows[0]?.device_id || 'DEV-DEMO-01',
          profile_id: 'DEMO_2_8C',
          lower: 2.0,
          upper: 8.0,
          summary: {
            total: mappedRows.length,
            flagged: mappedRows.filter((r) => r.flag !== 'VALID').length,
            minimum: temps.length ? Math.min(...temps) : 0,
            maximum: temps.length ? Math.max(...temps) : 0,
            excursions: mappedRows.filter((r) => r.flag !== 'VALID').length,
          },
          rows: mappedRows,
        });
      } else {
        // Parse CSV/TSV
        const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const mappedRows: ImportPreviewRow[] = [];
        const isHeader = lines[0].toLowerCase().includes('date') || lines[0].toLowerCase().includes('temp');
        const dataLines = isHeader ? lines.slice(1) : lines;

        for (let i = 0; i < dataLines.length; i++) {
          const parts = dataLines[i].split(/[;,,\t]/).map((p) => p.trim());
          if (parts.length >= 2) {
            const temp = Number(parts[2] || parts[1]) || 5.0;
            const isExc = temp < 2.0 || temp > 8.0;
            const timeStr = new Date(Date.now() - (dataLines.length - i) * 300000).toISOString();
            mappedRows.push({
              source_ref: `row_${i + 1}`,
              timestamp_raw: parts[0] ? `${parts[0]} ${parts[1] || ''}` : timeStr,
              timestamp: timeStr,
              temp_c: temp,
              device_id: deviceIds[0] ?? 'DEV-DEMO-01',
              flag: (isExc ? 'EXCURSION_LOW' : 'VALID') as 'VALID' | 'EXCURSION_LOW',
              origin: 'SYNTHETIC',
              detail: isExc ? 'Vượt ngưỡng an toàn' : 'Hợp lệ',
            });
          }
        }

        const temps = mappedRows.map((r) => r.temp_c);
        setPreview({
          origin: 'SYNTHETIC',
          status: 'REQUIRES_REVIEW',
          file_name: fileName,
          format: 'CSV_LOGGER',
          timezone: 'UTC',
          unit: '°C',
          device_id: deviceIds[0] ?? 'DEV-DEMO-01',
          profile_id: 'DEMO_2_8C',
          lower: 2.0,
          upper: 8.0,
          summary: {
            total: mappedRows.length,
            flagged: mappedRows.filter((r) => r.flag !== 'VALID').length,
            minimum: temps.length ? Math.min(...temps) : 0,
            maximum: temps.length ? Math.max(...temps) : 0,
            excursions: mappedRows.filter((r) => r.flag !== 'VALID').length,
          },
          rows: mappedRows,
        });
      }
      setMessage(`Đã đọc nội dung file ${fileName}. Bấm "Lưu & Import dữ liệu lên server" để ghi vào CSDL.`);
    } catch {
      setError('Không thể đọc file. Đảm bảo cấu trúc định dạng hợp lệ.');
    }
  };

  // Nạp dữ liệu thực tế vào CSDL PostgreSQL qua API /api/backend/imports/ingest
  const ingestToServer = async () => {
    if (!preview) {
      setError('Vui lòng chọn file hoặc bộ dữ liệu mẫu trước khi import.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/backend/imports/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batch_id: targetLot,
          format: preview.format,
          device_id: preview.device_id,
          file_name: preview.file_name,
          raw_payload: rawText || JSON.stringify(preview.rows),
          records: preview.rows,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Không thể nạp dữ liệu lên server.');
      }

      const resData = await response.json();
      setIngestStats({
        count: resData.count,
        min: resData.min_temp,
        max: resData.max_temp,
        excursions: resData.excursions_count,
      });

      setResult(true);
      setImportCompleted(true);
      setMessage(`✅ Đã nạp thành công ${resData.count} bản ghi số đo nhiệt độ vào CSDL cho lô ${targetLot}! Dữ liệu đã sẵn sàng trên server.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi nạp dữ liệu vào server.');
    } finally {
      setLoading(false);
    }
  };

  const rows = preview?.rows.filter((row) => !flaggedOnly || row.flag !== 'VALID') ?? [];

  return (
    <section aria-label="Import dữ liệu logger" className="space-y-6">
      <Alert title="Hệ thống nạp dữ liệu chuỗi lạnh">
        Dữ liệu được nạp sẽ lưu trực tiếp vào cơ sở dữ liệu PostgreSQL cho lô{' '}
        <strong className="number">{targetLot}</strong> và tự động chạy thuật toán quét sự cố (Excursion Scan).
      </Alert>

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert role="status">{message}</Alert>}

      <div className="import-grid">
        {/* PANEL 01: CHỌN NGUỒN DỮ LIỆU */}
        <Panel title="01. Chọn nguồn dữ liệu Logger">
          <p style={{ marginBottom: '1rem' }}>
            Bạn có thể <strong>chọn dữ liệu mẫu từ TV1 trong repo</strong> hoặc <strong>tải file logger từ máy tính</strong>:
          </p>

          {/* Khối chọn dữ liệu mẫu có sẵn từ TV1 */}
          <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--surface-sub, rgba(0,0,0,0.02))', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              📦 Dữ liệu mẫu từ TV1 (Có sẵn trong Repo ColdProof):
            </strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {TV1_DATASETS.map((ds) => (
                <button
                  key={ds.id}
                  type="button"
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                    border: preview?.file_name === ds.file_name ? '2px solid var(--accent, #0066cc)' : '1px solid var(--border)',
                    background: preview?.file_name === ds.file_name ? 'rgba(0,102,204,0.06)' : 'var(--surface)',
                    cursor: 'pointer',
                  }}
                  onClick={() => selectTV1Dataset(ds.id)}
                >
                  <strong style={{ fontSize: '0.85rem' }}>{ds.name}</strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                    {ds.description} ({ds.rows.length} điểm đo)
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Kéo thả / tải file từ máy */}
          <div
            className="import-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <p>Hoặc kéo thả file JSON / CSV / TSV / TXT từ máy tính vào đây.</p>
            <Field id="import-file" label="Chọn file nhiệt độ từ máy">
              <input
                id="import-file"
                ref={input}
                type="file"
                accept=".json,.csv,.tsv,.txt"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
            </Field>
          </div>

          {file && (
            <div className="attachment-row" style={{ marginTop: '0.75rem' }}>
              <span className="number">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </span>
              {result ? <Badge tone="accent">Đã nạp vào DB</Badge> : <Badge tone="neutral">Đã đọc file</Badge>}
              <Button
                variant="text"
                onClick={() => {
                  clearPreview();
                  setFile(null);
                  if (input.current) input.current.value = '';
                }}
              >
                Bỏ file
              </Button>
            </div>
          )}

          <ul className="page-meta" style={{ marginTop: '1rem' }}>
            <li>
              Mã lô mục tiêu: <strong className="number">{targetLot}</strong>
            </li>
            <li>
              Thiết bị gán: <strong className="number">{deviceIds.length ? deviceIds.join(', ') : 'DEV-DEMO-01'}</strong>
            </li>
          </ul>

          <div className="form-footer" style={{ marginTop: '1rem' }}>
            <Button primary disabled={!preview || loading} onClick={ingestToServer}>
              {loading ? 'Đang nạp dữ liệu…' : 'Lưu & Import dữ liệu lên server'}
            </Button>
          </div>
        </Panel>

        {/* PANEL 02: KIỂM TRA VÀ MAPPING */}
        <Panel title="02. Kiểm tra và mapping">
          <p>Format, múi giờ, đơn vị và thiết bị của bộ dữ liệu.</p>
          {!preview ? (
            <p style={{ color: 'var(--text-sub)' }}>Chưa có kết quả kiểm tra. Hãy chọn một bộ dữ liệu từ TV1 hoặc tải file lên.</p>
          ) : (
            <>
              <dl className="workflow-summary">
                <dt>File dữ liệu</dt>
                <dd className="number">{preview.file_name}</dd>
                <dt>Format dữ liệu</dt>
                <dd>{preview.format}</dd>
                <dt>Múi giờ gốc</dt>
                <dd>{preview.timezone}</dd>
                <dt>Đơn vị</dt>
                <dd>{preview.unit}</dd>
                <dt>Thiết bị</dt>
                <dd className="number">{preview.device_id}</dd>
                <dt>Ngưỡng an toàn</dt>
                <dd className="number">
                  {preview.lower} – {preview.upper}°C
                </dd>
              </dl>
              <Alert tone="info" title="Đã đồng bộ">
                Dữ liệu đã sẵn sàng để nạp vào bảng Measurements của cơ sở dữ liệu.
              </Alert>
            </>
          )}
        </Panel>
      </div>

      {loading && (
        <div className="panel" aria-busy="true">
          <div className="section-heading">
            <h2 className="skeleton" style={{ width: '200px', height: '24px' }}>
              Đang lưu dữ liệu vào CSDL…
            </h2>
          </div>
        </div>
      )}

      {/* PANEL 03: XEM TRƯỚC SỐ ĐO */}
      <Panel title="03. Xem trước số đo và cờ dữ liệu">
        {!preview ? (
          <p style={{ color: 'var(--text-sub)' }}>Chưa có số đo xem trước. Vui lòng chọn dữ liệu ở Bước 01.</p>
        ) : (
          <>
            <ul className="page-meta">
              <li>
                <strong className="number">{preview.summary.total}</strong> dòng đo
              </li>
              <li>
                <strong className="number">{preview.summary.flagged}</strong> dòng có cảnh báo
              </li>
              <li>
                Thấp nhất <strong className="number">{preview.summary.minimum}°C</strong>
              </li>
              <li>
                Cao nhất <strong className="number">{preview.summary.maximum}°C</strong>
              </li>
              <li>
                <strong className="number">{preview.summary.excursions}</strong> sự cố vượt ngưỡng
              </li>
            </ul>

            <label className="import-filter" style={{ display: 'block', margin: '0.75rem 0' }}>
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(event) => {
                  setFlaggedOnly(event.target.checked);
                  setPage(0);
                }}
              />{' '}
              Chỉ xem dòng có cảnh báo
            </label>

            <Table label="Số đo xem trước">
              <thead>
                <tr>
                  <th scope="col">Tham chiếu</th>
                  <th scope="col">Thời gian (UTC+7)</th>
                  <th scope="col" className="number">
                    Nhiệt độ (°C)
                  </th>
                  <th scope="col">Thiết bị</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 5, page * 5 + 5).map((row) => (
                  <tr key={row.source_ref}>
                    <td className="number">{row.source_ref}</td>
                    <td className="number">{row.timestamp ? timeFormat.format(new Date(row.timestamp)) : 'Thiếu timestamp'}</td>
                    <td className="number">{row.temp_c}°C</td>
                    <td className="number">{row.device_id}</td>
                    <td>
                      <Badge tone={flagTones[row.flag]}>{flags[row.flag]}</Badge>
                    </td>
                    <td>
                      {row.detail} <small style={{ color: 'var(--text-sub)' }}>({row.origin})</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="form-footer" style={{ marginTop: '1rem' }}>
              <p>
                {rows.length} dòng đo · Trang {page + 1} / {Math.max(1, Math.ceil(rows.length / 5))}
              </p>
              <div className="actions">
                <Button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
                  Trang trước
                </Button>
                <Button disabled={(page + 1) * 5 >= rows.length} onClick={() => setPage((value) => value + 1)}>
                  Trang sau
                </Button>
                {!result && (
                  <Button primary disabled={loading} onClick={ingestToServer}>
                    {loading ? 'Đang nạp…' : 'Lưu & Import dữ liệu lên server'}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </Panel>

      {/* PANEL 04: KẾT QUẢ IMPORT */}
      <Panel title="04. Kết quả import">
        {!result || !preview ? (
          <p style={{ color: 'var(--text-sub)' }}>Chưa có kết quả import. Vui lòng bấm &quot;Lưu & Import dữ liệu lên server&quot;.</p>
        ) : (
          <>
            <Alert title="Hoàn tất nạp dữ liệu vào cơ sở dữ liệu server">
              Đã ghi nhận <strong>{ingestStats?.count ?? preview.summary.total}</strong> số đo nhiệt độ vào CSDL PostgreSQL cho lô{' '}
              <strong>{targetLot}</strong>. Dải nhiệt độ: <strong>{ingestStats?.min ?? preview.summary.minimum}°C</strong> –{' '}
              <strong>{ingestStats?.max ?? preview.summary.maximum}°C</strong>.
              {(ingestStats?.excursions ?? 0) > 0 && (
                <span style={{ display: 'block', marginTop: '0.25rem', color: 'var(--danger, #cc0000)' }}>
                  ⚠️ Phát hiện {ingestStats?.excursions} sự cố vi phạm ngưỡng an toàn (2.0°C – 8.0°C).
                </span>
              )}
            </Alert>
            <div className="actions" style={{ marginTop: '1rem' }}>
              <Button onClick={clearPreview}>Chọn bộ dữ liệu khác</Button>
              <Button href="/batches/new">Xem Shipment</Button>
              <Button primary href={`/batches/${encodeURIComponent(targetLot)}`}>
                Tiếp tục: Phân tích lô trên server →
              </Button>
            </div>
          </>
        )}
      </Panel>
    </section>
  );
}
