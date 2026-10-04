import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { FileMetadata, ParsedTimeSeriesRecord } from '@coldproof/parser-contracts';

import { ZenodoAdapter } from './zenodo.adapter';

const HEADER = 'Date;Time;Temperature (C);Humidity (%)';
const VALID_ROW = '02.09.2024;09:31:55;21.50;60.10';
const fixture = readFileSync(
  path.resolve(process.cwd(), 'tests/fixtures/zenodo/SENSOR06_excerpt.csv'),
);

const metadata: FileMetadata = {
  fileName: 'SENSOR06.CSV',
  dataset: 'ZENODO:10.5281/zenodo.15130001',
  checksumSha256: 'c'.repeat(64),
  sourceFormat: 'CSV_SEMICOLON',
  measurementOrigin: 'REAL_PUBLIC_DATA',
  mimeType: 'text/csv',
  sourceSensorId: 'SENSOR06',
};

const adapter = new ZenodoAdapter();

async function collect(
  content: string | Buffer,
  sourceMetadata: FileMetadata = metadata,
): Promise<ParsedTimeSeriesRecord[]> {
  const records: ParsedTimeSeriesRecord[] = [];
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');

  for await (const record of adapter.parse({ metadata: sourceMetadata, content: buffer })) {
    records.push(record);
  }

  return records;
}

describe('ZenodoAdapter.canParse', () => {
  it('has a deterministic adapter identity', () => {
    expect(adapter.id).toBe('zenodo-cold-storage');
    expect(adapter.version).toBe('1.0.0');
  });

  it('supports the real Zenodo header', () => {
    const result = adapter.canParse(metadata, fixture);

    expect(result.supported).toBe(true);
    expect(result.confidence).toBe(1);
  });

  it('rejects an unrelated CSV', () => {
    const result = adapter.canParse(metadata, Buffer.from('timestamp,value\n2024-01-01,1'));

    expect(result.supported).toBe(false);
    expect(result.reason).toContain('Expected semicolon-delimited header');
  });

  it('rejects a malformed Zenodo-like header', () => {
    const result = adapter.canParse(
      metadata,
      Buffer.from('Date;Time;Temperature;Humidity\n02.09.2024;09:31:55;21.50;60.10'),
    );

    expect(result.supported).toBe(false);
  });
});

