import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { readManifest, repoRoot } from './data-manifest.mjs';

function sha256(filePath) {
  const hash = createHash('sha256');
  return pipeline(createReadStream(filePath), hash).then(() => hash.digest('hex'));
}

function validateManifest(assets) {
  const errors = [];
  const sourceIds = new Set();
  const relativePaths = new Set();

  for (const asset of assets) {
    if (!asset.source_id) {
      errors.push('Manifest contains an empty source_id.');
    } else if (sourceIds.has(asset.source_id)) {
      errors.push(`Duplicate source_id: ${asset.source_id}`);
    }
    sourceIds.add(asset.source_id);

    if (!asset.relative_path) {
      errors.push(`Empty relative_path for ${asset.source_id || '<unknown source>'}.`);
    } else if (relativePaths.has(asset.relative_path)) {
      errors.push(`Duplicate relative_path: ${asset.relative_path}`);
    }
    relativePaths.add(asset.relative_path);

    if (!/^[a-f0-9]{64}$/.test(asset.checksum_sha256)) {
      errors.push(`Invalid or empty SHA-256 for ${asset.source_id || '<unknown source>'}.`);
    }

    if (!/^\d+$/.test(asset.file_size_bytes)) {
      errors.push(`Invalid file_size_bytes for ${asset.source_id || '<unknown source>'}.`);
    }

    const normalizedPath = path.normalize(asset.relative_path);
    if (
      path.isAbsolute(asset.relative_path) ||
      normalizedPath.startsWith(`..${path.sep}`) ||
      !normalizedPath.startsWith(`data${path.sep}observed${path.sep}`)
    ) {
      errors.push(`Unsafe observed-data path for ${asset.source_id}: ${asset.relative_path}`);
    }
  }

  return errors;
}

async function main() {
  let assets;

  try {
    assets = await readManifest();
  } catch (error) {
    console.error(`Manifest error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const manifestErrors = validateManifest(assets);
  if (manifestErrors.length > 0) {
    console.error('Manifest validation failed:');
    for (const error of manifestErrors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  let found = 0;
  let checksumPass = 0;
  let checksumFail = 0;
  let missing = 0;
  const failures = [];

  for (const asset of assets) {
    const filePath = path.join(repoRoot, asset.relative_path);
    let fileStat;

    try {
      fileStat = await stat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        missing += 1;
        failures.push(`[MISSING] ${asset.source_id}: ${asset.relative_path}`);
        continue;
      }
      throw error;
    }

    if (!fileStat.isFile()) {
      missing += 1;
      failures.push(`[NOT A FILE] ${asset.source_id}: ${asset.relative_path}`);
      continue;
    }

    found += 1;
    const actualHash = await sha256(filePath);
    const expectedSize = Number(asset.file_size_bytes);
    const hashMatches = actualHash === asset.checksum_sha256;
    const sizeMatches = fileStat.size === expectedSize;

    if (hashMatches && sizeMatches) {
      checksumPass += 1;
      continue;
    }

    checksumFail += 1;
    failures.push(
      [
        `[MISMATCH] ${asset.source_id}: ${asset.relative_path}`,
        `  expected SHA-256: ${asset.checksum_sha256}`,
        `  actual SHA-256:   ${actualHash}`,
        `  expected size:    ${expectedSize}`,
        `  actual size:      ${fileStat.size}`,
      ].join('\n'),
    );
  }

  console.log('Observed Data Verification');
  console.log('--------------------------');
  console.log(`Expected assets: ${assets.length}`);
  console.log(`Found: ${found}`);
  console.log(`Checksum pass: ${checksumPass}`);
  console.log(`Checksum fail: ${checksumFail}`);
  console.log(`Missing: ${missing}`);

  if (failures.length > 0) {
    console.error('\nVerification failures:');
    for (const failure of failures) console.error(`${failure}\n`);
    console.log('RESULT: FAIL');
    process.exitCode = 1;
  } else {
    console.log('\nRESULT: PASS');
  }
}

main().catch((error) => {
  console.error(`Verification failed unexpectedly: ${error.stack || error.message}`);
  process.exitCode = 1;
});
