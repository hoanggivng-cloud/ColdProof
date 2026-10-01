-- No measurements are persisted by the foundation. Fail rather than invent provenance
-- if a developer has manually inserted records before applying this migration.
ALTER TABLE "measurements" ADD COLUMN "source_checksum_sha256" CHAR(64) NOT NULL;
ALTER TABLE "measurements" ADD CONSTRAINT measurement_checksum_hex
CHECK (source_checksum_sha256 ~ '^[a-f0-9]{64}$');
