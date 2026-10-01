-- Registered source metadata is immutable. New bytes require a new asset version.
CREATE FUNCTION reject_source_asset_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registered source assets are immutable; register a new version';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER source_assets_immutable
BEFORE UPDATE OR DELETE ON "source_assets"
FOR EACH ROW EXECUTE FUNCTION reject_source_asset_mutation();

ALTER TABLE "source_assets" ADD CONSTRAINT source_checksum_hex
CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$');
