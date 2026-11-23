import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { LlmClient } from '../src/ai/llm.js';
import { encodeSession } from '../src/middleware/session.js';
import { NOW, testApp } from './helpers.js';

const cookie = (userId: string) =>
  `lablink_session=${encodeSession(userId, 'test-secret-test-secret')}`;
const STUDENT = cookie('stu-aarav');
const FACULTY = cookie('fac-rao');

describe('security & session', () => {
  it('serves health and sets security headers', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('requires a session for protected routes and rejects forged cookies', async () => {
    const { app } = testApp();
    expect((await request(app).get('/api/equipment')).status).toBe(401);
    const forged = await request(app)
      .get('/api/equipment')
      .set('Cookie', 'lablink_session=fac-rao.forged');
    expect(forged.status).toBe(401);
  });

  it('signs in a demo user with an HttpOnly, SameSite cookie', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/session').send({ userId: 'stu-diya' });
    expect(res.status).toBe(200);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
  });

  it('enforces faculty-only routes', async () => {
    const { app } = testApp();
    expect(
      (await request(app).get('/api/allocations/conflicts').set('Cookie', STUDENT)).status,
    ).toBe(403);
    expect((await request(app).get('/api/stats/utilisation').set('Cookie', STUDENT)).status).toBe(
      403,
    );
  });

  it('rejects invalid input with field-level errors', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', STUDENT)
      .send({ equipmentId: 'laser-1', date: 'tomorrow', startHour: 16, hours: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['date']),
    );
  });

  it('rejects oversized payloads', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/ai/search')
      .set('Cookie', STUDENT)
      .send({ query: 'x'.repeat(30_000) });
    expect(res.status).toBe(413);
  });
});

describe('discovery & booking', () => {
  it('lists and filters the catalogue', async () => {
    const { app } = testApp();
    const res = await request(app)
      .get('/api/equipment?category=Oscilloscope')
      .set('Cookie', STUDENT);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0]).toHaveProperty('labName');
  });

  it('falls back to keyword search when AI is disabled', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/ai/search')
      .set('Cookie', STUDENT)
      .send({ query: 'measure signal noise on my sensor' });
    expect(res.body.source).toBe('keyword');
    expect(res.body.matches[0].equipment.category).toBe('Oscilloscope');
  });

  it('uses AI results but drops ids that are not in the catalogue', async () => {
    const llm: LlmClient = {
      generateJson: vi.fn().mockResolvedValue({
        matches: [
          { equipmentId: 'logic-1', reason: 'Decodes I2C traffic' },
          { equipmentId: 'made-up-device', reason: 'hallucinated' },
        ],
      }),
    };
    const { app } = testApp(llm);
    const res = await request(app)
      .post('/api/ai/search')
      .set('Cookie', STUDENT)
      .send({ query: 'debug my i2c sensor bus' });
    expect(res.body.source).toBe('ai');
    expect(res.body.matches.map((m: { equipment: { id: string } }) => m.equipment.id)).toEqual([
      'logic-1',
    ]);
  });

  it('books a slot and returns 409 with alternatives on conflict', async () => {
    const { app } = testApp();
    const ok = await request(app)
      .post('/api/bookings')
      .set('Cookie', STUDENT)
      .send({ equipmentId: 'laser-1', date: NOW.date, startHour: 10, hours: 2 });
    expect(ok.status).toBe(201);
    const clash = await request(app)
      .post('/api/bookings')
      .set('Cookie', cookie('stu-meera'))
      .send({ equipmentId: 'laser-1', date: NOW.date, startHour: 11, hours: 1 });
    expect(clash.status).toBe(409);
    expect(clash.body.alternatives.sameEquipment.length).toBeGreaterThan(0);
  });

  it('returns an availability grid', async () => {
    const { app } = testApp();
    const res = await request(app)
      .get('/api/equipment/printer-mech-1/availability?days=2')
      .set('Cookie', STUDENT);
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(2);
    expect(res.body.days[0].hours.find((h: { hour: number }) => h.hour === 9).booked).toBe(true);
  });
});

