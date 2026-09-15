import crypto from 'crypto';
import { Model, ModelStatic } from 'sequelize';
import type { ModelConfig } from '@eleansphere/schema';
import { generateId } from '../utils/generate-id';
import { HttpError } from '../app/error-handler';

export const REFRESH_TOKEN_MODEL_NAME = 'RefreshToken';
const REFRESH_TOKEN_ID_PREFIX = 'rt_';
const TOKEN_FAMILY_ID_PREFIX = 'rtf_';
const SECRET_BYTES = 32;
const TOKEN_SEPARATOR = '.';

/**
 * Model for issued refresh tokens, registered by `createCore` when `auth.refreshTokens` is set.
 * Only a SHA-256 of each token's secret is stored. Tokens issued from one login share a
 * `familyId`, so reusing a rotated token can revoke the whole chain.
 */
export function createRefreshTokenConfig(authModelName: string): ModelConfig {
  return {
    name: REFRESH_TOKEN_MODEL_NAME,
    prefix: REFRESH_TOKEN_ID_PREFIX,
    skipAutoRoutes: true,
    fields: {
      userId: {
        type: 'STRING',
        required: true,
        references: { model: authModelName, onDelete: 'CASCADE' },
      },
      familyId: { type: 'STRING', required: true },
      secretHash: { type: 'STRING', required: true, sensitive: true },
      expiresAt: { type: 'DATE', required: true },
      revokedAt: { type: 'DATE' },
    },
    indexes: [{ fields: ['userId'] }, { fields: ['familyId'] }],
  };
}

export interface RotatedRefreshToken {
  userId: string;
  refreshToken: string;
}

export interface RefreshTokenStore {
  /** Starts a new token family (a login or registration). */
  issue(userId: string): Promise<string>;
  /**
   * Exchanges a valid token for a new one in the same family. An unknown, expired or already used
   * token is rejected with 401; an already used one also revokes its whole family, since it
   * suggests the token was stolen.
   */
  rotate(refreshToken: string): Promise<RotatedRefreshToken>;
  /** Logs one session out. Unknown tokens are ignored. */
  revoke(refreshToken: string): Promise<void>;
  /** Logs every session of a user out, e.g. after a password change. */
  revokeAllForUser(userId: string): Promise<void>;
}

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function secretMatches(storedHash: string, secret: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashSecret(secret), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function splitToken(refreshToken: string): { id: string; secret: string } | undefined {
  const parts = refreshToken.split(TOKEN_SEPARATOR);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  return { id: parts[0], secret: parts[1] };
}

function invalidRefreshToken(): HttpError {
  return new HttpError(401, 'Invalid refresh token');
}

export function createRefreshTokenStore(
  RefreshToken: ModelStatic<Model>,
  lifetimeMs: number,
  now: () => Date = () => new Date()
): RefreshTokenStore {
  async function createToken(userId: string, familyId: string): Promise<string> {
    const id = generateId(REFRESH_TOKEN_ID_PREFIX);
    const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url');
    await RefreshToken.create({
      id,
      userId,
      familyId,
      secretHash: hashSecret(secret),
      expiresAt: new Date(now().getTime() + lifetimeMs),
    });
    return `${id}${TOKEN_SEPARATOR}${secret}`;
  }

  async function findToken(refreshToken: string): Promise<Model | undefined> {
    const parts = splitToken(refreshToken);
    if (!parts) return undefined;
    const row = await RefreshToken.findByPk(parts.id);
    if (!row || !secretMatches(String(row.get('secretHash')), parts.secret)) return undefined;
    return row;
  }

  async function revokeFamily(familyId: unknown): Promise<void> {
    await RefreshToken.update({ revokedAt: now() }, { where: { familyId, revokedAt: null } });
  }

  return {
    issue: (userId) => createToken(userId, generateId(TOKEN_FAMILY_ID_PREFIX)),

    async rotate(refreshToken) {
      const row = await findToken(refreshToken);
      if (!row) throw invalidRefreshToken();
      if (row.get('revokedAt')) {
        await revokeFamily(row.get('familyId'));
        throw invalidRefreshToken();
      }
      if ((row.get('expiresAt') as Date) <= now()) throw invalidRefreshToken();

      // Conditional update: of two concurrent rotations of one token, exactly one wins.
      const [revokedCount] = await RefreshToken.update(
        { revokedAt: now() },
        { where: { id: row.get('id'), revokedAt: null } }
      );
      if (revokedCount === 0) {
        await revokeFamily(row.get('familyId'));
        throw invalidRefreshToken();
      }

      const userId = String(row.get('userId'));
      return {
        userId,
        refreshToken: await createToken(userId, String(row.get('familyId'))),
      };
    },

    async revoke(refreshToken) {
      const row = await findToken(refreshToken);
      if (row && !row.get('revokedAt')) await row.update({ revokedAt: now() });
    },

    async revokeAllForUser(userId) {
      await RefreshToken.update({ revokedAt: now() }, { where: { userId, revokedAt: null } });
    },
  };
}
