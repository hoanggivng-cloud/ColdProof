# ColdProof observed data

`data/observed/` contains the public observed source data used by ColdProof. The full datasets are intentionally excluded from Git. The committed [`manifests/source_manifest.csv`](manifests/source_manifest.csv) freezes the identity of every source asset by its byte size and SHA-256 checksum.

## Observed Data Freeze v1

- **Zenodo raw** (`observed/zenodo/raw/`): runtime time-series input from nine sensors.
- **Zenodo preprocessed** (`observed/zenodo/preprocessed/`): author-preprocessed reference files.
- **Zenodo metadata** (`observed/zenodo/metadata/`): the overview, experiment actions, and author-provided notebooks.
- **Mendeley conditions** (`observed/mendeley/conditions/`): spatial thermal observations for experimental conditions C01–C13.
- **Mendeley metadata** (`observed/mendeley/metadata/`): experimental-condition documentation.

The SHA-256 values identify the exact frozen source bytes. Raw and preprocessed public-source files must not be edited in place. Cleaning, normalization, and other transformations must create separate derived or canonical records with provenance back to the frozen source.

Frozen source observations remain separate from ColdProof's synthetic scenario, shipment, batch, segment, and handover context.

## Versioned frozen bundle

ColdProof publishes the 36 manifest assets as one deterministic release artifact:

- Bundle version: `1.0.0`
- Release tag: `data-freeze-v1`
- Archive: `coldproof-observed-data-v1.0.0.tar.gz`
- Immutable asset: <https://github.com/hoanggivng-cloud/ColdProof/releases/download/data-freeze-v1/coldproof-observed-data-v1.0.0.tar.gz>
- Archive SHA-256: `da627ee03f4a16a665315d76c1bfd8054756919893b189ed79f7bccd9d3bda41`

The committed [`manifests/frozen_data_bundle.json`](manifests/frozen_data_bundle.json) is the machine-readable restore descriptor.

Restore missing observed data from that exact release, verify an existing installation without rewriting it, or build the bundle from a complete verified local freeze:

```sh
pnpm data:restore
pnpm data:verify
pnpm data:bundle
```

`data:restore` rejects moving release references, validates the archive size and SHA-256 before extraction, validates every archive member, stages the files outside the repository, and then reuses `data:verify` for all per-asset size and SHA-256 checks. It refuses to overwrite a partial or invalid local installation.

`data:bundle` creates deterministic archive bytes using sorted members, normalized timestamps and ownership, stable permissions, and normalized gzip metadata. The generated `dist/` archive is a release artifact and is not committed to Git.

## Attribution and licenses

- Henrichs, E., Stoll, F., & Krupitzer, C. (2025), *Temperature and Humidity Time Series of Cold Storage Room Monitoring*, version v1, Zenodo, DOI [`10.5281/zenodo.15130001`](https://doi.org/10.5281/zenodo.15130001), CC BY 4.0.
- *Average temperature in an insulated box*, version 1, Mendeley Data, DOI [`10.17632/sz5dgkz7k8.1`](https://doi.org/10.17632/sz5dgkz7k8.1), CC BY 4.0.

ColdProof does not claim ownership of these source datasets. The frozen bundle republishes the exact source bytes used for reproducible software testing and benchmark validation under the stated source licenses.

Checksums confirm file integrity only. They do not establish sensor accuracy, experimental validity, or chain of custody.

## Manual source setup

If release restoration is unavailable, obtain the files from the official dataset pages and place them at the exact `relative_path` values in the source manifest:

- Zenodo: <https://doi.org/10.5281/zenodo.15130001>
- Mendeley Data: <https://data.mendeley.com/datasets/sz5dgkz7k8/1>

Then run:

```sh
pnpm data:setup
pnpm data:verify
```

Do not use unverified mirrors. Neither setup nor verification changes source files or silently regenerates checksums.
