import { constants as fsConstants } from 'node:fs';
import { access, copyFile, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import restoreCore from './data-restore-core.cjs';
import { readManifest, repoRoot } from './data-manifest.mjs';

const descriptorPath = path.join(repoRoot, 'data/manifests/frozen_data_bundle.json');
const verifyScriptPath = path.join(repoRoot, 'scripts/verify-data.mjs');

function runVerification(stdio = 'pipe') {
  return spawnSync(process.execPath, [verifyScriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio,
  });
}

async function countExistingAssets(relativePaths) {
  let count = 0;
  for (const relativePath of relativePaths) {
    try {
      await lstat(path.join(repoRoot, relativePath));
      count += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return count;
}

async function removeInstalledAssets(relativePaths) {
  for (const relativePath of relativePaths) {
    await rm(path.join(repoRoot, relativePath), { force: true });
  }
}

async function assertSafeDestination(relativePath) {
  const parts = relativePath.split('/').slice(0, -1);
  let currentPath = repoRoot;
  for (const part of parts) {
    currentPath = path.join(currentPath, part);
    try {
      const currentStat = await lstat(currentPath);
      if (currentStat.isSymbolicLink() || !currentStat.isDirectory()) {
        throw new Error(`Unsafe destination ancestor for ${relativePath}: ${currentPath}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function main() {
  const descriptor = await restoreCore.readDescriptorFile(descriptorPath);
  const manifest = await readManifest();
  const relativePaths = manifest.map((asset) => asset.relative_path);
  const initialVerification = runVerification();
  const existingAssetCount = await countExistingAssets(relativePaths);
  const installationState = restoreCore.classifyInstalledState(initialVerification.status === 0, existingAssetCount);

  if (installationState === 'ALREADY_VALID') {
    process.stdout.write(initialVerification.stdout);
    console.log('Frozen observed data is already installed and valid; no files were rewritten.');
    return;
  }
  if (installationState === 'INVALID_OR_PARTIAL') {
    throw new Error(
      `Refusing to overwrite an invalid or partial observed-data installation (${existingAssetCount}/${descriptor.asset_count} manifest assets exist). Remove or repair it explicitly, then retry.`,
    );
  }

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'coldproof-data-restore-'));
  const stagingRoot = path.join(temporaryRoot, 'staging');
  const installedPaths = [];

  try {
    console.log(`Downloading frozen data bundle ${descriptor.bundle_version} from immutable release ${descriptor.release_tag}...`);
    const archiveBytes = await restoreCore.downloadArchive(
      descriptor.immutable_download_reference,
      (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(120_000) }),
    );
    const archiveSha256 = restoreCore.verifyArchiveBytes(archiveBytes, descriptor);
    console.log(`Archive verified: ${archiveSha256}`);

    const entries = restoreCore.inspectArchive(archiveBytes, descriptor, relativePaths);
    await mkdir(stagingRoot, { recursive: true });
    await restoreCore.extractEntries(entries, stagingRoot);

    for (const relativePath of relativePaths) {
      const stagedPath = path.join(stagingRoot, ...relativePath.split('/'));
      await access(stagedPath, fsConstants.R_OK);
      await assertSafeDestination(relativePath);
    }

    try {
      for (const relativePath of relativePaths) {
        const sourcePath = path.join(stagingRoot, ...relativePath.split('/'));
        const destinationPath = path.join(repoRoot, ...relativePath.split('/'));
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL);
        installedPaths.push(relativePath);
      }

      const finalVerification = runVerification('inherit');
      if (finalVerification.status !== 0) {
        throw new Error(`Per-asset verification failed with exit code ${finalVerification.status ?? 'unknown'}.`);
      }
    } catch (error) {
      await removeInstalledAssets(installedPaths);
      throw error;
    }

    console.log(`Frozen data restore completed: ${entries.length}/${descriptor.asset_count} assets installed and verified.`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Frozen data restore failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
