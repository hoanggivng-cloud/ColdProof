import { Queue } from 'bullmq';
export const IMPORT_QUEUE = 'coldproof-imports';
// Explicit factory: no connection until the future dispatch service calls it.
export function createImportQueue() {
  return new Queue(IMPORT_QUEUE, { connection: { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) } });
}
