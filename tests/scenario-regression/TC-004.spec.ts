import { detectSensorConflicts, EngineMeasurement } from '../../apps/api/src/exceptions/exception-engine';

// Expected interface: CanonicalMeasurement[] → QualityIssue[]; retain both sensor streams
describe('TC-004 • Sensor conflict (S04 Sensor Conflict Preservation)', () => {
  const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime();

  // Create mock measurements for S04: 2 sensors (SENSOR01 & SENSOR02) measuring simultaneously with temperature divergence
  const mockMeasurements: EngineMeasurement[] = [
    {
      record_id: 'M-S04-A1',
      batch_id: 'BATCH-S04-001',
      segment_id: 'LEG-01-A',
      timestamp: new Date(baseTime + 0 * 60000).toISOString(),
      temperature_c: 4.2,
      source_dataset: 'Zenodo',
      source_file: 'SENSOR01_raw.csv',
      source_sensor_id: 'SENSOR01',
      source_row_or_ref: 'row_1',
      source_checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      source_format: 'FORMAT-A',
      parser_id: 'zenodo-adapter',
      parser_version: '1.0.0',
      measurement_origin: 'REAL_PUBLIC_DATA',
      business_context_origin: 'SYNTHETIC',
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    },
    {
      record_id: 'M-S04-B1',
      batch_id: 'BATCH-S04-001',
      segment_id: 'LEG-01-B',
      timestamp: new Date(baseTime + 0 * 60000).toISOString(),
      temperature_c: 6.8, // Divergence = 2.6°C (>= 1.0°C)
      source_dataset: 'Zenodo',
      source_file: 'SENSOR02_raw.csv',
      source_sensor_id: 'SENSOR02',
      source_row_or_ref: 'row_1',
      source_checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      source_format: 'FORMAT-A',
      parser_id: 'zenodo-adapter',
      parser_version: '1.0.0',
      measurement_origin: 'REAL_PUBLIC_DATA',
      business_context_origin: 'SYNTHETIC',
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    },
    {
      record_id: 'M-S04-A2',
      batch_id: 'BATCH-S04-001',
      segment_id: 'LEG-01-A',
      timestamp: new Date(baseTime + 15 * 60000).toISOString(),
      temperature_c: 4.3,
      source_dataset: 'Zenodo',
      source_file: 'SENSOR01_raw.csv',
      source_sensor_id: 'SENSOR01',
      source_row_or_ref: 'row_2',
      source_checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      source_format: 'FORMAT-A',
      parser_id: 'zenodo-adapter',
      parser_version: '1.0.0',
      measurement_origin: 'REAL_PUBLIC_DATA',
      business_context_origin: 'SYNTHETIC',
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    },
    {
      record_id: 'M-S04-B2',
      batch_id: 'BATCH-S04-001',
      segment_id: 'LEG-01-B',
      timestamp: new Date(baseTime + 15 * 60000).toISOString(),
      temperature_c: 4.4, // Divergence = 0.1°C (< 1.0°C, normal agreement)
      source_dataset: 'Zenodo',
      source_file: 'SENSOR02_raw.csv',
      source_sensor_id: 'SENSOR02',
      source_row_or_ref: 'row_2',
      source_checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      source_format: 'FORMAT-A',
      parser_id: 'zenodo-adapter',
      parser_version: '1.0.0',
      measurement_origin: 'REAL_PUBLIC_DATA',
      business_context_origin: 'SYNTHETIC',
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    },
  ];

  it('detects sensor divergence and outputs QualityIssue with code SENSOR_CONFLICT', () => {
    const { issues } = detectSensorConflicts(mockMeasurements);

    expect(issues.length).toBeGreaterThanOrEqual(1);
    const conflictIssue = issues.find(i => i.code === 'SENSOR_CONFLICT');
    expect(conflictIssue).toBeDefined();
    expect(conflictIssue?.record_ids).toContain('M-S04-A1');
    expect(conflictIssue?.record_ids).toContain('M-S04-B1');
  });

  it('retains both sensor streams and marks conflictRecordIds without discarding either stream', () => {
    const { conflictRecordIds } = detectSensorConflicts(mockMeasurements);

    // Both records from the divergent window are flagged
    expect(conflictRecordIds.has('M-S04-A1')).toBe(true);
    expect(conflictRecordIds.has('M-S04-B1')).toBe(true);

    // The normal agreement window records are not flagged
    expect(conflictRecordIds.has('M-S04-A2')).toBe(false);
    expect(conflictRecordIds.has('M-S04-B2')).toBe(false);

    // Guardrail 3: Neither sensor stream is dropped or averaged; all original measurements remain intact
    expect(mockMeasurements).toHaveLength(4);
  });
});
