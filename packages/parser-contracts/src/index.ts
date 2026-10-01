import type { MeasurementOrigin } from '@coldproof/canonical-schema';
export interface FileMetadata {
  fileName: string; dataset: string; checksumSha256: string; sourceFormat: string;
  measurementOrigin: MeasurementOrigin; mimeType?: string; sourceSensorId?: string;
}
export interface RawAsset { metadata: FileMetadata; content: Buffer }
export interface DetectionResult { supported: boolean; confidence: number; reason?: string }
export interface ParsedRecord {
  rawRef: string; timestampRaw?: string; timestamp?: string;
  temperatureRaw?: string; temperatureC?: number; humidityPct?: number;
  sourceMetadata: FileMetadata; warnings: string[];
}
export interface ParserAdapter {
  id: string; version: string;
  canParse(input: FileMetadata, sample: Buffer): DetectionResult;
  parse(input: RawAsset): AsyncIterable<ParsedRecord>;
}
