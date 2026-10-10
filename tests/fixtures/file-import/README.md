# Logger File Import Test Pack v1

These compact fixtures are deterministic software-test inputs. `VENDOR_A_CSV`,
`VENDOR_B_CSV`, and `VENDOR_C_XLSX` are neutral, vendor-inspired formats and
are not official commercial-vendor integrations.

XLSX fixtures are built in memory by `workbook-fixture.ts`; this keeps binary
fixtures small, reviewable, and deterministic. Real Zenodo and Mendeley
regression tests reference the frozen source installation instead of copying
public datasets into this directory.

Human-facing Vietnamese text is UTF-8. Technical identifiers remain ASCII.
