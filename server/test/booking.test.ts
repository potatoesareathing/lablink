import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/data/seed.js';
import { Store } from '../src/data/store.js';
import { freeSlots, hasOverlap, mergeSlots, occupiedSlots } from '../src/services/availability.js';
import { createBooking, findWindows } from '../src/services/booking.js';
import { keywordSearch } from '../src/services/catalog.js';
import { utilisationReport } from '../src/services/stats.js';
import { addDays, campusNow, daysBetween, isValidDate, weekBounds } from '../src/lib/time.js';
import { NOW, booking } from './helpers.js';

const HORIZON = addDays(NOW.date, 21);

describe('time helpers', () => {
  it('validates real calendar dates only', () => {
    expect(isValidDate('2026-11-23')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('23-11-2026')).toBe(false);
  });

  it('computes campus time from a UTC offset', () => {
    expect(campusNow(330, new Date('2026-11-23T20:00:00Z'))).toEqual({
      date: '2026-11-24',
      hour: 1,
    });
  });

  it('handles day arithmetic and week bounds', () => {
    expect(daysBetween('2026-11-23', '2026-12-01')).toBe(8);
    expect(weekBounds('2026-11-26')).toEqual({ start: '2026-11-23', end: '2026-11-29' });
  });
});

describe('availability', () => {
  it('detects overlaps and lists only future free hours', () => {
    const taken = occupiedSlots([booking('p1', 'a', NOW.date, 9, 11)]);
    expect(
      hasOverlap(taken, { equipmentId: 'p1', date: NOW.date, startHour: 10, endHour: 12 }),
    ).toBe(true);
    expect(
      hasOverlap(taken, { equipmentId: 'p1', date: NOW.date, startHour: 11, endHour: 13 }),
    ).toBe(false);
    const free = freeSlots('p1', taken, { date: NOW.date, hour: 13 }, NOW.date);
    expect(free.map((s) => s.hour)).toEqual([14, 15, 16]);
  });

  it('merges consecutive hours into ranges', () => {
    const merged = mergeSlots([
      { equipmentId: 'p1', date: NOW.date, hour: 10 },
      { equipmentId: 'p1', date: NOW.date, hour: 9 },
      { equipmentId: 'p1', date: NOW.date, hour: 14 },
    ]);
    expect(merged).toEqual([
      { equipmentId: 'p1', date: NOW.date, startHour: 9, endHour: 11 },
      { equipmentId: 'p1', date: NOW.date, startHour: 14, endHour: 15 },
    ]);
  });

  it('finds non-overlapping contiguous windows', () => {
    const taken = occupiedSlots([booking('p1', 'a', NOW.date, 9, 15)]);
    expect(
      findWindows(taken, NOW, {
        equipmentId: 'p1',
        fromDate: NOW.date,
        lastDate: NOW.date,
        hours: 2,
        limit: 3,
      }),
    ).toEqual([{ date: NOW.date, startHour: 15, endHour: 17 }]);
  });
});

describe('createBooking', () => {
  const fresh = () => new Store(createSeed(NOW.date));

  it('books a free slot', () => {
    const store = fresh();
    const out = createBooking(
      store,
      'stu-aarav',
      { equipmentId: 'laser-1', date: NOW.date, startHour: 10, hours: 2 },
      { now: NOW, horizonEnd: HORIZON },
    );
    expect(out.ok).toBe(true);
    expect(store.bookingsFor('laser-1')).toHaveLength(1);
  });

  it('returns alternatives on conflict, including equivalent units in other labs', () => {
    const store = fresh();
    // seed: printer-mech-1 booked 9-13 today
    const out = createBooking(
      store,
      'stu-aarav',
      { equipmentId: 'printer-mech-1', date: NOW.date, startHour: 10, hours: 2 },
      { now: NOW, horizonEnd: HORIZON },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.alternatives.sameEquipment[0]).toEqual({
      date: NOW.date,
      startHour: 13,
      endHour: 15,
    });
    // the Design-lab printer is also booked then, and the second Mech printer is in maintenance
    expect(out.alternatives.equivalents).toHaveLength(0);
  });

  it('rejects maintenance equipment, past slots and double-booking the same student', () => {
    const store = fresh();
    expect(() =>
      createBooking(
        store,
        'stu-aarav',
        { equipmentId: 'printer-mech-2', date: NOW.date, startHour: 10, hours: 1 },
        { now: NOW, horizonEnd: HORIZON },
      ),
    ).toThrow(/maintenance/);
    expect(() =>
      createBooking(
        store,
        'stu-aarav',
        { equipmentId: 'laser-1', date: '2026-11-22', startHour: 10, hours: 1 },
        { now: NOW, horizonEnd: HORIZON },
      ),
    ).toThrow(/started/);
    // stu-aarav already has scope-1 tomorrow 14-16
    expect(() =>
      createBooking(
        store,
        'stu-aarav',
        { equipmentId: 'laser-1', date: addDays(NOW.date, 1), startHour: 15, hours: 1 },
        { now: NOW, horizonEnd: HORIZON },
      ),
    ).toThrow(/already have a booking/);
  });
});

describe('seed data integrity', () => {
  it('has no overlapping bookings per unit or per student', () => {
    const store = new Store(createSeed(NOW.date));
    const units = new Set<string>();
    const people = new Set<string>();
    for (const b of store.allBookings()) {
      for (let h = b.startHour; h < b.endHour; h++) {
        const u = `${b.equipmentId}|${b.date}|${h}`;
        const p = `${b.userId}|${b.date}|${h}`;
        expect(units.has(u), u).toBe(false);
        expect(people.has(p), p).toBe(false);
        units.add(u);
        people.add(p);
      }
    }
  });
});

describe('keywordSearch', () => {
  it('ranks category and tag matches', () => {
    const store = new Store(createSeed(NOW.date));
    const results = keywordSearch(store.catalog(), 'measure signal noise');
    expect(results[0]?.equipment.category).toBe('Oscilloscope');
    expect(keywordSearch(store.catalog(), 'the and for')).toEqual([]);
  });
});

describe('utilisationReport', () => {
  it('reports utilisation and suggests idle equivalents', () => {
    const store = new Store(createSeed(NOW.date));
    const report = utilisationReport(store, NOW);
    const gpu1 = report.items.find((i) => i.equipmentId === 'gpu-ws-1')!;
    expect(gpu1.bookedHours).toBe(16);
    expect(gpu1.utilisation).toBeCloseTo(16 / 56, 2);
    expect(report.redirects).toContainEqual(
      expect.objectContaining({ from: 'gpu-ws-1', to: 'gpu-ws-2' }),
    );
    expect(report.overall).toBeGreaterThan(0);
  });
});
