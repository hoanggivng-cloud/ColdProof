import type { MeasurementOrigin } from '@coldproof/canonical-schema';
export interface SourceSummary { id: string; dataset: string; file: string; origin: MeasurementOrigin }
export interface BatchSummary { id: string; route: string; status: string; segments: number }
export interface DataService {
  sources(): Promise<SourceSummary[]>;
  batches(): Promise<BatchSummary[]>;
}
// TODO: implement the API client when endpoint contracts are ready.
