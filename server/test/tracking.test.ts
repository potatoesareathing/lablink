import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed.js';
import { Store } from '../src/data/store.js';
import { encodeSession } from '../src/middleware/session.js';
import { notificationsFor } from '../src/services/notifications.js';
import {
  checkOut,
  deskView,
  fineFor,
  isOverdue,
  overdueHours,
  payFine,
  returnItem,
} from '../src/services/tracking.js';
import { NOW, booking, testApp } from './helpers.js';

const cookie = (id: string) => `lablink_session=${encodeSession(id, 'test-secret-test-secret')}`;
const fresh = () => new Store(createSeed(NOW.date));

describe('tracking rules', () => {
  it('detects overdue items and computes capped fines', () => {
    const out = { ...booking('p1', 'a', '2026-11-22', 14, 16), status: 'checked_out' as const };
    expect(isOverdue(out, NOW)).toBe(true);
    expect(overdueHours(out, NOW)).toBe(17); // 16:00 Sunday -> 08:00 Monday, started hours
    expect(fineFor(2)).toBe(100);
    expect(fineFor(17)).toBe(500);
    expect(isOverdue({ ...out, status: 'returned' }, NOW)).toBe(false);
    expect(isOverdue({ ...out, date: NOW.date, endHour: 17 }, NOW)).toBe(false);
  });

  it('checks out, returns late with a fine and a fairness strike, then settles the fine', () => {
    const store = fresh();
    const strikesBefore = store.users.get('stu-rohan')!.overdueStrikes ?? 0;
    const returned = returnItem(store, 'bk-14', NOW); // seeded overdue soldering station
    expect(returned.status).toBe('returned');
    expect(returned.fine).toMatchObject({ paid: false });
    expect(returned.fine!.amount).toBeGreaterThan(0);
    expect(store.users.get('stu-rohan')!.overdueStrikes).toBe(strikesBefore + 1);

    const rohan = store.users.get('stu-rohan')!;
    expect(payFine(store, rohan, 'bk-14').fine!.paid).toBe(true);
    expect(() => payFine(store, rohan, 'bk-14')).toThrow(/no unpaid fine/);
  });

  it('enforces the lifecycle and ownership', () => {
    const store = fresh();
    expect(() => returnItem(store, 'bk-1', NOW)).toThrow(/checked-out/);
    expect(checkOut(store, 'bk-1', NOW).status).toBe('checked_out');
    expect(() => checkOut(store, 'bk-1', NOW)).toThrow(/already/);
    expect(() => checkOut(store, 'bk-3', NOW)).toThrow(/booking day/); // tomorrow
    expect(() => payFine(store, store.users.get('stu-kabir')!, 'bk-15')).toThrow(/access/);
    expect(() => checkOut(store, 'nope', NOW)).toThrow(/not found/);
  });

  it('builds the faculty desk with overdue items first', () => {
    const desk = deskView(fresh(), NOW);
    expect(desk.out[0]!.overdue).toBe(true);
    expect(desk.overdueCount).toBeGreaterThanOrEqual(1);
    expect(desk.unpaidFines).toBe(150);
    expect(desk.toCollect.every((b) => b.date === NOW.date)).toBe(true);
  });
});

describe('notifications', () => {
  it('tells students about fines and decisions, and faculty about queues and overdue items', () => {
    const store = fresh();
    store.requests.get('req-1')!.status = 'approved';
    const student = notificationsFor(store, store.users.get('stu-aarav')!, NOW);
    expect(student.map((n) => n.title).join(' | ')).toMatch(/Unpaid fine: ₹150/);
    expect(student.some((n) => /approved/.test(n.title))).toBe(true);

    const faculty = notificationsFor(store, store.users.get('fac-rao')!, NOW);
    expect(faculty.some((n) => /waiting for approval/.test(n.title))).toBe(true);
    expect(faculty.some((n) => /overdue/.test(n.title))).toBe(true);
  });
});

describe('tracking API', () => {
  it('restricts the desk to faculty and supports check-out, return and fine payment', async () => {
    const { app } = testApp();
    expect(
      (await request(app).get('/api/tracking/desk').set('Cookie', cookie('stu-aarav'))).status,
    ).toBe(403);
    const desk = await request(app).get('/api/tracking/desk').set('Cookie', cookie('fac-rao'));
    expect(desk.status).toBe(200);

    const ret = await request(app)
      .post('/api/tracking/bk-14/return')
      .set('Cookie', cookie('fac-rao'));
    expect(ret.body.booking.fine.amount).toBeGreaterThan(0);

    const steal = await request(app)
      .post('/api/tracking/bk-15/pay-fine')
      .set('Cookie', cookie('stu-kabir'));
    expect(steal.status).toBe(403);
    const pay = await request(app)
      .post('/api/tracking/bk-15/pay-fine')
      .set('Cookie', cookie('stu-aarav'));
    expect(pay.body.booking.fine.paid).toBe(true);

    const mine = await request(app).get('/api/bookings/mine').set('Cookie', cookie('stu-rohan'));
    expect(mine.body.bookings.some((b: { fine?: unknown }) => b.fine)).toBe(true);

    const notes = await request(app).get('/api/notifications').set('Cookie', cookie('stu-aarav'));
    expect(Array.isArray(notes.body.notifications)).toBe(true);
  });
});
