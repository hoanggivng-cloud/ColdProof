import type {
  DetectionResult,
  FileMetadata,
  ParsedTimeSeriesRecord,
  ParserAdapter,
  RawAsset,
} from '@coldproof/parser-contracts';

const EXPECTED_COLUMNS = ['Date', 'Time', 'Temperature (C)', 'Humidity (%)'] as const;
const SENSOR_FILE_NAME = /^SENSOR(\d{2})\.CSV$/i;
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function splitLines(content: string): string[] {
  return content.split(/\r\n|\n|\r/);
}

function withoutBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

function columnsFor(line: string): string[] {
  return withoutBom(line).split(';');
}

function isExpectedHeader(line: string): boolean {
  const columns = columnsFor(line).map((column) => column.trim());
  return (
    columns.length === EXPECTED_COLUMNS.length &&
    columns.every((column, index) => column === EXPECTED_COLUMNS[index])
  );
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function normalizeDate(raw: string): string | undefined {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  if (!match) return undefined;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12 || day < 1 || day > daysPerMonth[month - 1]) return undefined;
  return `${yearText}-${monthText}-${dayText}`;
}

function normalizeTime(raw: string): string | undefined {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return undefined;

  const [, hourText, minuteText, secondText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (hour > 23 || minute > 59 || second > 59) return undefined;
  return `${hourText}:${minuteText}:${secondText}`;
}

function parseFiniteDecimal(raw: string | undefined): number | undefined {
  if (raw === undefined || !DECIMAL_NUMBER.test(raw.trim())) return undefined;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : undefined;
}

function metadataWithSensorId(metadata: FileMetadata): FileMetadata {
  if (metadata.sourceSensorId !== undefined) return metadata;

  const match = SENSOR_FILE_NAME.exec(metadata.fileName.trim());
  if (!match) return metadata;

  return { ...metadata, sourceSensorId: `SENSOR${match[1]}` };
}

export class ZenodoAdapter implements ParserAdapter {
  readonly id = 'zenodo-cold-storage';
  readonly version = '1.0.0';

  canParse(input: FileMetadata, sample: Buffer): DetectionResult {
    const firstContentLine = splitLines(sample.toString('utf8')).find(
      (line) => withoutBom(line).trim() !== '',
    );

    if (firstContentLine === undefined || !isExpectedHeader(firstContentLine)) {
      return {
        supported: false,
        confidence: 0,
        reason: `Expected semicolon-delimited header: ${EXPECTED_COLUMNS.join(';')}`,
      };
    }

    const datasetMatches = /zenodo|15130001/i.test(input.dataset);
    const fileNameMatches = SENSOR_FILE_NAME.test(input.fileName.trim());
    const formatMatches = /csv/i.test(input.sourceFormat) || /csv/i.test(input.mimeType ?? '');
    const confidence = Math.min(
      1,
      0.8 + (datasetMatches ? 0.1 : 0) + (fileNameMatches ? 0.05 : 0) + (formatMatches ? 0.05 : 0),
    );

    return {
      supported: true,
      confidence,
      reason: 'Matched the Zenodo cold-storage semicolon-delimited header',
    };
  }

  async *parse(input: RawAsset): AsyncIterable<ParsedTimeSeriesRecord> {
    const lines = splitLines(input.content.toString('utf8'));
    const sourceMetadata = metadataWithSensorId(input.metadata);
    let headerSeen = false;

    for (let index = 0; index < lines.length; index += 1) {
      const physicalRow = index + 1;
      const line = index === 0 ? withoutBom(lines[index]) : lines[index];

      if (line.trim() === '') continue;

      if (isExpectedHeader(line)) {
        headerSeen = true;
        continue;
      }

      if (!headerSeen) {
        throw new Error(
          `Unsupported Zenodo CSV header in ${input.metadata.fileName}; first data found at row:${physicalRow}`,
        );
      }

      const columns = columnsFor(line);
      const [dateRaw = '', timeRaw = '', temperatureRaw, humidityRaw] = columns;
      const timestampRaw = `${dateRaw};${timeRaw}`;
      const normalizedDate = normalizeDate(dateRaw);
      const normalizedTime = normalizeTime(timeRaw);
      const temperatureC = parseFiniteDecimal(temperatureRaw);
      const humidityPct = parseFiniteDecimal(humidityRaw);
      const warnings: string[] = [];

      if (columns.length !== EXPECTED_COLUMNS.length) {
        warnings.push(
          `WRONG_COLUMN_COUNT: expected ${EXPECTED_COLUMNS.length} columns but found ${columns.length}`,
        );
      }
      if (normalizedDate === undefined) warnings.push(`INVALID_DATE: ${JSON.stringify(dateRaw)}`);
      if (normalizedTime === undefined) warnings.push(`INVALID_TIME: ${JSON.stringify(timeRaw)}`);
      if (temperatureC === undefined) {
        warnings.push(`INVALID_TEMPERATURE: ${JSON.stringify(temperatureRaw ?? '')}`);
      }
      if (humidityPct === undefined) {
        warnings.push(`INVALID_HUMIDITY: ${JSON.stringify(humidityRaw ?? '')}`);
      }

      yield {
        recordType: 'TIMESERIES',
        rawRef: `row:${physicalRow}`,
        timestampRaw,
        timestamp:
          normalizedDate !== undefined && normalizedTime !== undefined
            ? `${normalizedDate}T${normalizedTime}`
            : timestampRaw,
        ...(temperatureRaw !== undefined ? { temperatureRaw } : {}),
        ...(temperatureC !== undefined ? { temperatureC } : {}),
        ...(humidityPct !== undefined ? { humidityPct } : {}),
        sourceMetadata,
        warnings,
      };
    }

    if (!headerSeen) {
      throw new Error(`Missing Zenodo CSV header in ${input.metadata.fileName}`);
    }
  }
}
