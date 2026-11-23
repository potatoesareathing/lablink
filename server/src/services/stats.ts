import { HOURS_PER_DAY } from '../../../shared/constants.js';
import type { UtilisationReport, UtilisationRow } from '../../../shared/types.js';
import type { Store } from '../data/store.js';
import { addDays } from '../lib/time.js';
import type { CampusClock } from '../lib/time.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Utilisation over the next `windowDays` days (booked hours / open hours), per item and
 * department, plus "redirect" suggestions from busy items to idle equivalents.
 */
export function utilisationReport(
  store: Store,
  now: CampusClock,
  windowDays = 7,
): UtilisationReport {
  const last = addDays(now.date, windowDays - 1);
  const openHours = windowDays * HOURS_PER_DAY;

  const items: UtilisationRow[] = [...store.equipment.values()]
    .filter((e) => e.status === 'available')
    .map((e) => {
      const bookedHours = store
        .bookingsFor(e.id)
        .filter((b) => b.date >= now.date && b.date <= last)
        .reduce((s, b) => s + (b.endHour - b.startHour), 0);
      return {
        equipmentId: e.id,
        name: e.name,
        labName: store.labs.get(e.labId)?.name ?? '',
        bookedHours,
        openHours,
        utilisation: round2(bookedHours / openHours),
      };
    })
    .sort((a, b) => b.utilisation - a.utilisation || a.name.localeCompare(b.name));

  const util = new Map(items.map((i) => [i.equipmentId, i.utilisation]));
  const totalBooked = items.reduce((s, i) => s + i.bookedHours, 0);

  const byDepartment = [...store.departments.values()].map((d) => {
    const rows = items.filter(
      (i) => store.labs.get(store.equipment.get(i.equipmentId)!.labId)?.departmentId === d.id,
    );
    const booked = rows.reduce((s, r) => s + r.bookedHours, 0);
    return {
      departmentId: d.id,
      name: d.name,
      utilisation: rows.length ? round2(booked / (rows.length * openHours)) : 0,
    };
  });

  const redirects: UtilisationReport['redirects'] = [];
  for (const row of items) {
    if (row.utilisation < 0.25) continue;
    const from = store.equipment.get(row.equipmentId)!;
    const best = items
      .filter((i) => i.equipmentId !== row.equipmentId)
      .filter((i) => store.equipment.get(i.equipmentId)!.equivalentGroup === from.equivalentGroup)
      .filter((i) => (util.get(i.equipmentId) ?? 1) <= row.utilisation - 0.15)
      .sort((a, b) => a.utilisation - b.utilisation)[0];
    if (best) {
      redirects.push({
        from: from.id,
        fromName: from.name,
        to: best.equipmentId,
        toName: best.name,
        toLab: best.labName,
      });
    }
  }

  return {
    windowDays,
    overall: items.length ? round2(totalBooked / (items.length * openHours)) : 0,
    items,
    byDepartment,
    redirects,
  };
}
