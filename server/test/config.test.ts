import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { decodeSession, encodeSession, readCookie } from '../src/middleware/session.js';

describe('loadConfig', () => {
  it('applies safe defaults and treats a blank API key as AI disabled', () => {
    const cfg = loadConfig({ GEMINI_API_KEY: '  ' });
    expect(cfg.port).toBe(8080);
    expect(cfg.geminiApiKey).toBeUndefined();
    expect(cfg.geminiModel).toBe('auto');
    expect(cfg.isProduction).toBe(false);
    expect(cfg.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('reads production settings', () => {
    const cfg = loadConfig({
      NODE_ENV: 'production',
      PORT: '10000',
      SESSION_SECRET: 'a-very-long-session-secret',
      CAMPUS_UTC_OFFSET_MINUTES: '0',
    });
    expect(cfg).toMatchObject({ isProduction: true, port: 10000, campusOffsetMinutes: 0 });
    expect(cfg.sessionSecret).toBe('a-very-long-session-secret');
  });

  it('rejects invalid configuration without echoing values', () => {
    expect(() => loadConfig({ PORT: 'abc', SESSION_SECRET: 'short' })).toThrow(
      /PORT, SESSION_SECRET/,
    );
  });
});

describe('session tokens', () => {
  it('round-trips and rejects tampering', () => {
    const token = encodeSession('stu-a', 'secret-secret-secret');
    expect(decodeSession(token, 'secret-secret-secret')).toBe('stu-a');
    expect(decodeSession(token, 'other-secret-secret')).toBeNull();
    expect(decodeSession(token.replace('stu-a', 'fac-b'), 'secret-secret-secret')).toBeNull();
    expect(decodeSession(undefined, 'secret-secret-secret')).toBeNull();
  });

  it('parses cookies from a header', () => {
    expect(readCookie('a=1; lablink_session=x.y; b=2', 'lablink_session')).toBe('x.y');
    expect(readCookie(undefined, 'a')).toBeUndefined();
  });
});
