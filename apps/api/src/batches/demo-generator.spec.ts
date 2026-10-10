import { generateDemo } from './demo-generator';
const config = { batchId: 'TEST-DEMO', devices: ['A', 'B'], start: '2026-10-10T01:00:00Z', end: '2026-10-10T02:00:00Z', lower: 2, upper: 8, seed: 42 };
describe('seeded demo generator', () => {
  it('is reproducible and keeps normal readings in range', () => {
    const a = generateDemo({ ...config, scenario: 'NORMAL' });
    expect(generateDemo({ ...config, scenario: 'NORMAL' })).toEqual(a);
    expect(a.records.every(r => r.temperature_c >= 2 && r.temperature_c <= 8)).toBe(true);
    expect(new Set(a.records.map(r => r.record_id)).size).toBe(a.records.length);
  });
  it('creates breaches and actual gaps rather than invented missing samples', () => {
    expect(generateDemo({ ...config, scenario: 'EXCURSION' }).records.some(r => r.temperature_c > 8)).toBe(true);
    const missing = generateDemo({ ...config, scenario: 'MISSING' });
    const rows = missing.records.filter(r => r.source_sensor_id === 'A');
    expect(rows.some((r,i) => i > 0 && r.timestamp.getTime() - rows[i-1].timestamp.getTime() > missing.cadenceMs * 1.5)).toBe(true);
  });
  it('rejects invalid windows and caps generated output', () => {
    expect(() => generateDemo({ ...config, end: config.start, scenario: 'NORMAL' })).toThrow();
    expect(generateDemo({ ...config, end: '2027-10-10T01:00:00Z', scenario: 'NORMAL' }).records.length).toBeLessThanOrEqual(242);
  });
});
