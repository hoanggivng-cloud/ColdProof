import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const manifestPath = path.join(repoRoot, 'data/manifests/source_manifest.csv');

const requiredColumns = [
  'source_id',
  'dataset',
  'file_name',
  'relative_path',
  'version',
  'origin_class',
  'source_stage',
  'checksum_sha256',
  'file_size_bytes',
  'license_ref',
  'source_uri',
  'notes',
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error('Manifest contains an unterminated quoted field.');
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}

export async function readManifest() {
  const rows = parseCsv(await readFile(manifestPath, 'utf8'));
  const headers = rows.shift();

  if (!headers) {
    throw new Error('Manifest is empty.');
  }

  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Manifest is missing required columns: ${missingColumns.join(', ')}`);
  }

  return rows
    .filter((row) => row.some((value) => value !== ''))
    .map((row, rowIndex) => {
      if (row.length !== headers.length) {
        throw new Error(
          `Manifest row ${rowIndex + 2} has ${row.length} fields; expected ${headers.length}.`,
        );
      }

      return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
    });
}
