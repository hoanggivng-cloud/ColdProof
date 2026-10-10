type WorkbookRow = {
  device_id: string;
  recorded_at: string;
  temperature_c: string;
  humidity_percent?: string;
};

export interface LoggerWorkbookFixtureOptions {
  sheets?: Array<{ name: string; rows: WorkbookRow[] }>;
  formulaTemperature?: boolean;
  headerOnly?: boolean;
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.content, 'utf8');
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + content.length;
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function formulaCell(reference: string, value: string): string {
  return `<c r="${reference}"><f>2+3</f><v>${escapeXml(value)}</v></c>`;
}

function worksheetXml(rows: WorkbookRow[], formulaTemperature: boolean, headerOnly: boolean): string {
  const header = '<row r="1">' +
    inlineCell('A1', 'device_id') +
    inlineCell('B1', 'recorded_at') +
    inlineCell('C1', 'temperature_c') +
    inlineCell('D1', 'humidity_percent') +
    '</row>';
  const data = headerOnly
    ? ''
    : rows.map((row, index) => {
      const number = index + 2;
      const temperature = formulaTemperature && index === 0
        ? formulaCell(`C${number}`, row.temperature_c)
        : inlineCell(`C${number}`, row.temperature_c);
      return `<row r="${number}">` +
        inlineCell(`A${number}`, row.device_id) +
        inlineCell(`B${number}`, row.recorded_at) +
        temperature +
        (row.humidity_percent === undefined
          ? ''
          : inlineCell(`D${number}`, row.humidity_percent)) +
        '</row>';
    }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${header}${data}</sheetData></worksheet>`;
}

export function loggerWorkbookFixture(options: LoggerWorkbookFixtureOptions = {}): Buffer {
  const sheets = options.sheets ?? [{
    name: 'Measurements',
    rows: [
      {
        device_id: 'LOGGER-C-001',
        recorded_at: '2026-10-10T14:30:00+07:00',
        temperature_c: '5.4',
        humidity_percent: '72.1',
      },
      {
        device_id: 'LOGGER-C-001',
        recorded_at: '2026-10-10T14:30:05+07:00',
        temperature_c: '5.5',
        humidity_percent: '72.0',
      },
    ],
  }];
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join('');
  const relationships = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" ` +
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
    `Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');
  return zip([
    {
      name: 'xl/workbook.xml',
      content: '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${workbookSheets}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `${relationships}</Relationships>`,
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(
        sheet.rows,
        options.formulaTemperature ?? false,
        options.headerOnly ?? false,
      ),
    })),
  ]);
}
