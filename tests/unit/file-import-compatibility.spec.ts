import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { CanonicalTimeSeriesMeasurementSchema } from '@coldproof/canonical-schema';
import type {
  FileImportSourceFormat,
  RawFileImport,
} from '@coldproof/parser-contracts';
import { FileImportResultSchema, RawFileImportSchema } from '@coldproof/parser-contracts';

import {
  assessImportedMeasurements,
  FILE_IMPORT_ADAPTERS,
  inspectLoggerFile,
  parseLoggerFile,
  parseMendeleySpreadsheetContext,
} from '../../apps/api/src/adapters/file-import/file-import';
import { MendeleyAdapter } from '../../apps/api/src/adapters/mendeley/mendeley.adapter';
import { ZenodoAdapter } from '../../apps/api/src/adapters/zenodo/zenodo.adapter';
import { loggerWorkbookFixture } from '../fixtures/file-import/workbook-fixture';

type FixtureManifestItem = {
  fixture_id: string;
  golden_id?: string;
  filename: string;
  fixture_source?: string;
  format: FileImportSourceFormat;
  origin: 'SYNTHETIC';
  format_origin?: 'VENDOR_INSPIRED';
  adapter: string;
  expected_file_status: string;
  expected_candidate_rows: number;
  expected_canonical_rows: number;
  expected_rejected_rows: number;
  expected_rejection_codes: string[];
  expected_dq_status: string;
  expected_dq_codes: string[];
  timezone_context_required: boolean;
};

const repositoryRoot = process.cwd();
const fixtureRoot = path.join(repositoryRoot, 'tests/fixtures/file-import');
const fixtureManifest = JSON.parse(
  readFileSync(path.join(fixtureRoot, 'manifest.json'), 'utf8'),
) as { fixtures: FixtureManifestItem[] };

