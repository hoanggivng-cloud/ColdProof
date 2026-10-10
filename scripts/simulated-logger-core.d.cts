import type { LoggerAEvent, LoggerBEvent } from '@coldproof/parser-contracts';

export type SimulatedLoggerFormat = 'LOGGER_A' | 'LOGGER_B';

export interface SimulatorConfig {
  help: false;
  format: SimulatedLoggerFormat;
  deviceId: string;
  count: number;
  seed: number;
  startTime: string;
  cadenceMs: number;
  intervalMs: number;
  dryRun: boolean;
  endpoint?: string;
}

export interface ContractSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { message: string } };
}

export interface LoggerSchemas {
  LOGGER_A: ContractSchema<LoggerAEvent>;
  LOGGER_B: ContractSchema<LoggerBEvent>;
}

export function parseCliArguments(argumentsList: string[]): SimulatorConfig | { help: true };
export function createPrng(seed: number): () => number;
export function generateLoggerEvents(
  config: SimulatorConfig,
  schemas: LoggerSchemas,
): Array<LoggerAEvent | LoggerBEvent>;
export function postPayload(
  endpoint: string,
  payload: LoggerAEvent['payload'] | LoggerBEvent['payload'],
  fetchImplementation: typeof fetch,
  timeoutMs?: number,
): Promise<void>;
export function runSimulation(
  config: SimulatorConfig,
  dependencies: {
    schemas: LoggerSchemas;
    fetchImplementation: typeof fetch;
    writeLine(line: string): void;
    sleep(milliseconds: number): Promise<void>;
  },
): Promise<{
  events: Array<LoggerAEvent | LoggerBEvent>;
  sentCount: number;
}>;
export function wait(milliseconds: number): Promise<void>;
export const DEFAULT_CADENCE_MS: number;
export const DEFAULT_LOGGER_A_START: string;
export const DEFAULT_LOGGER_B_START: string;
