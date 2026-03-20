import { describe, expect, it } from 'vitest';
import { buildSessionToken, decodeJwtPayload, getTokenExpiration, needsRefresh } from '../src/cursor-auth.js';
function encodeBase64Url(value) {
    return Buffer.from(value, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
function makeJwt(payload) {
    return [
        encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
        encodeBase64Url(JSON.stringify(payload)),
        'signature',
    ].join('.');
}
describe('cursor auth helpers', () => {
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
//# sourceMappingURL=auth.test.js.map