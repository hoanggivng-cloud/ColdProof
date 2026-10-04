import type { FileMetadata, ParsedSpatialRecord } from '@coldproof/parser-contracts';

import { MendeleyAdapter } from './mendeley.adapter';

type FixtureOptions = {
  conditionId?: string;
  sheetName?: string;
  firstHeader?: string;
  yLabel?: string;
  firstTemperature?: { value: string; type?: 'inline' | 'number' };
};

const metadata: FileMetadata = {
  fileName: 'C01 Synthetic Test Condition.xlsx',
  dataset: 'MENDELEY:sz5dgkz7k8:v1',
  checksumSha256: 'd'.repeat(64),
  sourceFormat: 'XLSX',
  measurementOrigin: 'REAL_PUBLIC_DATA',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function numericCell(reference: string, value: string): string {
  return `<c r="${reference}"><v>${value}</v></c>`;
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries: ReadonlyArray<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.content, 'utf8');
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function workbookFixture(options: FixtureOptions = {}): Buffer {
  const conditionId = options.conditionId ?? 'C01';
  const sheetName = options.sheetName ?? 'Feuil1';
  const firstTemperature = options.firstTemperature ?? { value: '5.25', type: 'number' };
  const firstTemperatureCell =
    firstTemperature.type === 'inline'
      ? inlineCell('B8', firstTemperature.value)
      : numericCell('B8', firstTemperature.value);
  const rows = [
    `<row r="1">${inlineCell('A1', options.firstHeader ?? 'Condition')}${inlineCell('B1', 'PCM position')}${inlineCell('C1', 'Aspect ratio ')}${inlineCell('D1', 'Ambient temperature (°C)')}${inlineCell('E1', 'Initial load temperature (°C)')}${inlineCell('F1', 'Spacing beneath load (mm)')}</row>`,
    `<row r="2">${numericCell('A2', String(Number(conditionId.slice(1))))}${inlineCell('B2', 'Side wall')}${inlineCell('C2', '1 (Horizontal)')}${numericCell('D2', '20')}${numericCell('E2', '4')}${numericCell('F2', '20')}</row>`,
    '<row r="3"/>',
    `<row r="4">${inlineCell('A4', 'Middle plane (X = 250 mm)')}</row>`,
    `<row r="6">${inlineCell('A6', 'Average temperature (°C)')}</row>`,
    `<row r="7">${inlineCell('A7', 'Z (mm)')}${numericCell('B7', '20')}${numericCell('C7', '90')}</row>`,
    `<row r="8">${inlineCell('A8', options.yLabel ?? 'Y = 0 mm')}${firstTemperatureCell}${numericCell('C8', '6.50')}</row>`,
    '<row r="9"/>',
    `<row r="10">${inlineCell('A10', 'Y = 10 mm')}${numericCell('B10', '4.75')}${inlineCell('C10', '-')}</row>`,
    `<row r="12">${numericCell('A12', '25')}</row>`,
  ].join('');
  const workbook =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';
  const relationships =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" ' +
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
    'Target="worksheets/sheet1.xml"/>' +
    '</Relationships>';
  const worksheet =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rows}</sheetData></worksheet>`;

  return storedZip([
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: relationships },
    { name: 'xl/worksheets/sheet1.xml', content: worksheet },
  ]);
}

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
