import { importPreview } from '../mocks/import-preview';
import type { ImportPreview } from '../types/import-preview';
/** Explicit fixture mode; never substitutes fixture data for a failed API request. */
export async function getDemoImportPreview(): Promise<ImportPreview> {
  return structuredClone(importPreview);
}
