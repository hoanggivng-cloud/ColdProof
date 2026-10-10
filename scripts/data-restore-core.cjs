'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require('node:crypto');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mkdir, readFile, writeFile } = require('node:fs/promises');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { gunzipSync } = require('node:zlib');

const BLOCK_SIZE = 512;
const EXPECTED_BUNDLE = Object.freeze({
  bundle_version: '1.0.0',
  release_tag: 'data-freeze-v1',
  archive_filename: 'coldproof-observed-data-v1.0.0.tar.gz',
  archive_root: 'coldproof-observed-data-v1.0.0',
  asset_count: 36,
  asset_manifest: 'data/manifests/source_manifest.csv',
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseDescriptor(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Frozen data bundle descriptor is invalid JSON: ${error.message}`);
  }
  return validateDescriptor(value);
}

function validateDescriptor(value) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'Bundle descriptor must be an object.');

  for (const [field, expected] of Object.entries(EXPECTED_BUNDLE)) {
    invariant(value[field] !== undefined && value[field] !== null && value[field] !== '', `Bundle descriptor is missing ${field}.`);
    invariant(value[field] === expected, `Unexpected ${field}: expected ${expected}; found ${value[field]}.`);
  }

  invariant(Number.isSafeInteger(value.archive_size_bytes) && value.archive_size_bytes > 0, 'archive_size_bytes must be a positive integer.');
  invariant(typeof value.archive_sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.archive_sha256), 'archive_sha256 must be 64 lowercase hexadecimal characters.');
  invariant(typeof value.immutable_download_reference === 'string' && value.immutable_download_reference.length > 0, 'Bundle descriptor is missing immutable_download_reference.');
  invariant(!/[<>{}]|placeholder|todo|example/i.test(value.immutable_download_reference), 'immutable_download_reference contains a placeholder.');

  let downloadUrl;
  try {
    downloadUrl = new URL(value.immutable_download_reference);
  } catch {
    throw new Error('immutable_download_reference must be a valid URL.');
  }
  invariant(downloadUrl.protocol === 'https:', 'immutable_download_reference must use HTTPS.');
  invariant(downloadUrl.hostname === 'github.com', 'immutable_download_reference must use github.com.');
  invariant(downloadUrl.username === '' && downloadUrl.password === '', 'immutable_download_reference must not contain credentials.');
  invariant(!downloadUrl.pathname.toLowerCase().includes('/latest/'), 'Moving release references such as latest are not allowed.');
  invariant(downloadUrl.search === '' && downloadUrl.hash === '', 'immutable_download_reference must not contain a query or fragment.');
  const expectedPath = `/hoanggivng-cloud/ColdProof/releases/download/${value.release_tag}/${value.archive_filename}`;
  invariant(downloadUrl.pathname === expectedPath, `immutable_download_reference must target ${expectedPath}.`);

  invariant(Array.isArray(value.sources) && value.sources.length > 0, 'Bundle descriptor sources must be a non-empty array.');
  for (const source of value.sources) {
    for (const field of ['dataset', 'doi', 'version', 'license']) {
      invariant(typeof source[field] === 'string' && source[field].length > 0, `Bundle source is missing ${field}.`);
    }
  }

  return value;
}

function verifyArchiveBytes(archiveBytes, descriptor) {
  invariant(Buffer.isBuffer(archiveBytes), 'Archive content must be a Buffer.');
  invariant(
    archiveBytes.length === descriptor.archive_size_bytes,
    `Archive size mismatch: expected ${descriptor.archive_size_bytes}; found ${archiveBytes.length}.`,
  );
  const actualSha256 = sha256(archiveBytes);
  invariant(
    actualSha256 === descriptor.archive_sha256,
    `Archive SHA-256 mismatch: expected ${descriptor.archive_sha256}; found ${actualSha256}.`,
  );
  return actualSha256;
}

function readString(buffer, offset, length) {
  const end = buffer.indexOf(0, offset);
  const boundedEnd = end === -1 || end > offset + length ? offset + length : end;
  return buffer.toString('utf8', offset, boundedEnd);
}

function readOctal(buffer, offset, length, fieldName) {
  const raw = buffer.toString('ascii', offset, offset + length).replace(/\0.*$/, '').trim();
  invariant(/^[0-7]+$/.test(raw), `Invalid tar ${fieldName} field.`);
  return Number.parseInt(raw, 8);
}

function isZeroBlock(buffer, offset) {
  for (let index = offset; index < offset + BLOCK_SIZE; index += 1) {
    if (buffer[index] !== 0) return false;
  }
  return true;
}

function verifyHeaderChecksum(header, archivePath) {
  const expected = readOctal(header, 148, 8, 'checksum');
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  invariant(actual === expected, `Invalid tar header checksum for ${archivePath}.`);
}

function parseTar(tarBytes) {
  const entries = [];
  let offset = 0;
  let foundTerminator = false;

  while (offset + BLOCK_SIZE <= tarBytes.length) {
    if (isZeroBlock(tarBytes, offset)) {
      invariant(offset + (BLOCK_SIZE * 2) <= tarBytes.length && isZeroBlock(tarBytes, offset + BLOCK_SIZE), 'Tar archive has an incomplete end marker.');
      foundTerminator = true;
      offset += BLOCK_SIZE * 2;
      break;
    }

    const header = tarBytes.subarray(offset, offset + BLOCK_SIZE);
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const archivePath = prefix ? `${prefix}/${name}` : name;
    verifyHeaderChecksum(header, archivePath);
    const size = readOctal(header, 124, 12, 'size');
    const typeFlag = String.fromCharCode(header[156] || 0);
    const linkName = readString(header, 157, 100);
    const dataStart = offset + BLOCK_SIZE;
    const dataEnd = dataStart + size;
    invariant(dataEnd <= tarBytes.length, `Truncated tar member: ${archivePath}.`);
    entries.push({
      archivePath,
      typeFlag,
      linkName,
      size,
      data: tarBytes.subarray(dataStart, dataEnd),
    });
    offset = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }

  invariant(foundTerminator, 'Tar archive is missing its end marker.');
  for (let index = offset; index < tarBytes.length; index += 1) {
    invariant(tarBytes[index] === 0, 'Tar archive contains unexpected trailing data.');
  }
  return entries;
}

function validateRelativePath(relativePath, label) {
  invariant(typeof relativePath === 'string' && relativePath.length > 0, `${label} must be non-empty.`);
  invariant(!relativePath.includes('\\'), `${label} contains a backslash: ${relativePath}.`);
  invariant(!path.posix.isAbsolute(relativePath) && !/^[A-Za-z]:/.test(relativePath), `${label} is absolute: ${relativePath}.`);
  const parts = relativePath.split('/');
  invariant(parts.every((part) => part !== '' && part !== '.' && part !== '..'), `${label} contains path traversal: ${relativePath}.`);
}

function validateExpectedPaths(expectedRelativePaths, descriptor) {
  invariant(Array.isArray(expectedRelativePaths), 'Expected manifest paths must be an array.');
  invariant(expectedRelativePaths.length === descriptor.asset_count, `Manifest asset count mismatch: expected ${descriptor.asset_count}; found ${expectedRelativePaths.length}.`);
  const unique = new Set();
  for (const relativePath of expectedRelativePaths) {
    validateRelativePath(relativePath, 'Manifest path');
    invariant(relativePath.startsWith('data/observed/'), `Manifest path is outside data/observed: ${relativePath}.`);
    invariant(!unique.has(relativePath), `Manifest contains duplicate path: ${relativePath}.`);
    unique.add(relativePath);
  }
  return unique;
}

function inspectArchive(archiveBytes, descriptor, expectedRelativePaths) {
  verifyArchiveBytes(archiveBytes, descriptor);
  const expected = validateExpectedPaths(expectedRelativePaths, descriptor);
  let tarBytes;
  try {
    tarBytes = gunzipSync(archiveBytes);
  } catch (error) {
    throw new Error(`Archive gzip content is invalid: ${error.message}`);
  }

  const parsedEntries = parseTar(tarBytes);
  const seenArchivePaths = new Set();
  const seenRelativePaths = new Set();
  const prefix = `${descriptor.archive_root}/`;
  const entries = [];

  for (const entry of parsedEntries) {
    validateRelativePath(entry.archivePath, 'Archive member');
    invariant(!seenArchivePaths.has(entry.archivePath), `Archive contains duplicate member: ${entry.archivePath}.`);
    seenArchivePaths.add(entry.archivePath);
    invariant(entry.typeFlag !== '1', `Archive hard link is not allowed: ${entry.archivePath}.`);
    invariant(entry.typeFlag !== '2', `Archive symbolic link is not allowed: ${entry.archivePath}.`);
    invariant(entry.typeFlag === '0' || entry.typeFlag === '\0', `Archive member is not a regular file: ${entry.archivePath}.`);
    invariant(entry.archivePath.startsWith(prefix), `Archive member is outside expected root ${descriptor.archive_root}: ${entry.archivePath}.`);
    const relativePath = entry.archivePath.slice(prefix.length);
    validateRelativePath(relativePath, 'Archive relative path');
    invariant(expected.has(relativePath), `Archive contains unexpected member: ${relativePath}.`);
    invariant(!seenRelativePaths.has(relativePath), `Archive contains duplicate manifest member: ${relativePath}.`);
    seenRelativePaths.add(relativePath);
    entries.push({ relativePath, data: entry.data });
  }

  for (const relativePath of expected) {
    invariant(seenRelativePaths.has(relativePath), `Archive is missing manifest member: ${relativePath}.`);
  }
  invariant(entries.length === descriptor.asset_count, `Archive asset count mismatch: expected ${descriptor.asset_count}; found ${entries.length}.`);
  return entries;
}

async function extractEntries(entries, destinationRoot) {
  for (const entry of entries) {
    const destination = path.join(destinationRoot, ...entry.relativePath.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, entry.data, { flag: 'wx', mode: 0o644 });
  }
}

async function downloadArchive(downloadUrl, fetchImplementation = globalThis.fetch) {
  invariant(typeof fetchImplementation === 'function', 'A fetch implementation is required.');
  const response = await fetchImplementation(downloadUrl, { redirect: 'follow' });
  invariant(response && response.ok, `Frozen data archive download failed with HTTP ${response?.status ?? 'unknown'}.`);
  return Buffer.from(await response.arrayBuffer());
}

function classifyInstalledState(verificationPassed, existingAssetCount) {
  invariant(Number.isSafeInteger(existingAssetCount) && existingAssetCount >= 0, 'existingAssetCount must be a non-negative integer.');
  if (verificationPassed) return 'ALREADY_VALID';
  if (existingAssetCount === 0) return 'ABSENT';
  return 'INVALID_OR_PARTIAL';
}

async function readDescriptorFile(descriptorPath) {
  return parseDescriptor(await readFile(descriptorPath, 'utf8'));
}

module.exports = {
  EXPECTED_BUNDLE,
  classifyInstalledState,
  downloadArchive,
  extractEntries,
  inspectArchive,
  parseDescriptor,
  readDescriptorFile,
  sha256,
  validateDescriptor,
  verifyArchiveBytes,
};
