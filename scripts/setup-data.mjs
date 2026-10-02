import { spawnSync } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { readManifest, repoRoot } from './data-manifest.mjs';

const observedDirectories = [
  'data/observed/zenodo/raw',
  'data/observed/zenodo/preprocessed',
  'data/observed/zenodo/metadata',
  'data/observed/mendeley/conditions',
  'data/observed/mendeley/metadata',
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function main() {
  for (const directory of observedDirectories) {
    await mkdir(path.join(repoRoot, directory), { recursive: true });
  }

  const assets = await readManifest();
  const missing = [];

  for (const asset of assets) {
    if (!(await exists(path.join(repoRoot, asset.relative_path)))) missing.push(asset);
  }

  if (missing.length > 0) {
    console.error('ColdProof public datasets are not installed completely.');
    console.error('');
    console.error('Zenodo:');
    console.error('  DOI: 10.5281/zenodo.15130001 (v1)');
    console.error('  Official source: https://doi.org/10.5281/zenodo.15130001');
    console.error('  Expected: SENSOR01.CSV–SENSOR09.CSV, preprocessed files, and metadata files');
    console.error('  Destination: data/observed/zenodo/{raw,preprocessed,metadata}/');
    console.error('');
    console.error('Mendeley Data:');
    console.error('  Dataset: sz5dgkz7k8 (version 1)');
    console.error('  Official source: https://data.mendeley.com/datasets/sz5dgkz7k8/1');
    console.error('  Expected: C01–C13 XLSX and Experimental conditions.docx');
    console.error('  Destination: data/observed/mendeley/{conditions,metadata}/');
    console.error('');
    console.error(`Missing assets (${missing.length}):`);
    for (const asset of missing) console.error(`- ${asset.relative_path}`);
    console.error('');
    console.error('Download only from the official sources, place each file at its manifest path,');
    console.error('then run:');
    console.error('');
    console.error('  pnpm data:verify');
    process.exitCode = 1;
    return;
  }

  console.log(`All ${assets.length} observed source assets are present. Verifying frozen bytes...\n`);
  const verification = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/verify-data.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (verification.error) throw verification.error;
  process.exitCode = verification.status ?? 1;
}

main().catch((error) => {
  console.error(`Data setup failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
