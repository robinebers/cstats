import type { AuthSource, CursorAuthState } from './types.js';
export declare function loadCursorAuthState(): CursorAuthState;
export declare function decodeJwtPayload(token: string): Record<string, unknown> | null;
export declare function getTokenExpiration(accessToken: string): number | null;
export declare function needsRefresh(accessToken: string | null, nowMs?: number): boolean;
export declare function refreshAccessToken(refreshToken: string | null, source: AuthSource): Promise<string | null>;
export declare function resolveCursorAccessToken(): Promise<string>;
export declare function buildSessionToken(accessToken: string): {
    userId: string;
    sessionToken: string;
};
