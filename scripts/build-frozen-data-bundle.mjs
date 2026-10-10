import { createWriteStream } from 'node:fs';
import { lstat, mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, constants as zlibConstants } from 'node:zlib';

import { readManifest, repoRoot } from './data-manifest.mjs';

const BUNDLE_VERSION = '1.0.0';
const ARCHIVE_ROOT = 'coldproof-observed-data-v1.0.0';
const DEFAULT_OUTPUT = path.join(
  repoRoot,
  'dist/data-freeze/coldproof-observed-data-v1.0.0.tar.gz',
);
const BLOCK_SIZE = 512;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function writeText(header, offset, length, value) {
  const encoded = Buffer.from(value, 'utf8');
  invariant(encoded.length <= length, `Tar header value is too long: ${value}`);
  encoded.copy(header, offset);
}

function writeOctal(header, offset, length, value) {
  const octal = value.toString(8).padStart(length - 1, '0');
  invariant(octal.length === length - 1, `Tar numeric field overflow: ${value}`);
  writeText(header, offset, length, `${octal}\0`);
}

function splitUstarPath(archivePath) {
  const full = Buffer.byteLength(archivePath, 'utf8');
  if (full <= 100) return { name: archivePath, prefix: '' };

  for (let index = archivePath.lastIndexOf('/'); index > 0; index = archivePath.lastIndexOf('/', index - 1)) {
    const prefix = archivePath.slice(0, index);
    const name = archivePath.slice(index + 1);
    if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(name, 'utf8') <= 100) {
      return { name, prefix };
    }
  }

  throw new Error(`Archive path cannot be represented by POSIX ustar: ${archivePath}`);
}

function createUstarHeader(archivePath, size) {
  const header = Buffer.alloc(BLOCK_SIZE);
  const { name, prefix } = splitUstarPath(archivePath);

  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeText(header, 156, 1, '0');
  writeText(header, 257, 6, 'ustar\0');
  writeText(header, 263, 2, '00');
  writeText(header, 265, 32, 'root');
  writeText(header, 297, 32, 'root');
  writeOctal(header, 329, 8, 0);
  writeOctal(header, 337, 8, 0);
  writeText(header, 345, 155, prefix);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = checksum.toString(8).padStart(6, '0');
  writeText(header, 148, 8, `${checksumText}\0 `);
  return header;
}

async function* buildTarStream(assets) {
  for (const asset of assets) {
    const sourcePath = path.join(repoRoot, asset.relative_path);
    const sourceStat = await lstat(sourcePath);
    invariant(sourceStat.isFile(), `Bundle source is not a regular file: ${asset.relative_path}`);
    invariant(!sourceStat.isSymbolicLink(), `Bundle source is a symbolic link: ${asset.relative_path}`);
    invariant(sourceStat.size === Number(asset.file_size_bytes), `Bundle source size mismatch: ${asset.relative_path}`);

    const archivePath = path.posix.join(ARCHIVE_ROOT, asset.relative_path.split(path.sep).join('/'));
    yield createUstarHeader(archivePath, sourceStat.size);
    yield await readFile(sourcePath);

    const paddingLength = (BLOCK_SIZE - (sourceStat.size % BLOCK_SIZE)) % BLOCK_SIZE;
    if (paddingLength > 0) yield Buffer.alloc(paddingLength);
  }

  yield Buffer.alloc(BLOCK_SIZE * 2);
}

async function main() {
  const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT;
  const assets = (await readManifest()).sort((left, right) => {
    if (left.relative_path < right.relative_path) return -1;
    if (left.relative_path > right.relative_path) return 1;
    return 0;
  });
  invariant(assets.length === 36, `Expected 36 manifest assets; found ${assets.length}.`);
  invariant(
    new Set(assets.map((asset) => asset.relative_path)).size === assets.length,
    'Manifest contains duplicate relative paths.',
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await pipeline(
    Readable.from(buildTarStream(assets)),
    createGzip({
      level: zlibConstants.Z_BEST_COMPRESSION,
      mtime: 0,
    }),
    createWriteStream(outputPath, { flags: 'w', mode: 0o644 }),
  );

  // zlib writes a platform-specific gzip OS byte. RFC 1952 permits 255 for
  // unknown, so normalize it to keep archive bytes stable across platforms.
  const archive = await open(outputPath, 'r+');
  try {
    await archive.write(Buffer.from([0xff]), 0, 1, 9);
  } finally {
    await archive.close();
  }

  console.log(`Built frozen data bundle v${BUNDLE_VERSION}`);
  console.log(`Assets: ${assets.length}`);
  console.log(`Archive root: ${ARCHIVE_ROOT}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((error) => {
  console.error(`Frozen data bundle build failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
