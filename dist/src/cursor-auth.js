import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
const CURSOR_STATE_DB = '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb';
const ACCESS_TOKEN_KEY = 'cursorAuth/accessToken';
const REFRESH_TOKEN_KEY = 'cursorAuth/refreshToken';
const KEYCHAIN_ACCESS_TOKEN_SERVICE = 'cursor-access-token';
const KEYCHAIN_REFRESH_TOKEN_SERVICE = 'cursor-refresh-token';
const REFRESH_URL = 'https://api2.cursor.sh/oauth/token';
const CLIENT_ID = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const LOGIN_HINT = 'Sign in via Cursor or re-run Cursor login.';
function expandHomePath(value) {
    if (value === '~') {
        return homedir();
    }
    if (value.startsWith('~/')) {
        return `${homedir()}/${value.slice(2)}`;
    }
    return value;
}
function escapeSqlString(value) {
    return value.replace(/'/g, "''");
}
function readSqliteValue(key) {
    try {
        const sql = `SELECT value FROM ItemTable WHERE key = '${escapeSqlString(key)}' LIMIT 1;`;
        const stdout = execFileSync('sqlite3', ['-readonly', '-json', expandHomePath(CURSOR_STATE_DB), sql], {
            encoding: 'utf8',
        });
        const parsed = JSON.parse(stdout);
        const value = parsed[0]?.value?.trim();
        return value ? value : null;
    }
    catch {
        return null;
    }
}
function writeSqliteValue(key, value) {
    try {
        const sql = `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('${escapeSqlString(key)}', '${escapeSqlString(value)}');`;
        execFileSync('sqlite3', [expandHomePath(CURSOR_STATE_DB), sql], {
            encoding: 'utf8',
            stdio: 'pipe',
        });
        return true;
    }
    catch {
        return false;
    }
}
function readKeychainValue(service) {
    try {
        const stdout = execFileSync('security', ['find-generic-password', '-s', service, '-w'], {
            encoding: 'utf8',
        });
        const value = stdout.trim();
        return value ? value : null;
    }
    catch {
        return null;
    }
}
function writeKeychainValue(service, value) {
    try {
        execFileSync('security', ['add-generic-password', '-s', service, '-w', value, '-U'], {
            encoding: 'utf8',
            stdio: 'pipe',
        });
        return true;
    }
    catch {
        return false;
    }
}
export function loadCursorAuthState() {
    const sqliteAccessToken = readSqliteValue(ACCESS_TOKEN_KEY);
    const sqliteRefreshToken = readSqliteValue(REFRESH_TOKEN_KEY);
    if (sqliteAccessToken || sqliteRefreshToken) {
        return {
            accessToken: sqliteAccessToken,
            refreshToken: sqliteRefreshToken,
            source: 'sqlite',
        };
    }
    const keychainAccessToken = readKeychainValue(KEYCHAIN_ACCESS_TOKEN_SERVICE);
    const keychainRefreshToken = readKeychainValue(KEYCHAIN_REFRESH_TOKEN_SERVICE);
    if (keychainAccessToken || keychainRefreshToken) {
        return {
            accessToken: keychainAccessToken,
            refreshToken: keychainRefreshToken,
            source: 'keychain',
        };
    }
    return {
        accessToken: null,
        refreshToken: null,
        source: null,
    };
}
function persistAccessToken(source, accessToken) {
    if (source === 'keychain') {
        writeKeychainValue(KEYCHAIN_ACCESS_TOKEN_SERVICE, accessToken);
        return;
    }
    if (source === 'sqlite') {
        writeSqliteValue(ACCESS_TOKEN_KEY, accessToken);
    }
}
export function decodeJwtPayload(token) {
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
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
export function getTokenExpiration(accessToken) {
    const payload = decodeJwtPayload(accessToken);
    const expiration = payload?.exp;
    return typeof expiration === 'number' ? expiration * 1000 : null;
}
export function needsRefresh(accessToken, nowMs = Date.now()) {
    if (accessToken === null) {
        return true;
    }
    const expiresAt = getTokenExpiration(accessToken);
    if (expiresAt === null) {
        return true;
    }
    return expiresAt <= nowMs + REFRESH_BUFFER_MS;
}
export async function refreshAccessToken(refreshToken, source) {
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
    let body = null;
    try {
        body = (await response.json());
    }
    catch {
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
    persistAccessToken(source, accessToken);
    return accessToken;
}
export async function resolveCursorAccessToken() {
    const authState = loadCursorAuthState();
    let accessToken = authState.accessToken;
    if (accessToken === null && authState.refreshToken === null) {
        throw new Error(`No Cursor auth found. ${LOGIN_HINT}`);
    }
    if (needsRefresh(accessToken)) {
        try {
            const refreshed = await refreshAccessToken(authState.refreshToken, authState.source);
            if (refreshed !== null) {
                accessToken = refreshed;
            }
        }
        catch (error) {
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
export function buildSessionToken(accessToken) {
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
//# sourceMappingURL=cursor-auth.js.map