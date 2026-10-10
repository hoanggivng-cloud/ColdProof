import { createHash } from 'node:crypto';

import { CanonicalTimeSeriesMeasurementSchema } from '@coldproof/canonical-schema';
import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import {
  FileImportResultSchema,
  RawFileImportSchema,
} from '@coldproof/parser-contracts';
import type {
  FileImportIssue,
  FileImportIssueCode,
  FileImportResult,
  FileRowRejection,
  ParsedSpatialRecord,
  ParsedTimeSeriesRecord,
  RawFileImport,
} from '@coldproof/parser-contracts';
import { assessLoggerSequence } from '@coldproof/runtime-data-quality';
import type {
  RuntimeDataQualityContext,
  RuntimeDataQualityResult,
} from '@coldproof/runtime-data-quality';

import { normalizeTimeSeriesRecord } from '../../normalization/time-series-normalization';
import { MendeleyAdapter } from '../mendeley/mendeley.adapter';
import { readXlsxSheets, type XlsxSheet } from '../mendeley/xlsx-workbook';
import { ZenodoAdapter } from '../zenodo/zenodo.adapter';

export const FILE_IMPORT_POLICY_ID = 'file-import-v1';

export const FILE_IMPORT_ADAPTERS = {
  VENDOR_A_CSV: { id: 'vendor-a-csv', version: '1.0.0' },
  VENDOR_B_CSV: { id: 'vendor-b-csv', version: '1.0.0' },
  VENDOR_C_XLSX: { id: 'vendor-c-xlsx', version: '1.0.0' },
  ZENODO_CSV: { id: 'zenodo-cold-storage', version: '1.0.0' },
  MENDELEY_XLSX: { id: 'mendeley-insulated-box', version: '1.0.0' },
} as const;

export interface FileImportLimits {
  max_file_size_bytes?: number;
  max_candidate_rows?: number;
}

export interface FileImportOptions {
  expected_device_id?: string;
  sheet_name?: string;
  limits?: FileImportLimits;
}

export interface FileImportInspection {
  supported: boolean;
  adapter_id?: string;
  adapter_version?: string;
  reason: string;
}

export interface MendeleySpreadsheetContextResult {
  import_id: string;
  file_status: 'ACCEPTED' | 'FILE_REJECTED';
  adapter_id: string;
  adapter_version: string;
  content_sha256: string;
  condition_id?: string;
  spatial_records: ParsedSpatialRecord[];
  fatal_issues: FileImportIssue[];
  timeline_semantics: 'NONE';
  dq_assessment_status: 'NOT_ASSESSED';
}

type CsvRecord = {
  sourceRowNumber: number;
  values: string[];
  blank: boolean;
};

type ParsedCsv = {
  records: CsvRecord[];
  physicalRows: number;
};

type CandidateRow = {
  sourceRowNumber: number;
  sheetName?: string;
  deviceId?: string;
  timestampRaw?: string;
  timestampLocal?: string;
  sourceDeclaredOffset?: string;
  temperatureRaw?: string;
  temperatureC?: number;
  humidityPct?: number;
  formulaField?: string;
  rawValues: Record<string, string | undefined>;
  parserWarnings: string[];
};

type ParsedRows = {
  physicalRows: number;
  structuralRows: number;
  candidates: CandidateRow[];
  warnings: string[];
};

class CsvSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvSyntaxError';
  }
}

const zenodoAdapter = new ZenodoAdapter();
const mendeleyAdapter = new MendeleyAdapter();
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const OFFSET_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/;

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function issue(code: FileImportIssueCode, message: string, field?: string): FileImportIssue {
  return { code, message, ...(field !== undefined ? { field } : {}) };
}

function adapterFor(format: RawFileImport['source_format']): {
  id: string;
  version: string;
} | undefined {
  if (format === 'UNKNOWN') return undefined;
  return FILE_IMPORT_ADAPTERS[format];
}

function fallbackFormat(value: unknown): RawFileImport['source_format'] {
  return typeof value === 'string' && Object.hasOwn(FILE_IMPORT_ADAPTERS, value)
    ? value as keyof typeof FILE_IMPORT_ADAPTERS
    : 'UNKNOWN';
}