function checksum(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function rawImport(input: {
  content: Buffer;
  filename: string;
  format: FileImportSourceFormat;
  importId?: string;
  timezone?: string;
  origin?: 'SYNTHETIC' | 'REAL_PUBLIC_DATA';
  checksumOverride?: string;
  sizeOverride?: number;
}): RawFileImport {
  const value: RawFileImport = {
    import_id: input.importId ?? `import-${input.filename}`,
    original_filename: input.filename,
    received_at: '2026-10-10T14:30:00+07:00',
    content_sha256: input.checksumOverride ?? checksum(input.content),
    file_size_bytes: input.sizeOverride ?? input.content.length,
    media_type: input.format.endsWith('XLSX')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : input.format === 'UNKNOWN'
        ? 'application/octet-stream'
        : 'text/csv',
    source_format: input.format,
    origin: input.origin ?? 'SYNTHETIC',
    ...(input.format.startsWith('VENDOR_') ? { format_origin: 'VENDOR_INSPIRED' as const } : {}),
    ...(input.timezone !== undefined
      ? {
          timezone_context: {
            utc_offset: input.timezone,
            origin: 'FILE_IMPORT_CONFIGURATION' as const,
          },
        }
      : {}),
    upload_metadata: {
      transport: 'FILE_IMPORT',
      original_name_encoding: 'UTF-8',
    },
    content: input.content,
  };
  return value;
}

function fixtureContent(item: FixtureManifestItem): Buffer {
  if (item.fixture_id === 'FILE-003') return loggerWorkbookFixture();
  if (item.fixture_id === 'FILE-009') return Buffer.alloc(0);
  if (item.fixture_id === 'FILE-022') return Buffer.from('corrupted XLSX', 'utf8');
  if (item.fixture_id === 'FILE-023') {
    const rows = [{
      device_id: 'LOGGER-C-023',
      recorded_at: '2026-10-10T14:30:00+07:00',
      temperature_c: '5.4',
      humidity_percent: '72.1',
    }];
    return loggerWorkbookFixture({
      sheets: [
        { name: 'Measurements A', rows },
        { name: 'Measurements B', rows },
      ],
    });
  }
  return readFileSync(path.join(fixtureRoot, item.filename));
}

async function executeFixture(item: FixtureManifestItem) {
  const content = fixtureContent(item);
  const input = rawImport({
    content,
    filename: item.filename,
    format: item.format,
    ...(item.fixture_id === 'FILE-002' ? { timezone: '+07:00' } : {}),
  });
  const options = item.fixture_id === 'FILE-020'
    ? { expected_device_id: 'LOGGER-A-EXPECTED' }
    : {};
  const result = await parseLoggerFile(input, options);
  const dq = assessImportedMeasurements(result, { expected_interval_ms: 5_000 });
  return { result, dq };
}

describe('File Import Compatibility & Test Pack v1', () => {
  it('contains 25 deterministic fixture definitions and six golden cases', () => {
    expect(fixtureManifest.fixtures).toHaveLength(25);
    expect(new Set(fixtureManifest.fixtures.map((item) => item.fixture_id)).size).toBe(25);
    expect(fixtureManifest.fixtures.filter((item) => item.golden_id)).toHaveLength(6);
  });

  it.each(['FILE-001', 'FILE-002', 'FILE-003'])(
    'accepts the normal comma, semicolon, and XLSX cases: %s',
    async (fixtureId) => {
      const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === fixtureId) as FixtureManifestItem;
      const { result } = await executeFixture(item);

      expect(result.file_status).toBe('ACCEPTED');
      expect(result.counts.canonical_rows).toBe(2);
      expect(result.canonical_measurements.every((measurement) =>
        CanonicalTimeSeriesMeasurementSchema.safeParse(measurement).success)).toBe(true);
    },
  );

  it('preserves UTF-8 Vietnamese filename and metadata', async () => {
    const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === 'FILE-004') as FixtureManifestItem;
    const input = rawImport({
      content: fixtureContent(item),
      filename: 'dữ liệu vaccine Cần Thơ.csv',
      format: item.format,
    });
    const result = await parseLoggerFile(input);

    expect(result.original_filename).toBe('dữ liệu vaccine Cần Thơ.csv');
    expect(result.canonical_measurements[0].source_file).toBe('dữ liệu vaccine Cần Thơ.csv');
  });

  it('supports UTF-8 BOM, CRLF, trailing newline, and quoted CSV values', async () => {
    const content = Buffer.from(
      '\uFEFFdevice_id,recorded_at,temperature_c,humidity_percent,note\r\n' +
      'LOGGER-A-BOM,2026-10-10T14:30:00+07:00,5.4,72.1,"Cần Thơ, Việt Nam"\r\n',
      'utf8',
    );
    const result = await parseLoggerFile(rawImport({
      content,
      filename: 'dữ-liệu-cần-thơ.csv',
      format: 'VENDOR_A_CSV',
    }));

    expect(result).toMatchObject({
      file_status: 'ACCEPTED',
      counts: { physical_rows: 2, structural_rows: 1, candidate_data_rows: 1 },
    });
  });

  it.each(['FILE-005', 'FILE-006', 'FILE-007'])(
    'handles extra columns, blank rows, and repeated headers structurally: %s',
    async (fixtureId) => {
      const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === fixtureId) as FixtureManifestItem;
      const { result } = await executeFixture(item);

      expect(result.file_status).toBe('ACCEPTED');
      expect(result.counts.physical_rows).toBe(
        result.counts.structural_rows + result.counts.candidate_data_rows,
      );
      expect(result.counts.candidate_data_rows).toBe(
        result.counts.canonical_rows + result.counts.rejected_data_rows,
      );
      if (fixtureId === 'FILE-007') expect(result.warnings).toContainEqual(expect.stringContaining('REPEATED_HEADER_ROW'));
    },
  );

  it.each(['FILE-008', 'FILE-009', 'FILE-010', 'FILE-021', 'FILE-022', 'FILE-023', 'FILE-024'])(
    'returns deterministic file-level fatal outcomes: %s',
    async (fixtureId) => {
      const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === fixtureId) as FixtureManifestItem;
      const { result } = await executeFixture(item);

      expect(result.file_status).toBe('FILE_REJECTED');
      expect(result.canonical_measurements).toHaveLength(0);
      expect(result.fatal_issues.map((entry) => entry.code)).toEqual(
        expect.arrayContaining(item.expected_rejection_codes),
      );
    },
  );

  it.each(['FILE-011', 'FILE-012', 'FILE-013', 'FILE-018', 'FILE-020', 'FILE-025'])(
    'accepts valid rows while retaining explicit row rejections: %s',
    async (fixtureId) => {
      const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === fixtureId) as FixtureManifestItem;
      const { result } = await executeFixture(item);

      expect(result.file_status).toBe('ACCEPTED_WITH_REJECTIONS');
      expect(result.counts).toMatchObject({
        candidate_data_rows: item.expected_candidate_rows,
        canonical_rows: item.expected_canonical_rows,
        rejected_data_rows: item.expected_rejected_rows,
      });
      expect(result.row_rejections.map((entry) => entry.code)).toEqual(
        item.expected_rejection_codes,
      );
      expect(FileImportResultSchema.safeParse(result).success).toBe(true);
    },
  );

  it.each([
    ['FILE-014', 'DUPLICATE_RECORD'],
    ['FILE-015', 'CONFLICTING_RECORD'],
    ['FILE-016', 'OUT_OF_ORDER_RECORD'],
    ['FILE-017', 'MISSING_INTERVAL'],
  ])('delegates sequence anomalies to D6: %s', async (fixtureId, expectedCode) => {
    const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === fixtureId) as FixtureManifestItem;
    const { result, dq } = await executeFixture(item);

    expect(result.file_status).toBe('ACCEPTED');
    expect(dq.assessment_status).toBe('FLAGGED');
    expect('findings' in dq && dq.findings.map((finding) => finding.code)).toContain(expectedCode);
  });

  it('keeps multi-device DQ state isolated', async () => {
    const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === 'FILE-019') as FixtureManifestItem;
    const { result, dq } = await executeFixture(item);

    expect(result.canonical_measurements).toHaveLength(2);
    expect(dq).toMatchObject({ assessment_status: 'PASS', summary: { device_count: 2 } });
  });

  it('retains source row, import ID, checksum, adapter ID/version, and canonical validity', async () => {
    const item = fixtureManifest.fixtures[0];
    const content = fixtureContent(item);
    const result = await parseLoggerFile(rawImport({
      content,
      filename: item.filename,
      format: item.format,
      importId: 'import-provenance-001',
    }));
    const [measurement] = result.canonical_measurements;

    expect(result).toMatchObject({
      adapter_id: FILE_IMPORT_ADAPTERS.VENDOR_A_CSV.id,
      adapter_version: FILE_IMPORT_ADAPTERS.VENDOR_A_CSV.version,
      content_sha256: checksum(content),
    });
    expect(measurement).toMatchObject({
      raw_ingest_id: 'import-provenance-001',
      source_row_or_ref: 'row:2',
      source_checksum_sha256: checksum(content),
      parser_id: 'vendor-a-csv',
      parser_version: '1.0.0',
    });
  });

  it('is deterministic and preserves exact source bytes', async () => {
    const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === 'FILE-025') as FixtureManifestItem;
    const content = fixtureContent(item);
    const before = Buffer.from(content);
    const input = rawImport({ content, filename: item.filename, format: item.format });

    const first = await parseLoggerFile(input);
    const second = await parseLoggerFile(input);

    expect(second).toEqual(first);
    expect(content.equals(before)).toBe(true);
  });

  it('rejects checksum and size mismatch before parsing', async () => {
    const content = fixtureContent(fixtureManifest.fixtures[0]);
    const checksumResult = await parseLoggerFile(rawImport({
      content,
      filename: 'bad-checksum.csv',
      format: 'VENDOR_A_CSV',
      checksumOverride: '0'.repeat(64),
    }));
    const sizeResult = await parseLoggerFile(rawImport({
      content,
      filename: 'bad-size.csv',
      format: 'VENDOR_A_CSV',
      sizeOverride: content.length + 1,
    }));

    expect(checksumResult.fatal_issues[0].code).toBe('FILE_CHECKSUM_MISMATCH');
    expect(sizeResult.fatal_issues[0].code).toBe('FILE_SIZE_MISMATCH');
  });

  it('supports explicit file and row limits without inventing production limits', async () => {
    const content = fixtureContent(fixtureManifest.fixtures[0]);
    const input = rawImport({ content, filename: 'limited.csv', format: 'VENDOR_A_CSV' });

    const fileLimited = await parseLoggerFile(input, { limits: { max_file_size_bytes: 1 } });
    const rowLimited = await parseLoggerFile(input, { limits: { max_candidate_rows: 1 } });

    expect(fileLimited.fatal_issues[0].code).toBe('FILE_LIMIT_EXCEEDED');
    expect(rowLimited.fatal_issues[0].code).toBe('ROW_LIMIT_EXCEEDED');
  });

  it('does not evaluate XLSX formulas', async () => {
    const content = loggerWorkbookFixture({ formulaTemperature: true });
    const result = await parseLoggerFile(rawImport({
      content,
      filename: 'formula.xlsx',
      format: 'VENDOR_C_XLSX',
    }));

    expect(result.file_status).toBe('ACCEPTED_WITH_REJECTIONS');
    expect(result.row_rejections[0].code).toBe('FORMULA_MEASUREMENT_UNSUPPORTED');
    expect(result.counts).toMatchObject({ canonical_rows: 1, rejected_data_rows: 1 });
  });

  it('allows explicit worksheet selection when multiple compatible sheets exist', async () => {
    const item = fixtureManifest.fixtures.find((candidate) => candidate.fixture_id === 'FILE-023') as FixtureManifestItem;
    const content = fixtureContent(item);
    const result = await parseLoggerFile(rawImport({
      content,
      filename: item.filename,
      format: item.format,
    }), { sheet_name: 'Measurements B' });

    expect(result.file_status).toBe('ACCEPTED');
    expect(result.canonical_measurements[0].source_row_or_ref).toBe('sheet:Measurements B:row:2');
  });

  it('does not treat a filename extension as sufficient content detection', () => {
    const content = Buffer.from('binary\u0000data');
    const inspection = inspectLoggerFile(rawImport({
      content,
      filename: 'looks-valid.csv',
      format: 'VENDOR_A_CSV',
    }));

    expect(inspection.supported).toBe(false);
  });

  it('keeps timezone-free vendor B rows blocked until context is explicit', async () => {
    const content = readFileSync(path.join(fixtureRoot, 'vendor-b-semicolon.csv'));
    const blocked = await parseLoggerFile(rawImport({
      content,
      filename: 'vendor-b-semicolon.csv',
      format: 'VENDOR_B_CSV',
    }));
    const resolved = await parseLoggerFile(rawImport({
      content,
      filename: 'vendor-b-semicolon.csv',
      format: 'VENDOR_B_CSV',
      timezone: '+07:00',
    }));

    expect(blocked.row_rejections.every((entry) => entry.code === 'TIMEZONE_CONTEXT_REQUIRED')).toBe(true);
    expect(resolved.canonical_measurements[0].timestamp).toBe('2026-10-10T14:30:00+07:00');
  });

  it('parses one full clean frozen Zenodo source through D10 with explicit test context', async () => {
    const sourcePath = path.join(repositoryRoot, 'data/observed/zenodo/raw/SENSOR09.CSV');
    const content = readFileSync(sourcePath);
    const result = await parseLoggerFile(rawImport({
      content,
      filename: 'SENSOR09.CSV',
      format: 'ZENODO_CSV',
      origin: 'REAL_PUBLIC_DATA',
      timezone: '+00:00',
    }));

    expect(result.file_status).toBe('ACCEPTED');
    expect(result.counts.canonical_rows).toBeGreaterThan(1_000);
    expect(result.canonical_measurements[0]).toMatchObject({
      source_dataset: 'ZENODO:10.5281/zenodo.15130001',
      source_sensor_id: 'SENSOR09',
      source_row_or_ref: 'row:2',
      measurement_origin: 'REAL_PUBLIC_DATA',
    });
  }, 30_000);

  it.each(['SENSOR01.CSV', 'SENSOR03.CSV'])(
    'preserves physical row references while skipping real repeated Zenodo headers: %s',
    async (filename) => {
      const content = readFileSync(path.join(repositoryRoot, 'data/observed/zenodo/raw', filename));
      const lines = content.toString('utf8').split(/\r\n|\n|\r/);
      if (lines.at(-1) === '') lines.pop();
      const headerRows = lines
        .map((line, index) => line.startsWith('Date;Time;Temperature') ? index + 1 : undefined)
        .filter((row): row is number => row !== undefined);
      const metadata = {
        fileName: filename,
        dataset: 'ZENODO:10.5281/zenodo.15130001',
        checksumSha256: checksum(content),
        sourceFormat: 'ZENODO_CSV',
        measurementOrigin: 'REAL_PUBLIC_DATA' as const,
        mimeType: 'text/csv',
      };
      const records = [];
      for await (const record of new ZenodoAdapter().parse({ metadata, content })) records.push(record);

      expect(headerRows.length).toBeGreaterThan(1);
      expect(records).toHaveLength(lines.filter((line) => line.trim() !== '').length - headerRows.length);
      expect(records.map((record) => record.rawRef)).not.toContain(`row:${headerRows[1]}`);
    },
    30_000,
  );

  it('parses a real frozen Mendeley workbook only as spatial context', async () => {
    const filename = 'C04 Temperature Horizontal Side 20CAmb 4CInitial 20mmGap.xlsx';
    const content = readFileSync(path.join(repositoryRoot, 'data/observed/mendeley/conditions', filename));
    const result = await parseMendeleySpreadsheetContext(rawImport({
      content,
      filename,
      format: 'MENDELEY_XLSX',
      origin: 'REAL_PUBLIC_DATA',
    }));

    expect(result).toMatchObject({
      file_status: 'ACCEPTED',
      condition_id: 'C04',
      timeline_semantics: 'NONE',
      dq_assessment_status: 'NOT_ASSESSED',
    });
    expect(result.spatial_records.length).toBeGreaterThan(0);
    expect(result.spatial_records.every((record) =>
      !Object.hasOwn(record, 'timestamp') && record.rawRef.startsWith('sheet:Feuil1:cell:'))).toBe(true);
  });

  it('keeps real frozen source checksums unchanged and never concatenates public sources', () => {
    const manifest = readFileSync(path.join(repositoryRoot, 'data/manifests/source_manifest.csv'), 'utf8');
    for (const relativePath of [
      'data/observed/zenodo/raw/SENSOR01.CSV',
      'data/observed/zenodo/raw/SENSOR03.CSV',
      'data/observed/mendeley/conditions/C04 Temperature Horizontal Side 20CAmb 4CInitial 20mmGap.xlsx',
    ]) {
      expect(existsSync(path.join(repositoryRoot, relativePath))).toBe(true);
      const digest = checksum(readFileSync(path.join(repositoryRoot, relativePath)));
      expect(manifest).toContain(`${relativePath}`);
      expect(manifest).toContain(digest);
    }
    expect(FILE_IMPORT_ADAPTERS.ZENODO_CSV.id).not.toBe(FILE_IMPORT_ADAPTERS.MENDELEY_XLSX.id);
  });

  it('validates the raw file envelope without mutating bytes', () => {
    const content = readFileSync(path.join(fixtureRoot, 'vendor-a-normal.csv'));
    const input = rawImport({ content, filename: 'vendor-a-normal.csv', format: 'VENDOR_A_CSV' });
    expect(RawFileImportSchema.parse(input).content.equals(content)).toBe(true);
  });

  it('reuses the existing real-source adapter identities', () => {
    expect(new ZenodoAdapter()).toMatchObject(FILE_IMPORT_ADAPTERS.ZENODO_CSV);
    expect(new MendeleyAdapter()).toMatchObject(FILE_IMPORT_ADAPTERS.MENDELEY_XLSX);
  });
});