describe('ZenodoAdapter.parse', () => {
  it('maps a public SENSOR06 row to ParsedTimeSeriesRecord', async () => {
    const [record] = await collect(`${HEADER}\n${VALID_ROW}`);

    expect(record).toEqual({
      recordType: 'TIMESERIES',
      rawRef: 'row:2',
      timestampRaw: '02.09.2024;09:31:55',
      timestamp: '2024-09-02T09:31:55',
      temperatureRaw: '21.50',
      temperatureC: 21.5,
      humidityPct: 60.1,
      sourceMetadata: metadata,
      warnings: [],
    });
    expect(record.sourceMetadata).toBe(metadata);
  });

  it('parses every row in the minimal public SENSOR06 excerpt', async () => {
    const records = await collect(fixture);

    expect(records).toHaveLength(3);
    expect(records[0].rawRef).toBe('row:2');
    expect(records[2].rawRef).toBe('row:4');
  });

  it('preserves an explicit sourceSensorId', async () => {
    const explicitMetadata = { ...metadata, sourceSensorId: 'SOURCE-SENSOR-06' };
    const [record] = await collect(`${HEADER}\n${VALID_ROW}`, explicitMetadata);

    expect(record.sourceMetadata.sourceSensorId).toBe('SOURCE-SENSOR-06');
    expect(record.sourceMetadata).toBe(explicitMetadata);
  });

  it('derives sourceSensorId only from the SENSORNN.CSV filename pattern', async () => {
    const metadataWithoutSensor = { ...metadata, sourceSensorId: undefined };
    const [record] = await collect(`${HEADER}\n${VALID_ROW}`, metadataWithoutSensor);

    expect(record.sourceMetadata.sourceSensorId).toBe('SENSOR06');
    expect(record.sourceMetadata.checksumSha256).toBe(metadata.checksumSha256);
  });

  it('skips repeated headers without changing physical row provenance', async () => {
    const content = [HEADER, VALID_ROW, HEADER, '02.09.2024;09:32:00;21.40;62.00'].join('\n');
    const records = await collect(content);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.rawRef)).toEqual(['row:2', 'row:4']);
  });

  it('skips blank lines without changing physical row provenance', async () => {
    const records = await collect(`${HEADER}\n\n${VALID_ROW}\n`);

    expect(records).toHaveLength(1);
    expect(records[0].rawRef).toBe('row:3');
  });

  it('supports UTF-8 BOM and CRLF input', async () => {
    const records = await collect(`\uFEFF${HEADER}\r\n${VALID_ROW}\r\n`);

    expect(records).toHaveLength(1);
    expect(records[0].timestamp).toBe('2024-09-02T09:31:55');
  });

  it.each([
    ['31.02.2024;09:31:55;21.50;60.10', 'INVALID_DATE'],
    ['02.09.2024;24:00:00;21.50;60.10', 'INVALID_TIME'],
  ])('emits invalid date/time row with a deterministic warning: %s', async (row, warning) => {
    const [record] = await collect(`${HEADER}\n${row}`);

    expect(record.timestamp).toBe(record.timestampRaw);
    expect(record.warnings).toEqual([expect.stringContaining(warning)]);
  });

  it('preserves malformed temperature without converting it to zero', async () => {
    const [record] = await collect(`${HEADER}\n02.09.2024;09:31:55;not-a-number;60.10`);

    expect(record.temperatureRaw).toBe('not-a-number');
    expect(record.temperatureC).toBeUndefined();
    expect(record.warnings).toEqual([expect.stringContaining('INVALID_TEMPERATURE')]);
  });

  it('omits malformed humidity and emits a warning', async () => {
    const [record] = await collect(`${HEADER}\n02.09.2024;09:31:55;21.50;not-a-number`);

    expect(record.humidityPct).toBeUndefined();
    expect(record.warnings).toEqual([expect.stringContaining('INVALID_HUMIDITY')]);
  });

  it('emits wrong-column-count rows with provenance and warnings', async () => {
    const [record] = await collect(`${HEADER}\n02.09.2024;09:31:55;21.50`);

    expect(record.rawRef).toBe('row:2');
    expect(record.timestamp).toBe('2024-09-02T09:31:55');
    expect(record.temperatureC).toBe(21.5);
    expect(record.humidityPct).toBeUndefined();
    expect(record.warnings).toEqual([
      expect.stringContaining('WRONG_COLUMN_COUNT'),
      expect.stringContaining('INVALID_HUMIDITY'),
    ]);
  });

  it('never invents a timezone or offset', async () => {
    const [record] = await collect(`${HEADER}\n${VALID_ROW}`);

    expect(record.timestamp).toBe('2024-09-02T09:31:55');
    expect(record.timestamp).not.toMatch(/(?:Z|[+-]\d{2}:\d{2})$/);
  });

  it('does not generate missing or interpolated rows', async () => {
    const content = [
      HEADER,
      '02.09.2024;08:00:00;5.00;80.00',
      '02.09.2024;08:00:05;5.10;80.10',
      '02.09.2024;08:20:00;5.20;80.20',
    ].join('\n');
    const records = await collect(content);

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.timestamp)).toEqual([
      '2024-09-02T08:00:00',
      '2024-09-02T08:00:05',
      '2024-09-02T08:20:00',
    ]);
  });

  it('rejects content without the expected header', async () => {
    await expect(collect(VALID_ROW)).rejects.toThrow('Unsupported Zenodo CSV header');
  });
});