function rejectedFile(
  raw: Partial<RawFileImport>,
  fatalIssues: FileImportIssue[],
  adapter = { id: 'unresolved-file-adapter', version: '1.0.0' },
  counts = {
    physical_rows: 0,
    structural_rows: 0,
    candidate_data_rows: 0,
    canonical_rows: 0,
    rejected_data_rows: 0,
  },
): FileImportResult {
  return FileImportResultSchema.parse({
    import_id: typeof raw.import_id === 'string' && raw.import_id !== ''
      ? raw.import_id
      : 'invalid-import',
    original_filename:
      typeof raw.original_filename === 'string' && raw.original_filename !== ''
        ? raw.original_filename
        : 'unknown-file',
    source_format: fallbackFormat(raw.source_format),
    content_sha256:
      typeof raw.content_sha256 === 'string' && /^[a-f0-9]{64}$/.test(raw.content_sha256)
        ? raw.content_sha256
        : '0'.repeat(64),
    adapter_id: adapter.id,
    adapter_version: adapter.version,
    file_status: 'FILE_REJECTED',
    counts,
    row_rejections: [],
    fatal_issues: fatalIssues,
    warnings: [],
    canonical_measurements: [],
  });
}

function validateEnvelope(
  input: RawFileImport,
  options: FileImportOptions,
): FileImportResult | undefined {
  const contract = RawFileImportSchema.safeParse(input);
  if (!contract.success) {
    return rejectedFile(input, [
      issue(
        'INVALID_FILE_IMPORT_CONTRACT',
        contract.error.issues.map((item) => `${item.path.join('.')}: ${item.message}`).join('; '),
      ),
    ]);
  }
  const adapter = adapterFor(input.source_format);
  if (!adapter) {
    return rejectedFile(input, [issue('UNSUPPORTED_FILE_FORMAT', 'Unknown file source format')]);
  }
  if (input.adapter_hint !== undefined && input.adapter_hint !== adapter.id) {
    return rejectedFile(input, [
      issue(
        'NO_COMPATIBLE_ADAPTER',
        `Adapter hint ${input.adapter_hint} does not match ${adapter.id}`,
        'adapter_hint',
      ),
    ], adapter);
  }
  if (input.content.length !== input.file_size_bytes) {
    return rejectedFile(input, [
      issue('FILE_SIZE_MISMATCH', 'file_size_bytes does not match the exact uploaded bytes'),
    ], adapter);
  }
  if (sha256(input.content) !== input.content_sha256) {
    return rejectedFile(input, [
      issue('FILE_CHECKSUM_MISMATCH', 'content_sha256 does not match the exact uploaded bytes'),
    ], adapter);
  }
  const maxSize = options.limits?.max_file_size_bytes;
  if (maxSize !== undefined && input.content.length > maxSize) {
    return rejectedFile(input, [
      issue('FILE_LIMIT_EXCEEDED', `File exceeds configured limit of ${maxSize} bytes`),
    ], adapter);
  }
  if (
    input.source_format.startsWith('VENDOR_') &&
    (input.origin !== 'SYNTHETIC' || input.format_origin !== 'VENDOR_INSPIRED')
  ) {
    return rejectedFile(input, [
      issue(
        'INVALID_FILE_IMPORT_CONTRACT',
        'Vendor-inspired fixtures must be SYNTHETIC and VENDOR_INSPIRED',
      ),
    ], adapter);
  }
  return undefined;
}

/** RFC-4180-style deterministic parser for one configured delimiter. */
function parseCsv(content: Buffer, delimiter: ',' | ';'): ParsedCsv {
  let text = content.toString('utf8');
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  if (text.length === 0) return { records: [], physicalRows: 0 };

  const records: CsvRecord[] = [];
  let values: string[] = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;
  let rowNumber = 1;
  let recordStartRow = 1;

  const finishRecord = () => {
    values.push(field);
    const blank = values.every((value) => value.trim() === '');
    records.push({ sourceRowNumber: recordStartRow, values, blank });
    values = [];
    field = '';
    afterQuote = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else if (character === '\n' || character === '\r') {
        throw new CsvSyntaxError(`Quoted multiline field is unsupported at row ${recordStartRow}`);
      } else {
        field += character;
      }
      continue;
    }
    if (afterQuote && character !== delimiter && character !== '\n' && character !== '\r') {
      if (/\s/.test(character)) continue;
      throw new CsvSyntaxError(`Unexpected character after closing quote at row ${recordStartRow}`);
    }
    if (character === '"') {
      if (field !== '') throw new CsvSyntaxError(`Unexpected quote at row ${recordStartRow}`);
      quoted = true;
      continue;
    }
    if (character === delimiter) {
      values.push(field);
      field = '';
      afterQuote = false;
      continue;
    }
    if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      finishRecord();
      rowNumber += 1;
      recordStartRow = rowNumber;
      continue;
    }
    field += character;
  }
  if (quoted) throw new CsvSyntaxError(`Unclosed quoted field at row ${recordStartRow}`);
  if (field !== '' || values.length > 0 || !/[\r\n]$/.test(text)) finishRecord();
  return { records, physicalRows: records.length };
}

