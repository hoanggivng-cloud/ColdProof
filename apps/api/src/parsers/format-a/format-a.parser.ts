import type { DetectionResult, FileMetadata, ParsedRecord, ParserAdapter, RawAsset } from '@coldproof/parser-contracts';
export class FormatAParser implements ParserAdapter {
  readonly id = 'format-a';
  readonly version = '0.1.0';
  canParse(_input: FileMetadata, _sample: Buffer): DetectionResult {
    return { supported: false, confidence: 0, reason: 'Parser not implemented' };
  }
  async *parse(_input: RawAsset): AsyncIterable<ParsedRecord> {
    throw new Error('FormatAParser is not implemented');
  }
}
