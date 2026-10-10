import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  classifyInstalledState,
  downloadArchive,
  extractEntries,
  inspectArchive,
  parseDescriptor,
  sha256,
  validateDescriptor,
  verifyArchiveBytes,
  type FrozenDataBundleDescriptor,
} from '../../scripts/data-restore-core.cjs';

const ARCHIVE_ROOT = 'coldproof-observed-data-v1.0.0';
const BLOCK_SIZE = 512;
const EXPECTED_PATHS = ['data/observed/a.csv', 'data/observed/b.xlsx'];

interface TestTarEntry {
  name: string;
  content?: string;
  type?: string;
  linkName?: string;
}

function writeText(header: Buffer, offset: number, length: number, value: string): void {
  Buffer.from(value).copy(header, offset, 0, length);
}

function writeOctal(header: Buffer, offset: number, length: number, value: number): void {
  writeText(header, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`);
}

function tarHeader(entry: TestTarEntry, size: number): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE);
  writeText(header, 0, 100, entry.name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeText(header, 156, 1, entry.type ?? '0');
  writeText(header, 157, 100, entry.linkName ?? '');
  writeText(header, 257, 6, 'ustar\0');
  writeText(header, 263, 2, '00');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeText(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function buildArchive(entries: TestTarEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content ?? '');
    chunks.push(tarHeader(entry, content.length), content);
    const padding = (BLOCK_SIZE - (content.length % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

function validEntries(): TestTarEntry[] {
  return EXPECTED_PATHS.map((relativePath, index) => ({
    name: `${ARCHIVE_ROOT}/${relativePath}`,
    content: `asset-${index}`,
  }));
}

function descriptorFor(
  archive: Buffer,
  overrides: Partial<FrozenDataBundleDescriptor> = {},
): FrozenDataBundleDescriptor {
  return {
    bundle_version: '1.0.0',
    release_tag: 'data-freeze-v1',
    archive_filename: 'coldproof-observed-data-v1.0.0.tar.gz',
    archive_root: ARCHIVE_ROOT,
    archive_size_bytes: archive.length,
    archive_sha256: sha256(archive),
    asset_count: EXPECTED_PATHS.length,
    asset_manifest: 'data/manifests/source_manifest.csv',
    immutable_download_reference:
      'https://github.com/hoanggivng-cloud/ColdProof/releases/download/data-freeze-v1/coldproof-observed-data-v1.0.0.tar.gz',
    sources: [
      {
        dataset: 'Test data',
        doi: '10.0000/test',
        version: '1',
        license: 'CC-BY-4.0',
      },
    ],
    ...overrides,
  };
}

describe('frozen data restore', () => {
  it('rejects malformed descriptor JSON', () => {
    expect(() => parseDescriptor('{')).toThrow(/invalid JSON/i);
  });

  it('rejects a missing descriptor field', () => {
    const archive = buildArchive(validEntries());
    const descriptor = descriptorFor(archive) as Partial<FrozenDataBundleDescriptor>;
    delete descriptor.archive_root;
    expect(() => validateDescriptor(descriptor)).toThrow(/missing archive_root/i);
  });

  it('rejects a moving latest release reference', () => {
    const archive = buildArchive(validEntries());
    const descriptor = descriptorFor(archive, {
      asset_count: 36,
      immutable_download_reference:
        'https://github.com/hoanggivng-cloud/ColdProof/releases/latest/download/coldproof-observed-data-v1.0.0.tar.gz',
    });
    expect(() => validateDescriptor(descriptor)).toThrow(/latest/i);
  });

  it('rejects a bad archive SHA-256', () => {
    const archive = buildArchive(validEntries());
    const descriptor = descriptorFor(archive, { archive_sha256: '0'.repeat(64) });
    expect(() => verifyArchiveBytes(archive, descriptor)).toThrow(/SHA-256 mismatch/i);
  });

  it('rejects a wrong archive size', () => {
    const archive = buildArchive(validEntries());
    const descriptor = descriptorFor(archive, { archive_size_bytes: archive.length + 1 });
    expect(() => verifyArchiveBytes(archive, descriptor)).toThrow(/size mismatch/i);
  });

  it('reports a missing remote archive asset', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(downloadArchive('https://example.invalid/archive.tar.gz', fetchMock)).rejects.toThrow(
      /HTTP 404/i,
    );
  });

  it.each([
    ['traversal', `${ARCHIVE_ROOT}/../escape.csv`, /traversal/i],
    ['absolute path', '/absolute.csv', /absolute/i],
  ])('rejects a %s archive member', (_label, unsafePath, expectedError) => {
    const archive = buildArchive([{ name: unsafePath, content: 'unsafe' }]);
    const descriptor = descriptorFor(archive, { asset_count: 1 });
    expect(() => inspectArchive(archive, descriptor, [EXPECTED_PATHS[0]])).toThrow(expectedError);
  });

  it.each([
    ['symbolic link', '2', /symbolic link/i],
    ['hard link', '1', /hard link/i],
  ])('rejects a %s member', (_label, type, expectedError) => {
    const archive = buildArchive([
      {
        name: `${ARCHIVE_ROOT}/${EXPECTED_PATHS[0]}`,
        type,
        linkName: 'target',
      },
    ]);
    const descriptor = descriptorFor(archive, { asset_count: 1 });
    expect(() => inspectArchive(archive, descriptor, [EXPECTED_PATHS[0]])).toThrow(expectedError);
  });

  it('rejects duplicate archive members', () => {
    const duplicate = { name: `${ARCHIVE_ROOT}/${EXPECTED_PATHS[0]}`, content: 'same' };
    const archive = buildArchive([duplicate, duplicate]);
    const descriptor = descriptorFor(archive, { asset_count: 1 });
    expect(() => inspectArchive(archive, descriptor, [EXPECTED_PATHS[0]])).toThrow(/duplicate member/i);
  });

  it('rejects an unexpected archive member', () => {
    const archive = buildArchive([
      ...validEntries(),
      { name: `${ARCHIVE_ROOT}/data/observed/unexpected.txt`, content: 'unexpected' },
    ]);
    const descriptor = descriptorFor(archive);
    expect(() => inspectArchive(archive, descriptor, EXPECTED_PATHS)).toThrow(/unexpected member/i);
  });

  it('rejects a missing manifest member', () => {
    const archive = buildArchive([validEntries()[0]]);
    const descriptor = descriptorFor(archive);
    expect(() => inspectArchive(archive, descriptor, EXPECTED_PATHS)).toThrow(/missing manifest member/i);
  });

  it('extracts a valid archive into deterministic manifest-relative paths', async () => {
    const archive = buildArchive(validEntries());
    const descriptor = descriptorFor(archive);
    const entries = inspectArchive(archive, descriptor, EXPECTED_PATHS);
    const destination = await mkdtemp(path.join(tmpdir(), 'coldproof-restore-test-'));
    try {
      await extractEntries(entries, destination);
      await expect(readFile(path.join(destination, EXPECTED_PATHS[0]), 'utf8')).resolves.toBe('asset-0');
      await expect(readFile(path.join(destination, EXPECTED_PATHS[1]), 'utf8')).resolves.toBe('asset-1');
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
  });

  it('short-circuits an already-installed valid data set', () => {
    expect(classifyInstalledState(true, 36)).toBe('ALREADY_VALID');
    expect(classifyInstalledState(false, 0)).toBe('ABSENT');
    expect(classifyInstalledState(false, 1)).toBe('INVALID_OR_PARTIAL');
  });
});
