import { describe, expect, it } from 'vitest';
import { allocate, candidateUnits, scoreRequest, weeklyHours } from '../src/services/allocation.js';
import { NOW, booking, req, student, unit } from './helpers.js';

const users = (...list: ReturnType<typeof student>[]) => new Map(list.map((u) => [u.id, u]));

function assertNoOverlaps(results: ReturnType<typeof allocate>, existing: string[] = []) {
  const seen = new Set(existing);
  for (const r of results) {
    for (const s of r.slots) {
      const key = `${s.equipmentId}|${s.date}|${s.hour}`;
      expect(seen.has(key), `double-booked ${key}`).toBe(false);
      seen.add(key);
    }
  }
}

describe('scoreRequest', () => {
  it('gives a closer deadline a higher urgency', () => {
    const soon = scoreRequest(req('a', 's', 'p1', 2, '2026-11-24'), student('s'), 0, 10, NOW);
    const later = scoreRequest(req('b', 's', 'p1', 2, '2026-12-05'), student('s'), 0, 10, NOW);
    expect(soon.urgency).toBeGreaterThan(later.urgency);
    expect(soon.priority).toBeGreaterThan(later.priority);
  });

  it('lowers fairness for heavy weekly usage and raises it after denials', () => {
    const r = req('a', 's', 'p1', 2, '2026-11-30');
    const heavy = scoreRequest(r, student('s'), 10, 10, NOW);
    const light = scoreRequest(r, student('s'), 0, 10, NOW);
    const denied = scoreRequest(r, student('s', 3), 10, 10, NOW);
    expect(heavy.fairness).toBe(0);
    expect(light.fairness).toBe(1);
    expect(denied.fairness).toBeGreaterThan(heavy.fairness);
  });

  it('caps feasibility at 1 and reduces it when capacity is short', () => {
    const r = req('a', 's', 'p1', 10, '2026-11-30');
    expect(scoreRequest(r, student('s'), 0, 50, NOW).feasibility).toBe(1);
    expect(scoreRequest(r, student('s'), 0, 5, NOW).feasibility).toBe(0.5);
  });
});

