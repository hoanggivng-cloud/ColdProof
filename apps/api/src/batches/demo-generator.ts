import { createHash } from 'crypto';
export type DemoScenario = 'NORMAL' | 'EXCURSION' | 'MISSING' | 'CONFLICT';
export function generateDemo(input: { batchId: string; devices: string[]; start: string; end: string; lower: number; upper: number; seed: number; scenario: DemoScenario }) {
  const start = Date.parse(input.start), end = Date.parse(input.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(input.lower) || !Number.isFinite(input.upper) || input.lower >= input.upper || !input.devices.length || input.devices.length > 8) throw new Error('Invalid simulation configuration');
  let state = input.seed >>> 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  // Bound the total output; cadence is explicit in generator provenance.
  const steps = Math.min(120, Math.max(12, Math.ceil((end - start) / 60000)));
  const cadenceMs = (end - start) / steps;
  const devices = input.scenario === 'CONFLICT' && input.devices.length === 1 ? [...input.devices, `${input.devices[0]}-SIM-SECONDARY`] : input.devices;
  const records: { record_id: string; timestamp: Date; temperature_c: number; source_sensor_id: string; source_row_or_ref: string }[] = [];
  for (const device of devices) for (let i = 0; i <= steps; i++) {
    if (input.scenario === 'MISSING' && i >= Math.floor(steps * .4) && i <= Math.floor(steps * .5)) continue;
    const middle = i >= Math.floor(steps * .35) && i <= Math.floor(steps * .55);
    let temperature = (input.lower + input.upper) / 2 + (random() - .5) * (input.upper - input.lower) * .1;
    if (middle && input.scenario === 'EXCURSION') temperature = input.upper + .5 + random() * .2;
    if (middle && input.scenario === 'CONFLICT' && device !== devices[0]) temperature += 2;
    records.push({ record_id: `SIM-${createHash('sha256').update(`${input.batchId}:${input.seed}:${device}:${i}`).digest('hex').slice(0, 24)}`, timestamp: new Date(start + Math.round(i * cadenceMs)), temperature_c: Math.round(temperature * 100) / 100, source_sensor_id: device, source_row_or_ref: `${device}:sample:${i}` });
  }
  return { records, cadenceMs, devices, generator: 'coldproof-demo-v1' };
}
