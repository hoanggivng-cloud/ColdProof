# Zenodo adapter fixtures

`SENSOR06_excerpt.csv` is a minimal four-line excerpt whose header and measurement values are copied from the public Zenodo v1 source `SENSOR06.CSV` ([DOI 10.5281/zenodo.15130001](https://doi.org/10.5281/zenodo.15130001)). It covers normal parsing without committing the full observed dataset.

Malformed, repeated-header, BOM, blank-line and newline-variant cases are synthetic strings declared inside the adapter unit test and are not represented as observed source data.