function normalizedHeaders(values: readonly string[]): string[] {
  return values.map((value) => value.trim());
}

function headerIndex(headers: readonly string[]): Map<string, number> {
  return new Map(headers.map((header, index) => [header, index]));
}

function finiteDecimal(value: string | undefined): number | undefined {
  if (value === undefined || !DECIMAL.test(value.trim())) return undefined;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : undefined;
}

function vendorCsvRows(
  input: RawFileImport,
  delimiter: ',' | ';',
  expectedHeaders: readonly string[],
): ParsedRows | FileImportResult {
  const adapter = adapterFor(input.source_format) as { id: string; version: string };
  let parsed: ParsedCsv;
  try {
    parsed = parseCsv(input.content, delimiter);
  } catch (error) {
    return rejectedFile(input, [
      issue('MALFORMED_CSV_ROW', error instanceof Error ? error.message : 'Malformed CSV'),
    ], adapter);
  }
  if (parsed.records.length === 0 || parsed.records.every((record) => record.blank)) {
    return rejectedFile(input, [issue('EMPTY_FILE', 'CSV contains no physical content rows')], adapter);
  }
  const firstContentIndex = parsed.records.findIndex((record) => !record.blank);
  const header = parsed.records[firstContentIndex];
  const headers = normalizedHeaders(header.values);
  const missing = expectedHeaders.filter((name) => !headers.includes(name));
  if (missing.length > 0) {
    return rejectedFile(input, [
      issue('MISSING_REQUIRED_COLUMN', `Missing required columns: ${missing.join(', ')}`),
    ], adapter, {
      physical_rows: parsed.physicalRows,
      structural_rows: parsed.physicalRows,
      candidate_data_rows: 0,
      canonical_rows: 0,
      rejected_data_rows: 0,
    });
  }

  const indices = headerIndex(headers);
  const candidates: CandidateRow[] = [];
  let structuralRows = 0;
  let repeatedHeaders = 0;
  for (const record of parsed.records) {
    if (record.blank || record === header) {
      structuralRows += 1;
      continue;
    }
    const rowHeaders = normalizedHeaders(record.values);
    if (JSON.stringify(rowHeaders) === JSON.stringify(headers)) {
      structuralRows += 1;
      repeatedHeaders += 1;
      continue;
    }
    const value = (name: string) => record.values[indices.get(name) as number];
    if (input.source_format === 'VENDOR_A_CSV') {
      const timestampRaw = value('recorded_at');
      const match = OFFSET_TIMESTAMP.exec(timestampRaw?.trim() ?? '');
      candidates.push({
        sourceRowNumber: record.sourceRowNumber,
        deviceId: value('device_id')?.trim(),
        timestampRaw,
        timestampLocal: match?.[1],
        sourceDeclaredOffset: match?.[2] === 'Z' ? '+00:00' : match?.[2],
        temperatureRaw: value('temperature_c'),
        temperatureC: finiteDecimal(value('temperature_c')),
        humidityPct: finiteDecimal(value('humidity_percent')),
        rawValues: Object.fromEntries(headers.map((name, index) => [name, record.values[index]])),
        parserWarnings: [],
      });
    } else {
      const date = value('Date')?.trim() ?? '';
      const time = value('Time')?.trim() ?? '';
      const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
      candidates.push({
        sourceRowNumber: record.sourceRowNumber,
        deviceId: value('Device ID')?.trim(),
        timestampRaw: `${date};${time}`,
        timestampLocal: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T${time}` : undefined,
        temperatureRaw: value('Temperature (C)'),
        temperatureC: finiteDecimal(value('Temperature (C)')),
        humidityPct: finiteDecimal(value('Humidity (%)')),
        rawValues: Object.fromEntries(headers.map((name, index) => [name, record.values[index]])),
        parserWarnings: [],
      });
    }
  }
  if (candidates.length === 0) {
    return rejectedFile(input, [issue('HEADER_ONLY_FILE', 'CSV has a header but no data rows')], adapter, {
      physical_rows: parsed.physicalRows,
      structural_rows: parsed.physicalRows,
      candidate_data_rows: 0,
      canonical_rows: 0,
      rejected_data_rows: 0,
    });
  }
  return {
    physicalRows: parsed.physicalRows,
    structuralRows,
    candidates,
    warnings: repeatedHeaders > 0
      ? [`REPEATED_HEADER_ROW: skipped ${repeatedHeaders} structural row(s)`]
      : [],
  };
}

function compatibleSheet(sheet: XlsxSheet): { headerRow: number; headers: Map<string, number> } | undefined {
  const required = ['device_id', 'recorded_at', 'temperature_c'];
  const rowNumbers = [...new Set(sheet.cells.map((cell) => cell.row))].sort((a, b) => a - b);
  for (const row of rowNumbers) {
    const headers = new Map<string, number>();
    for (const cell of sheet.cells.filter((candidate) => candidate.row === row)) {
      if (cell.value !== undefined) headers.set(cell.value.trim(), cell.column);
    }
    if (required.every((name) => headers.has(name))) return { headerRow: row, headers };
  }
  return undefined;
}

function vendorXlsxRows(
  input: RawFileImport,
  options: FileImportOptions,
): ParsedRows | FileImportResult {
  const adapter = FILE_IMPORT_ADAPTERS.VENDOR_C_XLSX;
  let sheets: XlsxSheet[];
  try {
    sheets = readXlsxSheets(input.content);
  } catch (error) {
    return rejectedFile(input, [
      issue('CORRUPTED_WORKBOOK', error instanceof Error ? error.message : 'Unreadable XLSX workbook'),
    ], adapter);
  }
  const compatible = sheets
    .map((sheet) => ({ sheet, match: compatibleSheet(sheet) }))
    .filter((item): item is { sheet: XlsxSheet; match: { headerRow: number; headers: Map<string, number> } } => item.match !== undefined);
  const selected = options.sheet_name === undefined
    ? compatible
    : compatible.filter((item) => item.sheet.name === options.sheet_name);
  if (selected.length === 0) {
    return rejectedFile(input, [
      issue('UNSUPPORTED_SHEET_STRUCTURE', 'No compatible measurement worksheet was found'),
    ], adapter);
  }
  if (selected.length > 1) {
    return rejectedFile(input, [
      issue('AMBIGUOUS_SHEET_SELECTION', 'Multiple compatible worksheets require explicit sheet_name'),
    ], adapter);
  }

  const { sheet, match } = selected[0];
  const materializedRows = [...new Set(sheet.cells.map((cell) => cell.row))].sort((a, b) => a - b);
  const candidates: CandidateRow[] = [];
  let structuralRows = 0;
  for (const rowNumber of materializedRows) {
    if (rowNumber <= match.headerRow) {
      structuralRows += 1;
      continue;
    }
    const cells = new Map(
      sheet.cells.filter((cell) => cell.row === rowNumber).map((cell) => [cell.column, cell]),
    );
    const deviceCell = cells.get(match.headers.get('device_id') as number);
    const timestampCell = cells.get(match.headers.get('recorded_at') as number);
    const temperatureCell = cells.get(match.headers.get('temperature_c') as number);
    const humidityColumn = match.headers.get('humidity_percent');
    const humidityCell = humidityColumn === undefined ? undefined : cells.get(humidityColumn);
    const values = [deviceCell?.value, timestampCell?.value, temperatureCell?.value, humidityCell?.value];
    if (values.every((value) => value === undefined || value.trim() === '')) {
      structuralRows += 1;
      continue;
    }
    const timestampRaw = timestampCell?.value;
    const timestampMatch = OFFSET_TIMESTAMP.exec(timestampRaw?.trim() ?? '');
    const formulaCell = [deviceCell, timestampCell, temperatureCell, humidityCell].find(
      (cell) => cell?.formula !== undefined,
    );
    candidates.push({
      sourceRowNumber: rowNumber,
      sheetName: sheet.name,
      deviceId: deviceCell?.value?.trim(),
      timestampRaw,
      timestampLocal: timestampMatch?.[1],
      sourceDeclaredOffset: timestampMatch?.[2] === 'Z' ? '+00:00' : timestampMatch?.[2],
      temperatureRaw: temperatureCell?.value,
      temperatureC: finiteDecimal(temperatureCell?.value),
      humidityPct: finiteDecimal(humidityCell?.value),
      ...(formulaCell !== undefined ? { formulaField: formulaCell.reference } : {}),
      rawValues: {
        device_id: deviceCell?.value,
        recorded_at: timestampRaw,
        temperature_c: temperatureCell?.value,
        humidity_percent: humidityCell?.value,
      },
      parserWarnings: [],
    });
  }
  if (candidates.length === 0) {
    return rejectedFile(input, [issue('HEADER_ONLY_FILE', 'Worksheet has headers but no data rows')], adapter, {
      physical_rows: materializedRows.length,
      structural_rows: materializedRows.length,
      candidate_data_rows: 0,
      canonical_rows: 0,
      rejected_data_rows: 0,
    });
  }
  return {
    physicalRows: materializedRows.length,
    structuralRows,
    candidates,
    warnings: [],
  };
}

function physicalCsvRecords(content: Buffer): CsvRecord[] {
  return parseCsv(content, ';').records;
}

async function zenodoRows(input: RawFileImport): Promise<ParsedRows | FileImportResult> {
  const adapter = FILE_IMPORT_ADAPTERS.ZENODO_CSV;
  const metadata = {
    fileName: input.original_filename,
    dataset: 'ZENODO:10.5281/zenodo.15130001',
    checksumSha256: input.content_sha256,
    sourceFormat: 'ZENODO_CSV',
    measurementOrigin: input.origin,
    mimeType: input.media_type,
  } as const;
  const detection = zenodoAdapter.canParse(metadata, input.content);
  if (!detection.supported) {
    return rejectedFile(input, [
      issue('MISSING_REQUIRED_COLUMN', detection.reason ?? 'Unsupported Zenodo CSV structure'),
    ], adapter);
  }
  let records: CsvRecord[];
  try {
    records = physicalCsvRecords(input.content);
  } catch (error) {
    return rejectedFile(input, [
      issue('MALFORMED_CSV_ROW', error instanceof Error ? error.message : 'Malformed CSV'),
    ], adapter);
  }
  const parsedRecords: ParsedTimeSeriesRecord[] = [];
  try {
    for await (const record of zenodoAdapter.parse({ metadata, content: input.content })) {
      if (record.recordType === 'TIMESERIES') parsedRecords.push(record);
    }
  } catch (error) {
    return rejectedFile(input, [
      issue('MALFORMED_CSV_ROW', error instanceof Error ? error.message : 'Zenodo parse failure'),
    ], adapter);
  }
  const candidates = parsedRecords.map((record) => ({
    sourceRowNumber: Number(record.rawRef.slice('row:'.length)),
    deviceId: record.sourceMetadata.sourceSensorId,
    timestampRaw: record.timestampRaw,
    timestampLocal: record.timestamp,
    temperatureRaw: record.temperatureRaw,
    temperatureC: record.temperatureC,
    humidityPct: record.humidityPct,
    rawValues: {
      timestamp: record.timestampRaw,
      temperature: record.temperatureRaw,
      humidity: record.humidityPct?.toString(),
    },
    parserWarnings: record.warnings,
  }));
  return {
    physicalRows: records.length,
    structuralRows: records.length - candidates.length,
    candidates,
    warnings: records.length - candidates.length > 1
      ? ['Repeated header and/or blank structural rows were skipped']
      : [],
  };
}

function rowReference(row: CandidateRow): string {
  return row.sheetName === undefined
    ? `row:${row.sourceRowNumber}`
    : `sheet:${row.sheetName}:row:${row.sourceRowNumber}`;
}

function rejection(
  row: CandidateRow,
  code: FileImportIssueCode,
  message: string,
  field?: string,
  rawValue?: unknown,
): FileRowRejection {
  return {
    code,
    message,
    source_row_number: row.sourceRowNumber,
    ...(row.sheetName !== undefined ? { sheet_name: row.sheetName } : {}),
    source_row_or_ref: rowReference(row),
    ...(field !== undefined ? { field } : {}),
    ...(rawValue !== undefined ? { raw_value: rawValue } : {}),
  };
}

function validateCandidate(
  input: RawFileImport,
  row: CandidateRow,
  options: FileImportOptions,
): FileRowRejection | undefined {
  if (row.formulaField !== undefined) {
    return rejection(
      row,
      'FORMULA_MEASUREMENT_UNSUPPORTED',
      'Formula cells are never evaluated for file-import measurements',
      row.formulaField,
    );
  }
  if (row.deviceId === undefined || row.deviceId === '') {
    return rejection(row, 'DEVICE_IDENTITY_MISMATCH', 'A device identifier is required', 'device_id');
  }
  if (options.expected_device_id !== undefined && row.deviceId !== options.expected_device_id) {
    return rejection(
      row,
      'DEVICE_IDENTITY_MISMATCH',
      'File row device identifier conflicts with the explicit import context',
      'device_id',
      row.deviceId,
    );
  }
  if (row.temperatureRaw === undefined || row.temperatureRaw.trim() === '') {
    return rejection(row, 'MISSING_TEMPERATURE', 'Temperature is required', 'temperature');
  }
  if (row.temperatureC === undefined) {
    return rejection(
      row,
      'INVALID_TEMPERATURE',
      'Temperature must be a finite decimal',
      'temperature',
      row.temperatureRaw,
    );
  }
  if (row.timestampLocal === undefined) {
    return rejection(
      row,
      'INVALID_TIMESTAMP',
      'Timestamp is invalid for the declared file format',
      'timestamp',
      row.timestampRaw,
    );
  }
  if (row.sourceDeclaredOffset === undefined && input.timezone_context === undefined) {
    return rejection(
      row,
      'TIMEZONE_CONTEXT_REQUIRED',
      'A source-local timestamp requires explicit timezone context',
      'timestamp',
      row.timestampRaw,
    );
  }
  if (row.parserWarnings.length > 0) {
    const warning = row.parserWarnings[0];
    const code = warning.startsWith('INVALID_TEMPERATURE')
      ? 'INVALID_TEMPERATURE'
      : warning.startsWith('INVALID_DATE') || warning.startsWith('INVALID_TIME')
        ? 'INVALID_TIMESTAMP'
        : 'MALFORMED_CSV_ROW';
    return rejection(row, code, warning);
  }
  return undefined;
}

function normalizeCandidate(
  input: RawFileImport,
  row: CandidateRow,
  adapter: { id: string; version: string },
): { measurement?: CanonicalTimeSeriesMeasurement; rejection?: FileRowRejection } {
  const timezoneOffset = row.sourceDeclaredOffset ?? input.timezone_context?.utc_offset;
  const parsed: ParsedTimeSeriesRecord = {
    recordType: 'TIMESERIES',
    rawRef: rowReference(row),
    timestampRaw: row.timestampRaw as string,
    timestamp: row.timestampLocal as string,
    temperatureRaw: row.temperatureRaw,
    temperatureC: row.temperatureC,
    ...(row.humidityPct !== undefined ? { humidityPct: row.humidityPct } : {}),
    sourceMetadata: {
      fileName: input.original_filename,
      dataset: input.source_format === 'ZENODO_CSV'
        ? 'ZENODO:10.5281/zenodo.15130001'
        : 'COLDPROOF:VENDOR_INSPIRED_FILE_IMPORT',
      checksumSha256: input.content_sha256,
      sourceFormat: input.source_format,
      measurementOrigin: input.origin,
      mimeType: input.media_type,
      sourceSensorId: row.deviceId,
    },
    warnings: [],
  };
  const normalized = normalizeTimeSeriesRecord(parsed, {
    parserId: adapter.id,
    parserVersion: adapter.version,
    timezoneOffset,
    timezoneOrigin: row.sourceDeclaredOffset !== undefined
      ? 'SOURCE_DECLARED'
      : 'EXPLICIT_ASSUMPTION',
  });
  if (!normalized.success) {
    const first = normalized.errors[0];
    const code: FileImportIssueCode = first.code === 'INVALID_TEMPERATURE'
      ? 'INVALID_TEMPERATURE'
      : first.code === 'INVALID_PARSED_TIMESTAMP'
        ? 'INVALID_TIMESTAMP'
        : 'CANONICAL_VALIDATION_FAILED';
    return { rejection: rejection(row, code, first.message, first.field) };
  }
  const measurement = CanonicalTimeSeriesMeasurementSchema.parse({
    ...normalized.measurement,
    raw_ingest_id: input.import_id,
  });
  return { measurement };
}

export function inspectLoggerFile(input: RawFileImport): FileImportInspection {
  const adapter = adapterFor(input.source_format);
  if (!adapter || input.source_format === 'MENDELEY_XLSX') {
    return {
      supported: false,
      reason: input.source_format === 'MENDELEY_XLSX'
        ? 'Mendeley workbooks are spreadsheet context, not runtime logger files'
        : 'No compatible file adapter',
    };
  }
  if (input.source_format.endsWith('_CSV')) {
    const firstBytes = input.content.subarray(0, 4).toString('utf8');
    if (/^PK\u0003\u0004/.test(firstBytes) || input.content.includes(0)) {
      return { supported: false, reason: 'CSV adapter rejected binary content' };
    }
  } else if (input.content.length < 4 || input.content.readUInt32LE(0) !== 0x04034b50) {
    return { supported: false, reason: 'XLSX adapter requires an OOXML ZIP signature' };
  }
  return {
    supported: true,
    adapter_id: adapter.id,
    adapter_version: adapter.version,
    reason: `Explicit source format selects ${adapter.id}`,
  };
}

/** Pure file adaptation and canonicalization; no storage, network, or DB side effects. */
export async function parseLoggerFile(
  input: RawFileImport,
  options: FileImportOptions = {},
): Promise<FileImportResult> {
  const envelopeFailure = validateEnvelope(input, options);
  if (envelopeFailure !== undefined) return envelopeFailure;
  const adapter = adapterFor(input.source_format) as { id: string; version: string };
  if (input.source_format === 'MENDELEY_XLSX') {
    return rejectedFile(input, [
      issue(
        'UNSUPPORTED_FILE_FORMAT',
        'MENDELEY_XLSX must use parseMendeleySpreadsheetContext and never becomes a runtime timeline',
      ),
    ], adapter);
  }

  const inspection = inspectLoggerFile(input);
  if (!inspection.supported && !input.source_format.endsWith('_XLSX')) {
    return rejectedFile(input, [issue('UNSUPPORTED_FILE_FORMAT', inspection.reason)], adapter);
  }

  let parsed: ParsedRows | FileImportResult;
  if (input.source_format === 'VENDOR_A_CSV') {
    parsed = vendorCsvRows(
      input,
      ',',
      ['device_id', 'recorded_at', 'temperature_c'],
    );
  } else if (input.source_format === 'VENDOR_B_CSV') {
    parsed = vendorCsvRows(
      input,
      ';',
      ['Device ID', 'Date', 'Time', 'Temperature (C)'],
    );
  } else if (input.source_format === 'VENDOR_C_XLSX') {
    parsed = vendorXlsxRows(input, options);
  } else {
    parsed = await zenodoRows(input);
  }
  if ('file_status' in parsed) return parsed;

  const rowLimit = options.limits?.max_candidate_rows;
  if (rowLimit !== undefined && parsed.candidates.length > rowLimit) {
    return rejectedFile(input, [
      issue('ROW_LIMIT_EXCEEDED', `Candidate rows exceed configured limit of ${rowLimit}`),
    ], adapter, {
      physical_rows: parsed.physicalRows,
      structural_rows: parsed.physicalRows,
      candidate_data_rows: 0,
      canonical_rows: 0,
      rejected_data_rows: 0,
    });
  }

  const measurements: CanonicalTimeSeriesMeasurement[] = [];
  const rowRejections: FileRowRejection[] = [];
  for (const candidate of parsed.candidates) {
    const invalid = validateCandidate(input, candidate, options);
    if (invalid !== undefined) {
      rowRejections.push(invalid);
      continue;
    }
    const normalized = normalizeCandidate(input, candidate, adapter);
    if (normalized.rejection !== undefined) rowRejections.push(normalized.rejection);
    else if (normalized.measurement !== undefined) measurements.push(normalized.measurement);
  }

  return FileImportResultSchema.parse({
    import_id: input.import_id,
    original_filename: input.original_filename,
    source_format: input.source_format,
    content_sha256: input.content_sha256,
    adapter_id: adapter.id,
    adapter_version: adapter.version,
    file_status: rowRejections.length === 0 ? 'ACCEPTED' : 'ACCEPTED_WITH_REJECTIONS',
    counts: {
      physical_rows: parsed.physicalRows,
      structural_rows: parsed.structuralRows,
      candidate_data_rows: parsed.candidates.length,
      canonical_rows: measurements.length,
      rejected_data_rows: rowRejections.length,
    },
    row_rejections: rowRejections,
    fatal_issues: [],
    warnings: parsed.warnings,
    canonical_measurements: measurements,
  });
}

export function assessImportedMeasurements(
  result: FileImportResult,
  context: RuntimeDataQualityContext = {},
): RuntimeDataQualityResult | { assessment_status: 'NOT_ASSESSED'; reason: string } {
  if (result.file_status === 'FILE_REJECTED' || result.canonical_measurements.length === 0) {
    return {
      assessment_status: 'NOT_ASSESSED',
      reason: 'No canonical file-derived measurements are available for sequence DQ',
    };
  }
  return assessLoggerSequence(result.canonical_measurements, context);
}

/**
 * Separate Mendeley path: preserves spatial/context semantics and deliberately
 * cannot emit canonical runtime time-series measurements.
 */
export async function parseMendeleySpreadsheetContext(
  input: RawFileImport,
): Promise<MendeleySpreadsheetContextResult> {
  const envelopeFailure = validateEnvelope(input, {});
  if (envelopeFailure !== undefined) {
    return {
      import_id: input.import_id,
      file_status: 'FILE_REJECTED',
      adapter_id: FILE_IMPORT_ADAPTERS.MENDELEY_XLSX.id,
      adapter_version: FILE_IMPORT_ADAPTERS.MENDELEY_XLSX.version,
      content_sha256: input.content_sha256,
      spatial_records: [],
      fatal_issues: envelopeFailure.fatal_issues,
      timeline_semantics: 'NONE',
      dq_assessment_status: 'NOT_ASSESSED',
    };
  }
  if (input.source_format !== 'MENDELEY_XLSX') {
    return {
      import_id: input.import_id,
      file_status: 'FILE_REJECTED',
      adapter_id: FILE_IMPORT_ADAPTERS.MENDELEY_XLSX.id,
      adapter_version: FILE_IMPORT_ADAPTERS.MENDELEY_XLSX.version,
      content_sha256: input.content_sha256,
      spatial_records: [],
      fatal_issues: [issue('UNSUPPORTED_FILE_FORMAT', 'Expected MENDELEY_XLSX')],
      timeline_semantics: 'NONE',
      dq_assessment_status: 'NOT_ASSESSED',
    };
  }
  const metadata = {
    fileName: input.original_filename,
    dataset: 'MENDELEY:sz5dgkz7k8:v1',
    checksumSha256: input.content_sha256,
    sourceFormat: input.source_format,
    measurementOrigin: input.origin,
    mimeType: input.media_type,
  } as const;
  const detection = mendeleyAdapter.canParse(metadata, input.content);
  if (!detection.supported) {
    return {
      import_id: input.import_id,
      file_status: 'FILE_REJECTED',
      adapter_id: mendeleyAdapter.id,
      adapter_version: mendeleyAdapter.version,
      content_sha256: input.content_sha256,
      spatial_records: [],
      fatal_issues: [issue('UNSUPPORTED_SHEET_STRUCTURE', detection.reason ?? 'Unsupported Mendeley workbook')],
      timeline_semantics: 'NONE',
      dq_assessment_status: 'NOT_ASSESSED',
    };
  }
  const spatialRecords: ParsedSpatialRecord[] = [];
  for await (const record of mendeleyAdapter.parse({ metadata, content: input.content })) {
    if (record.recordType === 'SPATIAL_SNAPSHOT') spatialRecords.push(record);
  }
  return {
    import_id: input.import_id,
    file_status: 'ACCEPTED',
    adapter_id: mendeleyAdapter.id,
    adapter_version: mendeleyAdapter.version,
    content_sha256: input.content_sha256,
    condition_id: spatialRecords[0]?.conditionId,
    spatial_records: spatialRecords,
    fatal_issues: [],
    timeline_semantics: 'NONE',
    dq_assessment_status: 'NOT_ASSESSED',
  };
}