describe('requests, approvals and conflict resolution', () => {
  it('lets students submit and only see their own requests', async () => {
    const { app } = testApp();
    const created = await request(app).post('/api/requests').set('Cookie', STUDENT).send({
      projectTitle: 'Rover chassis',
      description: 'Cut acrylic panels for a rover',
      deadline: '2026-11-28',
      hoursNeeded: 3,
      equipmentId: 'laser-1',
    });
    expect(created.status).toBe(201);
    const mine = await request(app).get('/api/requests').set('Cookie', STUDENT);
    expect(
      mine.body.requests.every((r: { studentId: string }) => r.studentId === 'stu-aarav'),
    ).toBe(true);
    const all = await request(app).get('/api/requests').set('Cookie', FACULTY);
    expect(all.body.requests.length).toBeGreaterThan(mine.body.requests.length);
  });

  it('gives faculty a summary with deterministic risk flags', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/requests/req-4/summary').set('Cookie', FACULTY);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('template');
    expect(res.body.risks.join(' ')).toMatch(/Large time request/);
  });

  it('approving a request schedules it without overlaps', async () => {
    const { app, store } = testApp();
    const res = await request(app)
      .post('/api/requests/req-1/decision')
      .set('Cookie', FACULTY)
      .send({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(['approved', 'partial']).toContain(res.body.request.status);
    const created = store.allBookings().filter((b) => b.requestId === 'req-1');
    expect(created.length).toBeGreaterThan(0);
    const again = await request(app)
      .post('/api/requests/req-1/decision')
      .set('Cookie', FACULTY)
      .send({ decision: 'approve' });
    expect(again.status).toBe(409);
  });

  it('rejecting requires a reason and raises the student fairness counter', async () => {
    const { app, store } = testApp();
    const noReason = await request(app)
      .post('/api/requests/req-3/decision')
      .set('Cookie', FACULTY)
      .send({ decision: 'reject' });
    expect(noReason.status).toBe(400);
    const before = store.users.get('stu-kabir')!.recentDenials;
    const res = await request(app)
      .post('/api/requests/req-3/decision')
      .set('Cookie', FACULTY)
      .send({ decision: 'reject', note: 'Use the maker studio printer next week' });
    expect(res.body.request.status).toBe('rejected');
    expect(store.users.get('stu-kabir')!.recentDenials).toBe(before + 1);
  });

  it('detects conflicts, previews a fair plan, then applies it', async () => {
    const { app, store } = testApp();
    const conflicts = await request(app).get('/api/allocations/conflicts').set('Cookie', FACULTY);
    const printers = conflicts.body.conflicts.find(
      (c: { equivalentGroup: string }) => c.equivalentGroup === 'fdm-printer',
    );
    expect(printers.requestIds).toEqual(expect.arrayContaining(['req-1', 'req-2', 'req-3']));

    const before = store.allBookings().length;
    const preview = await request(app)
      .post('/api/allocations/resolve')
      .set('Cookie', FACULTY)
      .send({ requestIds: printers.requestIds });
    expect(preview.status).toBe(200);
    expect(store.allBookings().length).toBe(before); // preview commits nothing
    const plan = preview.body.plan;
    expect(plan.results[0].requestId).toBe('req-1'); // most urgent deadline first
    expect(plan.results.every((r: { explanation: string }) => r.explanation.length > 0)).toBe(true);

    const applied = await request(app)
      .post('/api/allocations/apply')
      .set('Cookie', FACULTY)
      .send({ requestIds: printers.requestIds });
    expect(applied.status).toBe(200);
    expect(store.allBookings().length).toBeGreaterThan(before);
    const keys = new Set<string>();
    for (const b of store.allBookings()) {
      for (let h = b.startHour; h < b.endHour; h++) {
        const k = `${b.equipmentId}|${b.date}|${h}`;
        expect(keys.has(k)).toBe(false);
        keys.add(k);
      }
    }
  });

  it('serves the utilisation dashboard to faculty', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/stats/utilisation').set('Cookie', FACULTY);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.byDepartment).toHaveLength(5);
  });
});
