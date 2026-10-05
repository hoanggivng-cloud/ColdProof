import { Injectable } from '@nestjs/common';
import type {
  DetectionResult,
  FileMetadata,
  ParsedSpatialRecord,
  ParserAdapter,
  RawAsset,
} from '@coldproof/parser-contracts';

import { readXlsxSheets, type XlsxCell, type XlsxSheet } from './xlsx-workbook';

const CONDITION_FILE = /^(C(?:0[1-9]|1[0-3]))\b.*\.xlsx$/i;
const DATASET_REFERENCE = /mendeley|sz5dgkz7k8/i;
const EXPECTED_SHEET_NAME = 'Feuil1';
const EXPECTED_HEADERS = [
  'Condition',
  'PCM position',
  'Aspect ratio',
  'Ambient temperature (°C)',
  'Initial load temperature (°C)',
  'Spacing beneath load (mm)',
] as const;

type SpatialObservation = {
  cellReference: string;
  positionX: number;
  positionY: number;
  positionZ: number;
  temperatureRaw: string;
  temperatureC: number;
};

type ConditionWorkbook = {
  conditionId: string;
  sheetName: string;
  observations: SpatialObservation[];
};

export class MendeleyWorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MendeleyWorkbookError';
  }
}

function cellMap(sheet: XlsxSheet): Map<string, XlsxCell> {
  return new Map(sheet.cells.map((cell) => [cell.reference, cell]));
}

function finiteNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : undefined;
}

function requiredCell(cells: ReadonlyMap<string, XlsxCell>, reference: string): string {
  const value = cells.get(reference)?.value?.trim();
  if (!value) throw new MendeleyWorkbookError(`Missing required workbook cell ${reference}`);
  return value;
}

function parseConditionId(fileName: string): string {
  const match = CONDITION_FILE.exec(fileName.trim());
  if (!match) {
    throw new MendeleyWorkbookError('Expected Mendeley condition filename C01–C13 .xlsx');
  }
  return match[1].toUpperCase();
}

