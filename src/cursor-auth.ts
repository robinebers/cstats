import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import type { AuthSource, CursorAuthState } from './types.js';

const ACCESS_TOKEN_KEY = 'cursorAuth/accessToken';
const REFRESH_TOKEN_KEY = 'cursorAuth/refreshToken';
const KEYCHAIN_ACCESS_TOKEN_SERVICE = 'cursor-access-token';
const KEYCHAIN_REFRESH_TOKEN_SERVICE = 'cursor-refresh-token';
const REFRESH_URL = 'https://api2.cursor.sh/oauth/token';
const CLIENT_ID = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const LOGIN_HINT = 'Sign in via Cursor or re-run Cursor login.';
const SQLITE_COMMAND = 'sqlite3';

type CursorPlatform = 'darwin' | 'linux' | 'win32';

type AuthRuntime = {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  sqliteCommand: string;
  execFileSyncImpl: typeof execFileSync;
  fileExists: typeof existsSync;
};

type AuthLoadResult = {
  authState: CursorAuthState;
  sqliteDbPath: string;
  error: Error | null;
};

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function createEmptyAuthState(): CursorAuthState {
  return {
    accessToken: null,
    refreshToken: null,
    source: null,
  };
}

function createMissingSqliteError(dbPath: string, command: string): Error {
  return new Error(
    `sqlite3 is required to read Cursor tokens from "${dbPath}". Install ${command} and try again.`,
  );
}

function createMissingCursorStateDbError(dbPath: string): Error {
  return new Error(
    `Cursor state database not found at "${dbPath}". Make sure Cursor is installed and signed in.`,
  );
}

function createMissingCursorLoginError(dbPath: string | null): Error {
  if (dbPath === null) {
    return new Error(`Cursor login state could not be found locally. ${LOGIN_HINT}`);
  }

  return new Error(
    `Cursor login state could not be found locally in "${dbPath}". ${LOGIN_HINT}`,
  );
}

function normalizePlatform(platform: NodeJS.Platform): CursorPlatform {
  if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
    return platform;
  }

  throw new Error(
    `Cursor auth is not supported on platform "${platform}". Expected one of darwin, win32, or linux.`,
  );
}

function getRuntime(): AuthRuntime {
  return {
    platform: process.platform,
    env: process.env,
    homeDir: homedir(),
    sqliteCommand: SQLITE_COMMAND,
    execFileSyncImpl: execFileSync,
    fileExists: existsSync,
  };
}

function isCommandMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string };
  if (errorWithCode.code === 'ENOENT') {
    return true;
  }

  return /not recognized|not found/i.test(error.message);
}

export function resolveCursorStateDbPath(
  platform = process.platform,
  env = process.env,
  homeDir = homedir(),
): string {
  switch (normalizePlatform(platform)) {
    case 'darwin':
      return path.posix.join(
        homeDir,
        'Library',
        'Application Support',
        'Cursor',
        'User',
        'globalStorage',
        'state.vscdb',
      );
    case 'linux':
      return path.posix.join(
        homeDir,
        '.config',
        'Cursor',
        'User',
        'globalStorage',
        'state.vscdb',
      );
    case 'win32': {
      const appData = env.APPDATA ?? path.win32.join(homeDir, 'AppData', 'Roaming');
      return path.win32.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    }
  }
}

function readSqliteValue(
  dbPath: string,
  key: string,
  runtime: AuthRuntime,
): string | null {
  try {
    const sql = `SELECT value FROM ItemTable WHERE key = '${escapeSqlString(key)}' LIMIT 1;`;
    const stdout = runtime.execFileSyncImpl(
      runtime.sqliteCommand,
      ['-readonly', '-json', dbPath, sql],
      {
        encoding: 'utf8',
      },
    );
    if (stdout.trim() === '') {
      return null;
    }
    const parsed = JSON.parse(stdout) as Array<{ value?: string }>;
    const value = parsed[0]?.value?.trim();
    return value ? value : null;
  } catch (error) {
    if (isCommandMissingError(error)) {
      throw createMissingSqliteError(dbPath, runtime.sqliteCommand);
    }

    throw error;
  }
}

