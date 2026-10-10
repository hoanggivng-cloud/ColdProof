'use strict';

const DEFAULT_COUNT = 1;
const DEFAULT_SEED = 1;
const DEFAULT_CADENCE_MS = 5_000;
const DEFAULT_INTERVAL_MS = 0;
const DEFAULT_LOGGER_A_START = '2026-10-10T14:30:00+07:00';
const DEFAULT_LOGGER_B_START = '2026-10-10T14:30:00';
const MAX_COUNT = 100_000;
const MAX_UINT32 = 0xffff_ffff;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseInteger(value, option, { minimum, maximum }) {
  invariant(value !== undefined, `${option} requires a value.`);
  invariant(/^-?\d+$/.test(value), `${option} must be an integer.`);
  const parsed = Number(value);
  invariant(Number.isSafeInteger(parsed), `${option} must be a safe integer.`);
  invariant(parsed >= minimum && parsed <= maximum, `${option} must be between ${minimum} and ${maximum}.`);
  return parsed;
}

function parseCadence(value) {
  const cadenceMs = parseInteger(value, '--cadence', {
    minimum: 1_000,
    maximum: 86_400_000,
  });
  invariant(cadenceMs % 1_000 === 0, '--cadence must be a whole number of seconds.');
  return cadenceMs;
}

function parseEndpoint(value) {
  invariant(value !== undefined, '--endpoint requires a value.');
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('--endpoint must be a valid HTTP or HTTPS URL.');
  }
  invariant(endpoint.protocol === 'http:' || endpoint.protocol === 'https:', '--endpoint must use HTTP or HTTPS.');
  invariant(endpoint.username === '' && endpoint.password === '', '--endpoint must not contain credentials.');
  return endpoint.toString();
}

function parseCliArguments(argumentsList) {
  const values = new Map();
  let dryRun = false;
  let help = false;
  const valueOptions = new Set([
    '--format',
    '--device',
    '--count',
    '--seed',
    '--start-time',
    '--cadence',
    '--interval',
    '--endpoint',
  ]);

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--dry-run') {
      invariant(!dryRun, '--dry-run may only be specified once.');
      dryRun = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    invariant(valueOptions.has(argument), `Unknown option: ${argument}`);
    invariant(!values.has(argument), `${argument} may only be specified once.`);
    const value = argumentsList[index + 1];
    invariant(value !== undefined && !value.startsWith('--'), `${argument} requires a value.`);
    values.set(argument, value);
    index += 1;
  }

  if (help) return { help: true };

  const format = values.get('--format');
  invariant(format === 'LOGGER_A' || format === 'LOGGER_B', '--format must be LOGGER_A or LOGGER_B.');
  const deviceId = values.get('--device');
  invariant(deviceId !== undefined && deviceId.trim() !== '', '--device is required and must be non-empty.');
  const endpoint = values.has('--endpoint') ? parseEndpoint(values.get('--endpoint')) : undefined;
  invariant(dryRun || endpoint !== undefined, 'Specify either --dry-run or --endpoint.');
  invariant(!(dryRun && endpoint !== undefined), '--dry-run and --endpoint are mutually exclusive.');

  return {
    help: false,
    format,
    deviceId,
    count: values.has('--count')
      ? parseInteger(values.get('--count'), '--count', { minimum: 1, maximum: MAX_COUNT })
      : DEFAULT_COUNT,
    seed: values.has('--seed')
      ? parseInteger(values.get('--seed'), '--seed', { minimum: 0, maximum: MAX_UINT32 })
      : DEFAULT_SEED,
    startTime:
      values.get('--start-time') ??
      (format === 'LOGGER_A' ? DEFAULT_LOGGER_A_START : DEFAULT_LOGGER_B_START),
    cadenceMs: values.has('--cadence')
      ? parseCadence(values.get('--cadence'))
      : DEFAULT_CADENCE_MS,
    intervalMs: values.has('--interval')
      ? parseInteger(values.get('--interval'), '--interval', { minimum: 0, maximum: 86_400_000 })
      : DEFAULT_INTERVAL_MS,
    dryRun,
    endpoint,
  };
}

function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validateCalendarParts(year, month, day, hour, minute, second) {
  invariant(month >= 1 && month <= 12, 'Start time contains an invalid month.');
  invariant(day >= 1 && day <= daysInMonth(year, month), 'Start time contains an invalid day.');
  invariant(hour >= 0 && hour <= 23, 'Start time contains an invalid hour.');
  invariant(minute >= 0 && minute <= 59, 'Start time contains an invalid minute.');
  invariant(second >= 0 && second <= 59, 'Start time contains an invalid second.');
}

function parseLoggerAStart(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  invariant(match !== null, 'LOGGER_A --start-time must be ISO YYYY-MM-DDTHH:mm:ss with Z or a numeric offset.');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, suffix, sign, offsetHourText, offsetMinuteText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  validateCalendarParts(...parts);
  let offsetMinutes = 0;
  if (suffix !== 'Z') {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    invariant(offsetHour <= 23 && offsetMinute <= 59, 'LOGGER_A --start-time contains an invalid offset.');
    offsetMinutes = (offsetHour * 60 + offsetMinute) * (sign === '-' ? -1 : 1);
  }
  const [year, month, day, hour, minute, second] = parts;
  return {
    epochMs: Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000,
    offsetMinutes,
    suffix,
  };
}

