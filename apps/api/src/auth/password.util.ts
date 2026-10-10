import * as crypto from 'crypto';

/**
 * Hashes a plaintext password using crypto.scrypt with a random 16-byte salt.
 * Returns format: "salt:hash"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a stored hashed password.
 * Uses timingSafeEqual to protect against timing attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;

  // Standard scrypt format "salt:hash"
  if (storedHash.includes(':')) {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    const computedBuf = Buffer.from(computed, 'hex');
    const originalBuf = Buffer.from(originalHash, 'hex');
    if (computedBuf.length !== originalBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, originalBuf);
  }

  // Fallback for legacy plain-text or sha256
  const sha256 = crypto.createHash('sha256').update(password).digest('hex');
  if (sha256 === storedHash) return true;
  return password === storedHash;
}
