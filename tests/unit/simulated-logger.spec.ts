import {
  LoggerAEventSchema,
  LoggerBEventSchema,
  type LoggerAEvent,
  type LoggerBEvent,
} from '@coldproof/parser-contracts';

import {
  generateLoggerEvents,
  parseCliArguments,
  runSimulation,
  type LoggerSchemas,
  type SimulatorConfig,
} from '../../scripts/simulated-logger-core.cjs';

const schemas: LoggerSchemas = {
  LOGGER_A: LoggerAEventSchema,
  LOGGER_B: LoggerBEventSchema,
};

function config(overrides: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    help: false,
    format: 'LOGGER_A',
    deviceId: 'LOGGER-A-001',
    count: 3,
    seed: 42,
    startTime: '2026-10-10T14:30:00+07:00',
    cadenceMs: 5_000,
    intervalMs: 0,
    dryRun: true,
    ...overrides,
  };
}

function loggerAEvents(value: Array<LoggerAEvent | LoggerBEvent>): LoggerAEvent[] {
  return value.filter((event): event is LoggerAEvent => event.source_format === 'LOGGER_A');
}

function loggerBEvents(value: Array<LoggerAEvent | LoggerBEvent>): LoggerBEvent[] {
  return value.filter((event): event is LoggerBEvent => event.source_format === 'LOGGER_B');
}

