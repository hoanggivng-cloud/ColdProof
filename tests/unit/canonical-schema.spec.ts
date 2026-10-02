import {
  BusinessEnrichedMeasurementSchema,
  CanonicalMeasurementSchema,
  MeasurementOrigin,
  SpatialMeasurementSchema,
} from '@coldproof/canonical-schema';

const validTimeSeriesMeasurement = {
  record_id: 'ZEN-S01-000001',
  record_type: 'TIMESERIES',
  timestamp: '2025-04-03T10:15:30+00:00',
  temperature_c: 4.2,
  humidity_pct: 81.5,
  source_dataset: 'ZENODO',
  source_file: 'SENSOR01.CSV',
  source_sensor_id: 'SENSOR01',
  source_row_or_ref: 'row:2',
  source_checksum_sha256: 'a'.repeat(64),
  source_format: 'CSV_SEMICOLON',
  parser_id: 'zenodo-dht22',
  parser_version: '1.0.0',
  measurement_origin: 'REAL_PUBLIC_DATA',
  missing_flag: false,
  duplicate_flag: false,
  conflict_flag: false,
} as const;

const validSpatialMeasurement = {
  record_id: 'MEN-C01-X1-Y1',
  record_type: 'SPATIAL_SNAPSHOT',
  condition_id: 'C01',
  position_x: 10,
  position_y: 20,
  temperature_c: 5.1,
  source_dataset: 'MENDELEY',
  source_file: 'C01 Temperature Horizontal Side Empty.xlsx',
  source_row_or_ref: 'Sheet1!B2',
  source_checksum_sha256: 'b'.repeat(64),
  source_format: 'XLSX',
  parser_id: 'mendeley-spatial',
  parser_version: '1.0.0',
  measurement_origin: 'REAL_PUBLIC_DATA',
} as const;

describe('CanonicalMeasurementSchema', () => {
  it('accepts a valid TIMESERIES measurement', () => {
    expect(CanonicalMeasurementSchema.safeParse(validTimeSeriesMeasurement).success).toBe(true);
  });

  it('rejects the wrong record type', () => {
    const input = { ...validTimeSeriesMeasurement, record_type: 'SPATIAL_SNAPSHOT' };
    expect(CanonicalMeasurementSchema.safeParse(input).success).toBe(false);
  });

  it('rejects a TIMESERIES measurement without timestamp', () => {
    const { timestamp: _timestamp, ...withoutTimestamp } = validTimeSeriesMeasurement;
    expect(CanonicalMeasurementSchema.safeParse(withoutTimestamp).success).toBe(false);
  });

  it('requires timestamp to include a timezone or offset', () => {
    const input = { ...validTimeSeriesMeasurement, timestamp: '2025-04-03T10:15:30' };
    expect(CanonicalMeasurementSchema.safeParse(input).success).toBe(false);
  });

  it.each([-0.1, 100.1])('rejects humidity outside 0..100: %s', (humidity_pct) => {
    const input = { ...validTimeSeriesMeasurement, humidity_pct };
    expect(CanonicalMeasurementSchema.safeParse(input).success).toBe(false);
  });

  it('rejects an invalid checksum', () => {
    const input = { ...validTimeSeriesMeasurement, source_checksum_sha256: 'ABC123' };
    expect(CanonicalMeasurementSchema.safeParse(input).success).toBe(false);
  });

  it('rejects absent temperature when missing_flag is false', () => {
    const { temperature_c: _temperature, ...withoutTemperature } = validTimeSeriesMeasurement;
    expect(CanonicalMeasurementSchema.safeParse(withoutTemperature).success).toBe(false);
  });

  it('accepts absent temperature when missing_flag is true', () => {
    const { temperature_c: _temperature, ...withoutTemperature } = validTimeSeriesMeasurement;
    const input = { ...withoutTemperature, missing_flag: true };
    expect(CanonicalMeasurementSchema.safeParse(input).success).toBe(true);
  });

  it('accepts REAL_PUBLIC_DATA measurement origin', () => {
    expect(MeasurementOrigin.safeParse('REAL_PUBLIC_DATA').success).toBe(true);
  });

  it('rejects an unknown measurement origin', () => {
    const input = { ...validTimeSeriesMeasurement, measurement_origin: 'IMAGINARY' };
    expect(CanonicalMeasurementSchema.safeParse(input).success).toBe(false);
  });

  it('rejects unexpected business fields from the core schema', () => {
    const input = { ...validTimeSeriesMeasurement, scenario_id: 'scenario-1' };
    expect(CanonicalMeasurementSchema.safeParse(input).success).toBe(false);
  });
});

describe('SpatialMeasurementSchema', () => {
  it('accepts a valid SPATIAL_SNAPSHOT', () => {
    expect(SpatialMeasurementSchema.safeParse(validSpatialMeasurement).success).toBe(true);
  });

  it('does not require a timestamp', () => {
    expect('timestamp' in validSpatialMeasurement).toBe(false);
    expect(SpatialMeasurementSchema.safeParse(validSpatialMeasurement).success).toBe(true);
  });

  it('validates the spatial source checksum', () => {
    const input = { ...validSpatialMeasurement, source_checksum_sha256: 'not-a-checksum' };
    expect(SpatialMeasurementSchema.safeParse(input).success).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a non-finite spatial coordinate: %s',
    (position_x) => {
      const input = { ...validSpatialMeasurement, position_x };
      expect(SpatialMeasurementSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe('BusinessEnrichedMeasurementSchema', () => {
  it.each([
    [2, 8],
    [2, 2],
  ])('accepts a valid threshold range %s..%s', (lower_threshold, upper_threshold) => {
    const input = {
      ...validTimeSeriesMeasurement,
      business_context_origin: 'REAL',
      lower_threshold,
      upper_threshold,
    };
    expect(BusinessEnrichedMeasurementSchema.safeParse(input).success).toBe(true);
  });

  it('rejects lower_threshold greater than upper_threshold', () => {
    const input = {
      ...validTimeSeriesMeasurement,
      business_context_origin: 'REAL',
      lower_threshold: 8,
      upper_threshold: 2,
    };
    expect(BusinessEnrichedMeasurementSchema.safeParse(input).success).toBe(false);
  });
});