describe('candidateUnits', () => {
  it('lists the requested unit first, then available equivalents, skipping maintenance', () => {
    const eq = [
      unit('p2', 'printer', 'lab-b'),
      unit('p1', 'printer'),
      unit('p3', 'printer', 'lab-c', 'maintenance'),
      unit('x', 'other'),
    ];
    expect(candidateUnits(req('a', 's', 'p1', 1, '2026-11-24'), eq).map((e) => e.id)).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('falls back to equivalents when the requested unit is under maintenance', () => {
    const eq = [unit('p1', 'printer', 'lab-a', 'maintenance'), unit('p2', 'printer', 'lab-b')];
    expect(candidateUnits(req('a', 's', 'p1', 1, '2026-11-24'), eq).map((e) => e.id)).toEqual([
      'p2',
    ]);
  });
});

describe('allocate', () => {
  it('serves the most urgent request first on the requested unit', () => {
    const results = allocate({
      requests: [
        req('later', 'b', 'p1', 8, '2026-11-27'),
        req('urgent', 'a', 'p1', 8, '2026-11-23'),
      ],
      equipment: [unit('p1', 'printer')],
      bookings: [],
      users: users(student('a'), student('b')),
      now: NOW,
    });
    expect(results[0]!.requestId).toBe('urgent');
    expect(results[0]!.outcome).toBe('allocated');
    expect(results[0]!.slots.every((s) => s.date === '2026-11-23')).toBe(true);
    expect(results[0]!.reasons).toContain('URGENT_DEADLINE');
    expect(results[1]!.slots.every((s) => s.date > '2026-11-23')).toBe(true);
    assertNoOverlaps(results);
  });

  it('moves overflow demand to an equivalent unit in another lab', () => {
    const results = allocate({
      requests: [req('a', 'a', 'p1', 8, '2026-11-23'), req('b', 'b', 'p1', 8, '2026-11-23')],
      equipment: [unit('p1', 'printer'), unit('p2', 'printer', 'lab-b')],
      bookings: [],
      users: users(student('a'), student('b')),
      now: NOW,
    });
    expect(results.every((r) => r.outcome === 'allocated')).toBe(true);
    const moved = results.find((r) => r.reasons.includes('MOVED_TO_EQUIVALENT'));
    expect(moved?.slots.every((s) => s.equipmentId === 'p2')).toBe(true);
    assertNoOverlaps(results);
  });

  it('never schedules after the deadline and reports partial / waitlisted outcomes', () => {
    const results = allocate({
      requests: [
        req('big', 'a', 'p1', 12, '2026-11-23'),
        req('late', 'b', 'p1', 2, '2026-11-23', '2026-11-21T00:00:00Z'),
      ],
      equipment: [unit('p1', 'printer')],
      bookings: [],
      users: users(student('a'), student('b')),
      now: NOW,
    });
    for (const r of results) expect(r.slots.every((s) => s.date <= '2026-11-23')).toBe(true);
    const totals = results.reduce((s, r) => s + r.hoursGranted, 0);
    expect(totals).toBe(8); // only 8 open hours exist on the deadline day
    expect(results.some((r) => r.outcome === 'partial' || r.outcome === 'waitlisted')).toBe(true);
    expect(results.find((r) => r.outcome !== 'allocated')?.reasons).toContain(
      'INSUFFICIENT_CAPACITY',
    );
    assertNoOverlaps(results);
  });

  it('respects existing bookings and never double-books a student', () => {
    const existing = [
      booking('p1', 'z', '2026-11-23', 9, 13),
      booking('p2', 'a', '2026-11-23', 13, 17),
    ];
    const results = allocate({
      requests: [req('a', 'a', 'p1', 4, '2026-11-23')],
      equipment: [unit('p1', 'printer'), unit('p2', 'printer', 'lab-b')],
      bookings: existing,
      users: users(student('a')),
      now: NOW,
    });
    const r = results[0]!;
    // p1 is free 13-17 but the student is busy on p2 then; p2 is free 9-13 -> allocated there.
    expect(r.hoursGranted).toBe(4);
    expect(r.slots.every((s) => s.equipmentId === 'p2' && s.hour < 13)).toBe(true);
    assertNoOverlaps(results, [
      'p1|2026-11-23|9',
      'p1|2026-11-23|10',
      'p1|2026-11-23|11',
      'p1|2026-11-23|12',
    ]);
  });

  it('prefers the student with fewer hours this week when deadlines tie', () => {
    const heavyUse = [
      booking('other', 'heavy', '2026-11-23', 9, 17),
      booking('other', 'heavy', '2026-11-24', 9, 13),
    ];
    const results = allocate({
      requests: [
        req('h', 'heavy', 'p1', 8, '2026-11-25'),
        req('l', 'light', 'p1', 8, '2026-11-25'),
      ],
      equipment: [unit('p1', 'printer'), unit('other', 'misc')],
      bookings: heavyUse,
      users: users(student('heavy'), student('light')),
      now: NOW,
    });
    expect(results[0]!.requestId).toBe('l');
    expect(results.find((r) => r.requestId === 'h')!.reasons).toContain('HEAVY_RECENT_USAGE');
  });

  it('is deterministic for identical input', () => {
    const input = {
      requests: [req('a', 'a', 'p1', 5, '2026-11-25'), req('b', 'b', 'p1', 5, '2026-11-25')],
      equipment: [unit('p1', 'printer')],
      bookings: [],
      users: users(student('a'), student('b')),
      now: NOW,
    };
    expect(allocate(input)).toEqual(allocate(input));
  });
});

describe('weeklyHours', () => {
  it('only counts bookings inside the current Monday-Sunday week', () => {
    const totals = weeklyHours(
      [
        booking('p1', 'a', '2026-11-23', 9, 12),
        booking('p1', 'a', '2026-11-29', 9, 10),
        booking('p1', 'a', '2026-11-30', 9, 17),
      ],
      NOW,
    );
    expect(totals.get('a')).toBe(4);
  });
});
