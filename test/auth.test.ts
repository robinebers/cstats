import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

import {
  buildSessionToken,
  decodeJwtPayload,
  getTokenExpiration,
  loadCursorAuthState,
  loadSqliteCursorAuthState,
  needsRefresh,
  resolveCursorAccessToken,
  resolveCursorStateDbPath,
} from '../src/cursor-auth.js';

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeJwt(payload: Record<string, unknown>): string {
  return [
    encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    encodeBase64Url(JSON.stringify(payload)),
    'signature',
  ].join('.');
}

const execFileSyncMock = vi.mocked(execFileSync);
const existsSyncMock = vi.mocked(existsSync);

afterEach(() => {
  vi.clearAllMocks();
});

describe('cursor auth helpers', () => {
  it('resolves Cursor state DB paths for supported platforms', () => {
    expect(resolveCursorStateDbPath('darwin', {}, '/Users/example')).toBe(
      '/Users/example/Library/Application Support/Cursor/User/globalStorage/state.vscdb',
    );
    expect(resolveCursorStateDbPath('linux', {}, '/home/example')).toBe(
      '/home/example/.config/Cursor/User/globalStorage/state.vscdb',
    );
    expect(
      resolveCursorStateDbPath('win32', { APPDATA: 'C:\\Users\\example\\AppData\\Roaming' }, 'C:\\Users\\example'),
    ).toBe('C:\\Users\\example\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb');
  });

  it('loads Cursor auth tokens from a SQLite state DB', () => {
    existsSyncMock.mockReturnValue(true);
    execFileSyncMock.mockImplementation(((command, args) => {
      expect(command).toBe('sqlite3');
      const sqlArgs = Array.isArray(args) ? args : [];
      const sql = String(sqlArgs[3] ?? '');

      if (sql.includes('cursorAuth/accessToken')) {
        return JSON.stringify([{ value: 'access-token' }]);
      }

      if (sql.includes('cursorAuth/refreshToken')) {
        return JSON.stringify([{ value: 'refresh-token' }]);
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }) as typeof execFileSync);

    expect(loadCursorAuthState()).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      source: 'sqlite',
    });
  });

  it('errors when the expected Cursor state DB is missing', () => {
    existsSyncMock.mockReturnValue(false);
    const missingDbPath = 'C:\\missing\\state.vscdb';

    expect(() => loadSqliteCursorAuthState(missingDbPath)).toThrow(
      `Cursor state database not found at "${missingDbPath}". Make sure Cursor is installed and signed in.`,
    );
  });

  it('errors when sqlite3 is unavailable', () => {
    existsSyncMock.mockReturnValue(true);
    execFileSyncMock.mockImplementation(() => {
      const error = new Error('spawn sqlite3 ENOENT') as Error & { code?: string };
      error.code = 'ENOENT';
      throw error;
    });
    const dbPath = 'C:\\cursor\\state.vscdb';

    expect(() => loadSqliteCursorAuthState(dbPath)).toThrow(
      `sqlite3 is required to read Cursor tokens from "${dbPath}". Install sqlite3 and try again.`,
    );
  });

  it('errors when no Cursor token rows exist in the state DB', async () => {
    existsSyncMock.mockReturnValue(true);
    execFileSyncMock.mockImplementation(((command) => {
      if (command === 'security') {
        throw new Error('security unavailable');
      }

      return '[]';
    }) as typeof execFileSync);
    const dbPath = resolveCursorStateDbPath();

    await expect(resolveCursorAccessToken()).rejects.toThrow(
      `Cursor login state could not be found locally in "${dbPath}". Sign in via Cursor or re-run Cursor login.`,
    );
  });

  it('decodes JWT payloads', () => {
    const token = makeJwt({ sub: 'google-oauth2|user_123', exp: 1_900_000_000 });
    expect(decodeJwtPayload(token)).toMatchObject({
      sub: 'google-oauth2|user_123',
      exp: 1_900_000_000,
    });
  });

  it('extracts the user id and session token', () => {
    const token = makeJwt({ sub: 'github|user_abc' });
    expect(buildSessionToken(token)).toEqual({
      userId: 'user_abc',
      sessionToken: `user_abc%3A%3A${token}`,
    });
  });

  it('returns JWT expiration in milliseconds', () => {
    const token = makeJwt({ exp: 1_900_000_000 });
    expect(getTokenExpiration(token)).toBe(1_900_000_000_000);
  });

  it('marks near-expiry tokens for refresh', () => {
    const token = makeJwt({
      exp: Math.floor((Date.now() + 60_000) / 1000),
    });
    expect(needsRefresh(token, Date.now())).toBe(true);
  });
});
