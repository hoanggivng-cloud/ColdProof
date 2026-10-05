import type { FileMetadata, ParsedSpatialRecord } from '@coldproof/parser-contracts';

import { workbookFixture } from '../../../../../tests/fixtures/mendeley/workbook-fixture';
import { MendeleyAdapter } from './mendeley.adapter';

const metadata: FileMetadata = {
  fileName: 'C01 Synthetic Test Condition.xlsx',
  dataset: 'MENDELEY:sz5dgkz7k8:v1',
  checksumSha256: 'd'.repeat(64),
  sourceFormat: 'XLSX',
  measurementOrigin: 'REAL_PUBLIC_DATA',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const adapter = new MendeleyAdapter();

async function collect(
  content: Buffer,
  sourceMetadata: FileMetadata = metadata,
): Promise<ParsedSpatialRecord[]> {
  const records: ParsedSpatialRecord[] = [];
  for await (const record of adapter.parse({ metadata: sourceMetadata, content })) {
    records.push(record);
  }
  return records;
}

describe('MendeleyAdapter.canParse', () => {
  it('has a deterministic adapter identity', () => {
    expect(adapter.id).toBe('mendeley-insulated-box');
    expect(adapter.version).toBe('1.0.0');
  });

  it('supports a Mendeley condition workbook with the verified matrix structure', () => {
    expect(adapter.canParse(metadata, workbookFixture())).toEqual({
      supported: true,
      confidence: 1,
      reason: 'Matched Mendeley condition metadata and spatial temperature matrix structure',
    });
  });

  it('rejects an unrelated XLSX workbook', () => {
    const result = adapter.canParse(
      { ...metadata, fileName: 'temperatures.xlsx', dataset: 'OTHER_DATASET' },
      workbookFixture(),
    );

    expect(result.supported).toBe(false);
  });

  it.each([
    [Buffer.from('not an XLSX archive'), 'Invalid XLSX'],
    [workbookFixture({ firstHeader: 'Timestamp' }), 'Unexpected workbook header'],
    [workbookFixture({ sheetName: 'Unexpected' }), 'Expected one worksheet named Feuil1'],
  ])('rejects malformed or unexpected workbook structure', (content, reason) => {
    const result = adapter.canParse(metadata, content);

    expect(result.supported).toBe(false);
    expect(result.reason).toContain(reason);
  });
});

describe('MendeleyAdapter.parse', () => {
  it('maps source matrix cells to ParsedSpatialRecord', async () => {
    const records = await collect(workbookFixture());

    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      recordType: 'SPATIAL_SNAPSHOT',
      rawRef: 'sheet:Feuil1:cell:B8',
      conditionId: 'C01',
      positionX: 250,
      positionY: 0,
      positionZ: 20,
      temperatureRaw: '5.25',
      temperatureC: 5.25,
      sourceMetadata: metadata,
      warnings: [],
    });
    expect(records[1]).toMatchObject({ positionZ: 90, temperatureC: 6.5 });
    expect(records[2]).toMatchObject({ positionY: 10, positionZ: 20, temperatureC: 4.75 });
  });

  it('preserves condition, filename, checksum and source metadata', async () => {
    const [record] = await collect(workbookFixture());

    expect(record.conditionId).toBe('C01');
    expect(record.sourceMetadata).toBe(metadata);
    expect(record.sourceMetadata.fileName).toBe(metadata.fileName);
    expect(record.sourceMetadata.checksumSha256).toBe(metadata.checksumSha256);
  });

  it('uses deterministic workbook cell references and output', async () => {
    const first = await collect(workbookFixture());
    const second = await collect(workbookFixture());

    expect(first.map((record) => record.rawRef)).toEqual([
      'sheet:Feuil1:cell:B8',
      'sheet:Feuil1:cell:C8',
      'sheet:Feuil1:cell:B10',
    ]);
    expect(second).toEqual(first);
  });

  it('skips blank, header, dash and unlabeled structural rows', async () => {
    const records = await collect(workbookFixture());

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.rawRef)).not.toContain('sheet:Feuil1:cell:A12');
  });

  it('does not generate timestamp, duration, excursion or business fields', async () => {
    const [record] = await collect(workbookFixture());

    expect(record).not.toHaveProperty('timestamp');
    expect(record).not.toHaveProperty('duration');
    expect(record).not.toHaveProperty('excursion_flag');
    expect(record).not.toHaveProperty('batch_id');
  });

  it('fails explicitly for a temperature that cannot satisfy ParsedSpatialRecord', async () => {
    await expect(
      collect(workbookFixture({ firstTemperature: { value: 'invalid', type: 'inline' } })),
    ).rejects.toThrow('Invalid temperature at sheet:Feuil1:cell:B8');
  });

  it('fails explicitly for an invalid coordinate instead of fabricating one', async () => {
    await expect(collect(workbookFixture({ yLabel: 'Y = invalid mm' }))).rejects.toThrow(
      'Invalid Y coordinate at A8',
    );
  });

  it('keeps C01 and C07 as separate experimental conditions, not a device stream', async () => {
    const [conditionOne] = await collect(workbookFixture());
    const conditionSevenMetadata = {
      ...metadata,
      fileName: 'C07 Synthetic Test Condition.xlsx',
    };
    const [conditionSeven] = await collect(
      workbookFixture({ conditionId: 'C07' }),
      conditionSevenMetadata,
    );

    expect(conditionOne.conditionId).toBe('C01');
    expect(conditionSeven.conditionId).toBe('C07');
    expect(conditionOne.sourceMetadata.sourceSensorId).toBeUndefined();
    expect(conditionSeven.sourceMetadata.sourceSensorId).toBeUndefined();
  });

  it('rejects a workbook condition that disagrees with the source filename', async () => {
    await expect(collect(workbookFixture({ conditionId: 'C07' }))).rejects.toThrow(
      'Workbook condition 7 does not match filename C01',
    );
  });
});