function parseConditionWorkbook(metadata: FileMetadata, content: Buffer): ConditionWorkbook {
  const conditionId = parseConditionId(metadata.fileName);
  const sheets = readXlsxSheets(content);
  if (sheets.length !== 1 || sheets[0].name !== EXPECTED_SHEET_NAME) {
    throw new MendeleyWorkbookError(
      `Expected one worksheet named ${EXPECTED_SHEET_NAME}; found ${sheets.map((sheet) => sheet.name).join(', ')}`,
    );
  }

  const sheet = sheets[0];
  const cells = cellMap(sheet);
  for (let column = 0; column < EXPECTED_HEADERS.length; column += 1) {
    const reference = `${String.fromCharCode(65 + column)}1`;
    if (requiredCell(cells, reference).trim() !== EXPECTED_HEADERS[column]) {
      throw new MendeleyWorkbookError(`Unexpected workbook header at ${reference}`);
    }
  }

  const conditionNumber = finiteNumber(requiredCell(cells, 'A2'));
  const expectedConditionNumber = Number(conditionId.slice(1));
  if (conditionNumber !== expectedConditionNumber) {
    throw new MendeleyWorkbookError(
      `Workbook condition ${String(conditionNumber)} does not match filename ${conditionId}`,
    );
  }
  if (requiredCell(cells, 'A6') !== 'Average temperature (°C)') {
    throw new MendeleyWorkbookError('Expected Average temperature (°C) data section at A6');
  }
  if (requiredCell(cells, 'A7') !== 'Z (mm)') {
    throw new MendeleyWorkbookError('Expected Z (mm) coordinate header at A7');
  }

  const plane = /^Middle plane \(X\s*=\s*([^\s]+)\s*mm\)$/.exec(requiredCell(cells, 'A4'));
  const positionX = finiteNumber(plane?.[1]);
  if (positionX === undefined) {
    throw new MendeleyWorkbookError('Invalid X coordinate in middle-plane description at A4');
  }

  const zCoordinates = new Map<number, number>();
  for (const cell of sheet.cells) {
    if (cell.row !== 7 || cell.column < 2 || cell.value === undefined) continue;
    const positionZ = finiteNumber(cell.value);
    if (positionZ === undefined) {
      throw new MendeleyWorkbookError(`Invalid Z coordinate at ${cell.reference}`);
    }
    zCoordinates.set(cell.column, positionZ);
  }
  if (zCoordinates.size === 0) throw new MendeleyWorkbookError('No Z coordinates found in row 7');

  const observations: SpatialObservation[] = [];
  const yCells = sheet.cells.filter((cell) => cell.column === 1 && cell.row > 7);
  for (const yCell of yCells) {
    const label = yCell.value?.trim();
    if (!label?.startsWith('Y')) continue;
    const yMatch = /^Y\s*=\s*([^\s]+)\s*mm$/.exec(label);
    const positionY = finiteNumber(yMatch?.[1]);
    if (positionY === undefined) {
      throw new MendeleyWorkbookError(`Invalid Y coordinate at ${yCell.reference}`);
    }

    for (const [column, positionZ] of zCoordinates) {
      const temperatureCell = sheet.cells.find(
        (cell) => cell.row === yCell.row && cell.column === column,
      );
      if (!temperatureCell) continue;
      const temperatureRaw = temperatureCell?.value?.trim();
      if (temperatureRaw === undefined || temperatureRaw === '' || temperatureRaw === '-') continue;
      const temperatureC = finiteNumber(temperatureRaw);
      if (temperatureC === undefined) {
        throw new MendeleyWorkbookError(
          `Invalid temperature at sheet:${sheet.name}:cell:${temperatureCell.reference}`,
        );
      }
      observations.push({
        cellReference: temperatureCell.reference,
        positionX,
        positionY,
        positionZ,
        temperatureRaw,
        temperatureC,
      });
    }
  }
  if (observations.length === 0) {
    throw new MendeleyWorkbookError('No spatial temperature observations found');
  }

  return { conditionId, sheetName: sheet.name, observations };
}

@Injectable()
export class MendeleyAdapter implements ParserAdapter {
  readonly id = 'mendeley-insulated-box';
  readonly version = '1.0.0';

  canParse(input: FileMetadata, sample: Buffer): DetectionResult {
    if (!DATASET_REFERENCE.test(input.dataset)) {
      return {
        supported: false,
        confidence: 0,
        reason: 'Dataset metadata does not identify Mendeley dataset sz5dgkz7k8',
      };
    }
    if (!CONDITION_FILE.test(input.fileName.trim())) {
      return {
        supported: false,
        confidence: 0,
        reason: 'Expected Mendeley condition filename C01–C13 .xlsx',
      };
    }

    try {
      parseConditionWorkbook(input, sample);
    } catch (error) {
      return {
        supported: false,
        confidence: 0,
        reason: error instanceof Error ? error.message : 'Malformed Mendeley workbook',
      };
    }

    const formatMatches = /xlsx|spreadsheetml/i.test(input.sourceFormat) ||
      /spreadsheetml/i.test(input.mimeType ?? '');
    return {
      supported: true,
      confidence: formatMatches ? 1 : 0.95,
      reason: 'Matched Mendeley condition metadata and spatial temperature matrix structure',
    };
  }

  async *parse(input: RawAsset): AsyncIterable<ParsedSpatialRecord> {
    const workbook = parseConditionWorkbook(input.metadata, input.content);
    for (const observation of workbook.observations) {
      yield {
        recordType: 'SPATIAL_SNAPSHOT',
        rawRef: `sheet:${workbook.sheetName}:cell:${observation.cellReference}`,
        conditionId: workbook.conditionId,
        positionX: observation.positionX,
        positionY: observation.positionY,
        positionZ: observation.positionZ,
        temperatureRaw: observation.temperatureRaw,
        temperatureC: observation.temperatureC,
        sourceMetadata: input.metadata,
        warnings: [],
      };
    }
  }
}
