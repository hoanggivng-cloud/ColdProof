import { posix } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;

type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  flags: number;
  localHeaderOffset: number;
};

export interface XlsxCell {
  reference: string;
  column: number;
  row: number;
  value?: string;
  /** Formula source is exposed for rejection; this reader never evaluates it. */
  formula?: string;
}

export interface XlsxSheet {
  name: string;
  cells: readonly XlsxCell[];
}

export class XlsxWorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxWorkbookError';
  }
}

function assertRange(buffer: Buffer, offset: number, length: number, description: string): void {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new XlsxWorkbookError(`Invalid XLSX ZIP ${description}`);
  }
}

class ZipArchive {
  private readonly entries = new Map<string, ZipEntry>();

  constructor(private readonly content: Buffer) {
    const minimumOffset = Math.max(0, content.length - 22 - MAX_ZIP_COMMENT_BYTES);
    let endOffset = -1;

    for (let offset = content.length - 22; offset >= minimumOffset; offset -= 1) {
      if (content.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
        endOffset = offset;
        break;
      }
    }
    if (endOffset < 0) throw new XlsxWorkbookError('Invalid XLSX ZIP directory');

    assertRange(content, endOffset, 22, 'end record');
    const entryCount = content.readUInt16LE(endOffset + 10);
    const centralDirectoryOffset = content.readUInt32LE(endOffset + 16);
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
      assertRange(content, offset, 46, 'central directory entry');
      if (content.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) {
        throw new XlsxWorkbookError('Invalid XLSX ZIP central directory signature');
      }

      const fileNameLength = content.readUInt16LE(offset + 28);
      const extraLength = content.readUInt16LE(offset + 30);
      const commentLength = content.readUInt16LE(offset + 32);
      const entryLength = 46 + fileNameLength + extraLength + commentLength;
      assertRange(content, offset, entryLength, 'central directory value');
      const fileName = content.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');
      const entry: ZipEntry = {
        flags: content.readUInt16LE(offset + 8),
        compressionMethod: content.readUInt16LE(offset + 10),
        compressedSize: content.readUInt32LE(offset + 20),
        uncompressedSize: content.readUInt32LE(offset + 24),
        localHeaderOffset: content.readUInt32LE(offset + 42),
      };

      if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
        throw new XlsxWorkbookError(`XLSX ZIP entry is too large: ${fileName}`);
      }
      this.entries.set(fileName, entry);
      offset += entryLength;
    }
  }

  has(fileName: string): boolean {
    return this.entries.has(fileName);
  }

  read(fileName: string): string {
    const entry = this.entries.get(fileName);
    if (!entry) throw new XlsxWorkbookError(`Missing XLSX entry: ${fileName}`);
    if ((entry.flags & 0x1) !== 0) {
      throw new XlsxWorkbookError(`Encrypted XLSX entry is unsupported: ${fileName}`);
    }

    const offset = entry.localHeaderOffset;
    assertRange(this.content, offset, 30, 'local file header');
    if (this.content.readUInt32LE(offset) !== LOCAL_FILE_HEADER) {
      throw new XlsxWorkbookError(`Invalid XLSX local header: ${fileName}`);
    }
    const fileNameLength = this.content.readUInt16LE(offset + 26);
    const extraLength = this.content.readUInt16LE(offset + 28);
    const dataOffset = offset + 30 + fileNameLength + extraLength;
    assertRange(this.content, dataOffset, entry.compressedSize, `entry data: ${fileName}`);
    const compressed = this.content.subarray(dataOffset, dataOffset + entry.compressedSize);

    let value: Buffer;
    if (entry.compressionMethod === 0) {
      value = compressed;
    } else if (entry.compressionMethod === 8) {
      value = inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
    } else {
      throw new XlsxWorkbookError(
        `Unsupported XLSX ZIP compression method ${entry.compressionMethod}: ${fileName}`,
      );
    }
    if (value.length !== entry.uncompressedSize) {
      throw new XlsxWorkbookError(`Invalid XLSX entry size: ${fileName}`);
    }
    return value.toString('utf8');
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function attribute(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`).exec(attributes);
  return match ? decodeXml(match[1]) : undefined;
}

function textNodes(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1]))
    .join('');
}

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    textNodes(match[1]),
  );
}

function columnNumber(reference: string): number {
  const letters = /^([A-Z]+)\d+$/.exec(reference)?.[1];
  if (!letters) throw new XlsxWorkbookError(`Invalid XLSX cell reference: ${reference}`);
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value;
}

function parseCells(sheetXml: string, strings: readonly string[]): XlsxCell[] {
  const cells: XlsxCell[] = [];
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

  for (const match of sheetXml.matchAll(cellPattern)) {
    const attributes = match[1];
    const body = match[2] ?? '';
    const reference = attribute(attributes, 'r');
    if (!reference) throw new XlsxWorkbookError('XLSX cell is missing its reference');
    const rowText = /\d+$/.exec(reference)?.[0];
    if (!rowText) throw new XlsxWorkbookError(`Invalid XLSX cell reference: ${reference}`);

    const type = attribute(attributes, 't');
    const rawValue = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
    const rawFormula = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];
    let value: string | undefined;
    if (type === 'inlineStr') {
      value = textNodes(body);
    } else if (type === 's' && rawValue !== undefined) {
      const index = Number(rawValue);
      value = Number.isInteger(index) ? strings[index] : undefined;
      if (value === undefined) {
        throw new XlsxWorkbookError(`Invalid shared-string index at ${reference}`);
      }
    } else if (rawValue !== undefined) {
      value = decodeXml(rawValue);
    }

    cells.push({
      reference,
      column: columnNumber(reference),
      row: Number(rowText),
      ...(value !== undefined ? { value } : {}),
      ...(rawFormula !== undefined ? { formula: decodeXml(rawFormula) } : {}),
    });
  }
  return cells;
}

function resolveWorkbookTarget(target: string): string {
  const normalized = target.startsWith('/')
    ? posix.normalize(target.slice(1))
    : posix.normalize(posix.join('xl', target));
  if (!normalized.startsWith('xl/') || normalized.includes('../')) {
    throw new XlsxWorkbookError(`Unsafe XLSX relationship target: ${target}`);
  }
  return normalized;
}

export function readXlsxSheets(content: Buffer): XlsxSheet[] {
  const archive = new ZipArchive(content);
  const workbookXml = archive.read('xl/workbook.xml');
  const relationshipsXml = archive.read('xl/_rels/workbook.xml.rels');
  const relationships = new Map<string, { target: string; type: string }>();

  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*?)(?:\/>|>)/g)) {
    const id = attribute(match[1], 'Id');
    const target = attribute(match[1], 'Target');
    const type = attribute(match[1], 'Type');
    if (id && target && type) relationships.set(id, { target, type });
  }

  const sharedRelationship = [...relationships.values()].find((relationship) =>
    relationship.type.endsWith('/sharedStrings'),
  );
  const strings = sharedRelationship
    ? sharedStrings(archive.read(resolveWorkbookTarget(sharedRelationship.target)))
    : archive.has('xl/sharedStrings.xml')
      ? sharedStrings(archive.read('xl/sharedStrings.xml'))
      : [];

  const sheets: XlsxSheet[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)(?:\/>|>)/g)) {
    const name = attribute(match[1], 'name');
    const relationshipId = attribute(match[1], 'r:id');
    if (!name || !relationshipId) throw new XlsxWorkbookError('Invalid XLSX worksheet metadata');
    const relationship = relationships.get(relationshipId);
    if (!relationship || !relationship.type.endsWith('/worksheet')) {
      throw new XlsxWorkbookError(`Missing XLSX worksheet relationship: ${relationshipId}`);
    }
    const sheetXml = archive.read(resolveWorkbookTarget(relationship.target));
    sheets.push({ name, cells: parseCells(sheetXml, strings) });
  }

  if (sheets.length === 0) throw new XlsxWorkbookError('XLSX workbook has no worksheets');
  return sheets;
}
