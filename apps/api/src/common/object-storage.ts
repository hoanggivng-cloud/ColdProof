import { Client } from 'minio';
export function createObjectStorage() {
  return new Client({ endPoint: process.env.MINIO_ENDPOINT ?? 'localhost', port: Number(process.env.MINIO_PORT ?? 9000), useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY ?? '', secretKey: process.env.MINIO_SECRET_KEY ?? '' });
}
// Raw keys: <sha256>/<file-name>. Never overwrite registered raw assets.
// TV4: add conditional writes / retention policy and verify checksums before registration.
