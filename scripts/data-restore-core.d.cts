export interface FrozenDataSource {
  dataset: string;
  doi: string;
  version: string;
  license: string;
}

export interface FrozenDataBundleDescriptor {
  bundle_version: string;
  release_tag: string;
  archive_filename: string;
  archive_root: string;
  archive_size_bytes: number;
  archive_sha256: string;
  asset_count: number;
  asset_manifest: string;
  immutable_download_reference: string;
  sources: FrozenDataSource[];
}

export interface ArchiveEntry {
  relativePath: string;
  data: Buffer;
}

export function parseDescriptor(text: string): FrozenDataBundleDescriptor;
export function validateDescriptor(value: unknown): FrozenDataBundleDescriptor;
export function verifyArchiveBytes(archiveBytes: Buffer, descriptor: FrozenDataBundleDescriptor): string;
export function inspectArchive(
  archiveBytes: Buffer,
  descriptor: FrozenDataBundleDescriptor,
  expectedRelativePaths: string[],
): ArchiveEntry[];
export function extractEntries(entries: ArchiveEntry[], destinationRoot: string): Promise<void>;
export function downloadArchive(
  downloadUrl: string,
  fetchImplementation?: typeof fetch,
): Promise<Buffer>;
export function classifyInstalledState(
  verificationPassed: boolean,
  existingAssetCount: number,
): 'ALREADY_VALID' | 'ABSENT' | 'INVALID_OR_PARTIAL';
export function readDescriptorFile(descriptorPath: string): Promise<FrozenDataBundleDescriptor>;
export function sha256(value: Buffer): string;
