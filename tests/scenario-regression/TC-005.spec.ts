import type { CanonicalMeasurement } from '@coldproof/canonical-schema';
import { detectExcursions, ProductProfile } from '../../apps/api/src/exceptions/exception-engine';

// Expected interface: CanonicalMeasurement[] + product profile → ExceptionCandidate[]; human review required
describe('TC-005 • Excursion Detection (S02 Handover Heat Excursion)', () => {
  const profile: ProductProfile = {
    id: 'DEMO_2_8C',
    lower_threshold: 2.0,
    upper_threshold: 8.0,
  };

  const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime();

  // Create mock measurements for S02: LEG-01 (normal), LEG-02 (heat excursion at handover), LEG-03 (normal)
  const mockMeasurements: CanonicalMeasurement[] = [
    // LEG-01: Within [2.0, 8.0]
    {
      record_id: 'M-01',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-01',
      timestamp: new Date(baseTime + 0 * 60000).toISOString(),
      temperature_c: 4.8,
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
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
      record_id: 'M-02',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-01',
      timestamp: new Date(baseTime + 15 * 60000).toISOString(),
      temperature_c: 5.0,
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
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
    // LEG-02: Handover door-open event breaches 8.0°C (M-07: 8.7, M-08: 9.2, M-09: 8.5)
    {
      record_id: 'M-05',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-02',
      timestamp: new Date(baseTime + 60 * 60000).toISOString(),
      temperature_c: 5.8,
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
      source_row_or_ref: 'row_5',
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
      record_id: 'M-06',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-02',
      timestamp: new Date(baseTime + 75 * 60000).toISOString(),
      temperature_c: 7.9,
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
      source_row_or_ref: 'row_6',
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
      record_id: 'M-07',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-02',
      timestamp: new Date(baseTime + 90 * 60000).toISOString(),
      temperature_c: 8.7, // Breach
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
      source_row_or_ref: 'row_7',
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
      record_id: 'M-08',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-02',
      timestamp: new Date(baseTime + 105 * 60000).toISOString(),
      temperature_c: 9.2, // Peak breach
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
      source_row_or_ref: 'row_8',
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
      record_id: 'M-09',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-02',
      timestamp: new Date(baseTime + 120 * 60000).toISOString(),
      temperature_c: 8.5, // Breach
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
      source_row_or_ref: 'row_9',
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
      record_id: 'M-10',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-02',
      timestamp: new Date(baseTime + 135 * 60000).toISOString(),
      temperature_c: 7.4, // Restored
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
      source_row_or_ref: 'row_10',
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
    // LEG-03: Restored normal
    {
      record_id: 'M-11',
      batch_id: 'CP-DEMO-001',
      segment_id: 'LEG-03',
      timestamp: new Date(baseTime + 150 * 60000).toISOString(),
      temperature_c: 5.5,
      source_dataset: 'Zenodo',
      source_file: 'SENSOR06_raw.csv',
      source_row_or_ref: 'row_11',
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

  it('detects exactly 1 exception candidate for S02 handover breach', () => {
    const result = detectExcursions(mockMeasurements, profile);

    expect(result.exceptions).toHaveLength(1);
    const exc = result.exceptions[0];
    expect(exc.batch_id).toBe('CP-DEMO-001');
    expect(exc.profile_id).toBe('DEMO_2_8C');
    expect(exc.record_ids).toEqual(['M-07', 'M-08', 'M-09']);
  });

  it('computes interval duration, peak temperature, and enforces PENDING_REVIEW', () => {
    const result = detectExcursions(mockMeasurements, profile);

    expect(result.intervals).toHaveLength(1);
    const interval = result.intervals[0];
    expect(interval.segment_id).toBe('LEG-02');
    expect(interval.peak_temp).toBe(9.2);
    expect(interval.min_temp).toBe(8.5);
    expect(interval.duration_minutes).toBe(30); // 120m - 90m = 30m
    // Guardrail 4: No pharma disposition
    expect(interval.status).toBe('PENDING_REVIEW');
  });

  it('enforces Segment Boundary Reset (Guardrail 2) without bridging between segments', () => {
    // Add an out-of-range point at the end of LEG-01 and at start of LEG-02
    const testMeasurements: CanonicalMeasurement[] = [
      {
        ...mockMeasurements[0],
        segment_id: 'LEG-01',
        temperature_c: 9.5, // Breach in LEG-01
      },
      {
        ...mockMeasurements[2],
        segment_id: 'LEG-02',
        temperature_c: 9.8, // Breach in LEG-02
      },
    ];

    const result = detectExcursions(testMeasurements, profile);
    // Must produce 2 separate exception intervals, NOT bridged across segments
    expect(result.exceptions).toHaveLength(2);
    expect(result.intervals[0].segment_id).toBe('LEG-01');
    expect(result.intervals[1].segment_id).toBe('LEG-02');
  });

  it('enforces Spatial vs Time-series Guardrail (AC-06): no duration calculated for spatial data', () => {
    const spatialMeasurements: CanonicalMeasurement[] = [
      {
        ...mockMeasurements[0],
        timestamp: undefined, // Spatial snapshot without timestamp
        temperature_c: 12.0,
      },
    ];

    const result = detectExcursions(spatialMeasurements, profile);
    expect(result.exceptions).toHaveLength(1);
    expect(result.intervals[0].duration_minutes).toBeUndefined();
  });
});
