import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('auth domain enforcement', () => {
  it('allows emails on configured domains', async () => {
    const res = await SELF.fetch('http://localhost/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.test' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { device_code?: string };
    expect(body.device_code).toBeTruthy();
  });

  it('rejects emails on unlisted domains', async () => {
    const res = await SELF.fetch('http://localhost/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@blocked.com' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('Email domain not permitted');
  });

  it('uses ALLOWED_EMAIL_DOMAINS binding from vitest config', () => {
    expect(env.ALLOWED_EMAIL_DOMAINS).toContain('example.test');
  });

  it('GET /auth/config returns configured domains', async () => {
    const res = await SELF.fetch('http://localhost/auth/config');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { allowed_email_domains: string[] };
    expect(body.allowed_email_domains).toContain('example.test');
  });
});