describe('Deterministic Simulated Logger v1', () => {
  it('generates contract-valid LOGGER_A events', () => {
    const events = generateLoggerEvents(config(), schemas);

    expect(events).toHaveLength(3);
    for (const event of events) expect(LoggerAEventSchema.safeParse(event).success).toBe(true);
  });

  it('generates contract-valid LOGGER_B events with string physical values', () => {
    const events = generateLoggerEvents(
      config({
        format: 'LOGGER_B',
        deviceId: 'B-0001',
        startTime: '2026-10-10T14:30:00',
      }),
      schemas,
    );

    for (const event of loggerBEvents(events)) {
      expect(LoggerBEventSchema.safeParse(event).success).toBe(true);
      expect(typeof event.payload.temp_c).toBe('string');
      expect(typeof event.payload.rh_percent).toBe('string');
    }
  });

  it('produces an identical sequence for the same seed and configuration', () => {
    const first = generateLoggerEvents(config(), schemas);
    const second = generateLoggerEvents(config(), schemas);

    expect(second).toEqual(first);
  });

  it('changes generated physical values when the seed changes', () => {
    const first = generateLoggerEvents(config({ seed: 42 }), schemas);
    const second = generateLoggerEvents(config({ seed: 43 }), schemas);

    expect(second.map((event) => event.payload)).not.toEqual(first.map((event) => event.payload));
  });

  it('respects the requested count', () => {
    expect(generateLoggerEvents(config({ count: 7 }), schemas)).toHaveLength(7);
  });

  it('advances logical timestamps by the deterministic cadence', () => {
    const events = loggerAEvents(
      generateLoggerEvents(config({ cadenceMs: 10_000 }), schemas),
    );

    expect(events.map((event) => event.payload.recorded_at)).toEqual([
      '2026-10-10T14:30:00+07:00',
      '2026-10-10T14:30:10+07:00',
      '2026-10-10T14:30:20+07:00',
    ]);
  });

  it('preserves the explicit LOGGER_A offset', () => {
    const events = loggerAEvents(
      generateLoggerEvents(config({ startTime: '2026-10-10T14:30:00-04:30' }), schemas),
    );

    expect(events.every((event) => event.payload.recorded_at.endsWith('-04:30'))).toBe(true);
  });

  it('does not fabricate a timezone in LOGGER_B timestamps', () => {
    const events = loggerBEvents(
      generateLoggerEvents(
        config({
          format: 'LOGGER_B',
          deviceId: 'B-0001',
          startTime: '2026-10-10T14:30:00',
        }),
        schemas,
      ),
    );

    expect(events.map((event) => event.payload.timestamp)).toEqual([
      '10/10/2026 14:30:00',
      '10/10/2026 14:30:05',
      '10/10/2026 14:30:10',
    ]);
    expect(events.every((event) => !/Z|[+-]\d{2}:\d{2}$/.test(event.payload.timestamp))).toBe(true);
  });

  it('writes payload-only JSONL in dry-run mode without invoking HTTP or sleep', async () => {
    const lines: string[] = [];
    const fetchImplementation = jest.fn(() => {
      throw new Error('HTTP must not be called in dry-run mode');
    }) as unknown as typeof fetch;
    const sleep = jest.fn(async () => undefined);

    const result = await runSimulation(config({ intervalMs: 1_000 }), {
      schemas,
      fetchImplementation,
      writeLine: (line) => lines.push(line),
      sleep,
    });

    expect(result.sentCount).toBe(0);
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toEqual(result.events[0].payload);
    expect(JSON.parse(lines[0])).not.toHaveProperty('source_type');
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('HTTP transport serializes each exact generated logger payload', async () => {
    const requests: Array<{ url: string; body: string }> = [];
    const fetchImplementation = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: String(init?.body) });
      return { ok: true, status: 202 } as Response;
    }) as unknown as typeof fetch;
    const httpConfig = config({
      count: 1,
      dryRun: false,
      endpoint: 'http://localhost:3000/custom-ingest',
    });

    const result = await runSimulation(httpConfig, {
      schemas,
      fetchImplementation,
      writeLine: jest.fn(),
      sleep: jest.fn(async () => undefined),
    });

    expect(result.sentCount).toBe(1);
    expect(requests).toEqual([
      {
        url: 'http://localhost:3000/custom-ingest',
        body: JSON.stringify(result.events[0].payload),
      },
    ]);
  });

  it('fails clearly when HTTP returns a non-2xx response', async () => {
    const fetchImplementation = jest.fn(async () => ({
      ok: false,
      status: 503,
    })) as unknown as typeof fetch;

    await expect(
      runSimulation(
        config({ dryRun: false, endpoint: 'http://localhost:3000/custom-ingest' }),
        {
          schemas,
          fetchImplementation,
          writeLine: jest.fn(),
          sleep: jest.fn(async () => undefined),
        },
      ),
    ).rejects.toThrow('status 503');
  });

  it('fails clearly when the HTTP transport cannot connect', async () => {
    const fetchImplementation = jest.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    await expect(
      runSimulation(
        config({ dryRun: false, endpoint: 'http://localhost:3000/custom-ingest' }),
        {
          schemas,
          fetchImplementation,
          writeLine: jest.fn(),
          sleep: jest.fn(async () => undefined),
        },
      ),
    ).rejects.toThrow('Logger HTTP POST failed: connection refused');
  });

  it.each([
    [['--format', 'UNKNOWN', '--device', 'D', '--dry-run'], /LOGGER_A or LOGGER_B/],
    [['--format', 'LOGGER_A', '--device', 'D', '--count', '0', '--dry-run'], /--count/],
    [['--format', 'LOGGER_A', '--device', 'D'], /--dry-run or --endpoint/],
    [['--format', 'LOGGER_A', '--device', 'D', '--dry-run', '--endpoint', 'http://localhost'], /mutually exclusive/],
    [['--format', 'LOGGER_A', '--device', 'D', '--endpoint', 'not-a-url'], /valid HTTP or HTTPS URL/],
    [['--format', 'LOGGER_A', '--device', 'D', '--cadence', '500', '--dry-run'], /--cadence/],
    [['--format', 'LOGGER_B', '--device', 'D', '--start-time', '2026-10-10T14:30:00Z', '--dry-run'], /timezone-naive/],
  ])('rejects invalid CLI arguments: %j', (argumentsList, expectedError) => {
    expect(() => {
      const parsed = parseCliArguments(argumentsList as string[]);
      if (!parsed.help) generateLoggerEvents(parsed, schemas);
    }).toThrow(expectedError);
  });
});
