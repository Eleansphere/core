import bcrypt from 'bcrypt';

const BCRYPT_SALT_ROUNDS = 10;
// Matches bcrypt's own hash format ($2a$/$2b$/$2y$ + cost + salt+hash) — used to tell an
// already-hashed value apart from plaintext, so re-saving an unchanged value never double-hashes.
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

export function looksHashed(value: string): boolean {
  return BCRYPT_HASH_PATTERN.test(value);
}

export function hashPassword(value: string): Promise<string> {
  return bcrypt.hash(value, BCRYPT_SALT_ROUNDS);
}

export function comparePassword(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}