function parseLoggerBStart(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  invariant(match !== null, 'LOGGER_B --start-time must be timezone-naive ISO YYYY-MM-DDTHH:mm:ss.');
  const parts = match.slice(1).map(Number);
  validateCalendarParts(...parts);
  const [year, month, day, hour, minute, second] = parts;
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function twoDigits(value) {
  return String(value).padStart(2, '0');
}

function formatLoggerATimestamp(epochMs, start) {
  const local = new Date(epochMs + start.offsetMinutes * 60_000);
  return `${local.getUTCFullYear()}-${twoDigits(local.getUTCMonth() + 1)}-${twoDigits(local.getUTCDate())}T${twoDigits(local.getUTCHours())}:${twoDigits(local.getUTCMinutes())}:${twoDigits(local.getUTCSeconds())}${start.suffix}`;
}

function formatLoggerBTimestamp(epochMs) {
  const local = new Date(epochMs);
  return `${twoDigits(local.getUTCDate())}/${twoDigits(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${twoDigits(local.getUTCHours())}:${twoDigits(local.getUTCMinutes())}:${twoDigits(local.getUTCSeconds())}`;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function syntheticValues(index, random) {
  const temperature = roundOne(5 + Math.sin(index / 3) * 0.35 + (random() - 0.5) * 0.3);
  const humidity = roundOne(70 + Math.cos(index / 4) * 1.5 + (random() - 0.5) * 1.2);
  const battery = Math.max(0, 96 - Math.floor(index / 20));
  return { temperature, humidity, battery };
}

function validateGeneratedEvent(event, schema) {
  invariant(schema && typeof schema.safeParse === 'function', 'A logger contract schema is required.');
  const validation = schema.safeParse(event);
  if (!validation.success) {
    throw new Error(`Simulator generated an invalid ${event.source_format} event: ${validation.error.message}`);
  }
  return validation.data;
}

function generateLoggerEvents(config, schemas) {
  const random = createPrng(config.seed);
  const events = [];

  if (config.format === 'LOGGER_A') {
    const start = parseLoggerAStart(config.startTime);
    for (let index = 0; index < config.count; index += 1) {
      const values = syntheticValues(index, random);
      const event = {
        source_type: 'SIMULATED_LOGGER',
        source_format: 'LOGGER_A',
        origin: 'SYNTHETIC',
        timestamp_semantics: 'OFFSET_DECLARED_IN_PAYLOAD',
        payload: {
          device_id: config.deviceId,
          recorded_at: formatLoggerATimestamp(start.epochMs + index * config.cadenceMs, start),
          temperature: values.temperature,
          humidity: values.humidity,
          battery: values.battery,
        },
      };
      events.push(validateGeneratedEvent(event, schemas.LOGGER_A));
    }
    return events;
  }

  invariant(config.format === 'LOGGER_B', `Unsupported logger format: ${config.format}`);
  const start = parseLoggerBStart(config.startTime);
  for (let index = 0; index < config.count; index += 1) {
    const values = syntheticValues(index, random);
    const event = {
      source_type: 'SIMULATED_LOGGER',
      source_format: 'LOGGER_B',
      origin: 'SYNTHETIC',
      format_origin: 'VENDOR_INSPIRED',
      timestamp_semantics: 'SOURCE_LOCAL_TIMEZONE_UNSPECIFIED',
      payload: {
        serial: config.deviceId,
        timestamp: formatLoggerBTimestamp(start + index * config.cadenceMs),
        temp_c: values.temperature.toFixed(1),
        rh_percent: values.humidity.toFixed(1),
      },
    };
    events.push(validateGeneratedEvent(event, schemas.LOGGER_B));
  }
  return events;
}

async function postPayload(endpoint, payload, fetchImplementation, timeoutMs = 10_000) {
  let response;
  try {
    response = await fetchImplementation(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`Logger HTTP POST failed: ${error.message}`);
  }
  invariant(response && response.ok, `Logger HTTP POST failed with status ${response?.status ?? 'unknown'}.`);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runSimulation(config, dependencies) {
  const events = generateLoggerEvents(config, dependencies.schemas);
  if (config.dryRun) {
    for (const event of events) dependencies.writeLine(JSON.stringify(event.payload));
    return { events, sentCount: 0 };
  }

  invariant(config.endpoint !== undefined, 'HTTP simulation requires an endpoint.');
  for (let index = 0; index < events.length; index += 1) {
    await postPayload(config.endpoint, events[index].payload, dependencies.fetchImplementation);
    if (config.intervalMs > 0 && index < events.length - 1) {
      await dependencies.sleep(config.intervalMs);
    }
  }
  return { events, sentCount: events.length };
}

module.exports = {
  DEFAULT_CADENCE_MS,
  DEFAULT_LOGGER_A_START,
  DEFAULT_LOGGER_B_START,
  createPrng,
  generateLoggerEvents,
  parseCliArguments,
  postPayload,
  runSimulation,
  wait,
};