function writeSqliteValue(
  dbPath: string,
  key: string,
  value: string,
  runtime: AuthRuntime,
): boolean {
  try {
    const sql = `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('${escapeSqlString(
      key,
    )}', '${escapeSqlString(value)}');`;
    runtime.execFileSyncImpl(runtime.sqliteCommand, [dbPath, sql], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function readKeychainValue(service: string, runtime: AuthRuntime): string | null {
  try {
    const stdout = runtime.execFileSyncImpl(
      'security',
      ['find-generic-password', '-s', service, '-w'],
      {
        encoding: 'utf8',
      },
    );
    const value = stdout.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

function writeKeychainValue(service: string, value: string, runtime: AuthRuntime): boolean {
  try {
    runtime.execFileSyncImpl('security', ['add-generic-password', '-s', service, '-w', value, '-U'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function loadMacKeychainAuthState(runtime: AuthRuntime): CursorAuthState {
  const accessToken = readKeychainValue(KEYCHAIN_ACCESS_TOKEN_SERVICE, runtime);
  const refreshToken = readKeychainValue(KEYCHAIN_REFRESH_TOKEN_SERVICE, runtime);

  if (accessToken || refreshToken) {
    return {
      accessToken,
      refreshToken,
      source: 'keychain',
    };
  }

  return createEmptyAuthState();
}

function loadSqliteCursorAuthStateFromDb(dbPath: string, runtime: AuthRuntime): CursorAuthState {
  if (!runtime.fileExists(dbPath)) {
    throw createMissingCursorStateDbError(dbPath);
  }

  const accessToken = readSqliteValue(dbPath, ACCESS_TOKEN_KEY, runtime);
  const refreshToken = readSqliteValue(dbPath, REFRESH_TOKEN_KEY, runtime);

  if (accessToken || refreshToken) {
    return {
      accessToken,
      refreshToken,
      source: 'sqlite',
    };
  }

  return createEmptyAuthState();
}

export function loadSqliteCursorAuthState(dbPath: string): CursorAuthState {
  return loadSqliteCursorAuthStateFromDb(dbPath, getRuntime());
}

// Best-effort loader for the CLI: prefer SQLite, keep the error so token resolution can
// surface it when no usable fallback exists.
function loadCursorAuthStateResult(runtime: AuthRuntime): AuthLoadResult {
  const sqliteDbPath = resolveCursorStateDbPath(runtime.platform, runtime.env, runtime.homeDir);
  let error: Error | null = null;

  try {
    const authState = loadSqliteCursorAuthStateFromDb(sqliteDbPath, runtime);
    if (authState.accessToken || authState.refreshToken) {
      return {
        authState,
        sqliteDbPath,
        error: null,
      };
    }
  } catch (loadError) {
    error = loadError instanceof Error ? loadError : new Error(String(loadError));
  }

  if (runtime.platform === 'darwin') {
    const keychainAuthState = loadMacKeychainAuthState(runtime);
    if (keychainAuthState.accessToken || keychainAuthState.refreshToken) {
      return {
        authState: keychainAuthState,
        sqliteDbPath,
        error,
      };
    }
  }

  return {
    authState: createEmptyAuthState(),
    sqliteDbPath,
    error,
  };
}

export function loadCursorAuthState(): CursorAuthState {
  return loadCursorAuthStateResult(getRuntime()).authState;
}

function persistAccessToken(
  source: AuthSource,
  accessToken: string,
  sqliteDbPath: string | null,
  runtime: AuthRuntime,
): void {
  if (source === 'keychain') {
    writeKeychainValue(KEYCHAIN_ACCESS_TOKEN_SERVICE, accessToken, runtime);
    return;
  }

  if (source === 'sqlite' && sqliteDbPath !== null) {
    writeSqliteValue(sqliteDbPath, ACCESS_TOKEN_KEY, accessToken, runtime);
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (payloadPart === undefined) {
    return null;
  }

  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const paddingLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized.padEnd(normalized.length + paddingLength, '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getTokenExpiration(accessToken: string): number | null {
  const payload = decodeJwtPayload(accessToken);
  const expiration = payload?.exp;
  return typeof expiration === 'number' ? expiration * 1000 : null;
}

export function needsRefresh(accessToken: string | null, nowMs = Date.now()): boolean {
  if (accessToken === null) {
    return true;
  }

  const expiresAt = getTokenExpiration(accessToken);
  if (expiresAt === null) {
    return true;
  }

  return expiresAt <= nowMs + REFRESH_BUFFER_MS;
}

export async function refreshAccessToken(
  refreshToken: string | null,
  source: AuthSource,
  sqliteDbPath: string | null = null,
): Promise<string | null> {
  return refreshAccessTokenWithRuntime(refreshToken, source, sqliteDbPath, getRuntime());
}

async function refreshAccessTokenWithRuntime(
  refreshToken: string | null,
  source: AuthSource,
  sqliteDbPath: string | null,
  runtime: AuthRuntime,
): Promise<string | null> {
  if (refreshToken === null) {
    return null;
  }

  const response = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (response.status === 400 || response.status === 401) {
    if (body?.shouldLogout === true) {
      throw new Error(`Session expired. ${LOGIN_HINT}`);
    }

    throw new Error(`Token refresh failed. ${LOGIN_HINT}`);
  }

  if (!response.ok) {
    return null;
  }

  if (body?.shouldLogout === true) {
    throw new Error(`Session expired. ${LOGIN_HINT}`);
  }

  const accessToken = typeof body?.access_token === 'string' ? body.access_token : null;
  if (accessToken === null || accessToken.trim() === '') {
    return null;
  }

  persistAccessToken(source, accessToken, sqliteDbPath, runtime);
  return accessToken;
}

export async function resolveCursorAccessToken(): Promise<string> {
  return resolveCursorAccessTokenWithRuntime(getRuntime());
}

async function resolveCursorAccessTokenWithRuntime(runtime: AuthRuntime): Promise<string> {
  const { authState, sqliteDbPath, error } = loadCursorAuthStateResult(runtime);
  let accessToken = authState.accessToken;

  if (accessToken === null && authState.refreshToken === null) {
    if (error !== null) {
      throw error;
    }

    throw createMissingCursorLoginError(sqliteDbPath);
  }

  if (needsRefresh(accessToken)) {
    try {
      const refreshed = await refreshAccessToken(
        authState.refreshToken,
        authState.source,
        sqliteDbPath,
      );
      if (refreshed !== null) {
        accessToken = refreshed;
      }
    } catch (error) {
      if (accessToken === null) {
        throw error;
      }
    }
  }

  if (accessToken === null) {
    throw new Error(`No usable Cursor access token found. ${LOGIN_HINT}`);
  }

  return accessToken;
}

export function buildSessionToken(accessToken: string): { userId: string; sessionToken: string } {
  const payload = decodeJwtPayload(accessToken);
  const subject = payload?.sub;

  if (typeof subject !== 'string' || subject.trim() === '') {
    throw new Error('Cursor access token is missing a JWT subject.');
  }

  const parts = subject.split('|');
  const userId = parts.length > 1 ? parts[1] : parts[0];
  if (userId === undefined || userId.trim() === '') {
    throw new Error('Cursor access token did not produce a valid user id.');
  }

  return {
    userId,
    sessionToken: `${userId}%3A%3A${accessToken}`,
  };
}
