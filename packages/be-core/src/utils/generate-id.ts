import crypto from 'crypto';

export function generateId(prefix: string): string {
  const hexId = crypto.randomBytes(16).toString('hex');
  return `${prefix}${hexId}`;
}
