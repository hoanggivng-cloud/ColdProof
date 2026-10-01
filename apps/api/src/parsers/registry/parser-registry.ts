import type { ParserAdapter } from '@coldproof/parser-contracts';
import { FormatAParser } from '../format-a/format-a.parser';
import { FormatBParser } from '../format-b/format-b.parser';
import { FormatCParser } from '../format-c/format-c.parser';
export const parserRegistry: readonly ParserAdapter[] = [new FormatAParser(), new FormatBParser(), new FormatCParser()];
export function getParser(id: string, version: string): ParserAdapter {
  const parser = parserRegistry.find(p => p.id === id && p.version === version);
  if (!parser) throw new Error(`Unknown parser ${id}@${version}`);
  return parser;
}
