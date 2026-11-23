import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { Assistant } from '../src/ai/assistant.js';
import type { LlmClient } from '../src/ai/llm.js';
import { createApp } from '../src/app.js';
import { createSeed } from '../src/data/seed.js';
import { Store } from '../src/data/store.js';
import { encodeSession } from '../src/middleware/session.js';
import { NOW, testApp } from './helpers.js';

const cookie = (id: string) => `lablink_session=${encodeSession(id, 'test-secret-test-secret')}`;

describe('session routes', () => {
  it('lists demo personas, reports the current user and signs out', async () => {
    const { app } = testApp();
    const users = await request(app).get('/api/session/users');
    expect(users.body.users.some((u: { role: string }) => u.role === 'faculty')).toBe(true);

    const anon = await request(app).get('/api/session');
    expect(anon.body).toMatchObject({ user: null, aiEnabled: false });
    const me = await request(app).get('/api/session').set('Cookie', cookie('stu-diya'));
    expect(me.body.user.id).toBe('stu-diya');

    const out = await request(app).delete('/api/session').set('Cookie', cookie('stu-diya'));
    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(/lablink_session=;/);
  });

  it('rejects unknown personas', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/session').send({ userId: 'nobody' });
    expect(res.status).toBe(404);
  });
});

describe('request detail and AI drafting routes', () => {
  it('lets owners and faculty read a request but not other students', async () => {
    const { app } = testApp();
    expect(
      (await request(app).get('/api/requests/req-1').set('Cookie', cookie('stu-aarav'))).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/requests/req-1').set('Cookie', cookie('fac-rao'))).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/requests/req-1').set('Cookie', cookie('stu-kabir'))).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/requests/nope').set('Cookie', cookie('fac-rao'))).status,
    ).toBe(404);
  });

  it('drafts a request with the heuristic fallback when AI is off', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/ai/draft-request')
      .set('Cookie', cookie('stu-aarav'))
      .send({ idea: 'laser cut acrylic panels for a robot chassis' });
    expect(res.status).toBe(200);
    expect(res.body.draft).toMatchObject({ source: 'heuristic', equipmentId: 'laser-1' });
  });

  it('explains allocation plans with AI when the model answers for every request', async () => {
    const llm: LlmClient = {
      generateJson: vi.fn(async ({ prompt }: { prompt: string }) => ({
        summary: 'Deadline-first plan.',
        explanations: [...prompt.matchAll(/requestId=([\w-]+)/g)].map((m) => ({
          requestId: m[1],
          text: `Explained ${m[1]}`,
        })),
      })),
    };
    const { app } = testApp(llm);
    const res = await request(app)
      .post('/api/allocations/resolve')
      .set('Cookie', cookie('fac-rao'))
      .send({ requestIds: ['req-1', 'req-2'] });
    expect(res.body.plan.source).toBe('ai');
    expect(res.body.plan.results[0].explanation).toMatch(/^Explained req-/);
  });
});

describe('tracking routes', () => {
  it('lets faculty hand out a scheduled unit', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/tracking/bk-1/checkout')
      .set('Cookie', cookie('fac-rao'));
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('checked_out');
  });
});

describe('app shell', () => {
  it('serves the built client with SPA fallback and long-lived asset caching', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lablink-client-'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>LabLink</title>');
    const app = createApp({
      store: new Store(createSeed(NOW.date)),
      assistant: new Assistant(null),
      clock: () => NOW,
      sessionSecret: 'test-secret-test-secret',
      secureCookies: false,
      clientDir: dir,
    });
    const page = await request(app).get('/campus/map');
    expect(page.status).toBe(200);
    expect(page.text).toContain('LabLink');
    expect(page.headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/api/unknown')).status).toBe(404);
  });

  it('hides internal errors behind a generic 500', async () => {
    const { app, store } = testApp();
    vi.spyOn(store, 'catalog').mockImplementation(() => {
      throw new Error('database exploded');
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).get('/api/equipment').set('Cookie', cookie('stu-aarav'));
    expect(res.status).toBe(500);
    expect(res.body.error.message).not.toMatch(/exploded/);
    expect(errorLog).toHaveBeenCalled();
  });
});
