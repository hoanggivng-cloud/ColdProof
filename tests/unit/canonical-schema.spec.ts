import { CanonicalMeasurementSchema } from '@coldproof/canonical-schema';
describe('Canonical schema', () => {
  it('rejects missing provenance', () => { expect(CanonicalMeasurementSchema.safeParse({ record_id: '1' }).success).toBe(false); });
});
