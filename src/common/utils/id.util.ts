import { randomBytes } from 'crypto';

export function generateId(prefix: string): string {
  const id = randomBytes(5).toString('hex'); // 10 hex chars
  return `${prefix}_${id}`;
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}
