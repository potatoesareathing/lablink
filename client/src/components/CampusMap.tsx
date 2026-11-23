import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { Department, EquipmentView } from '../../../shared/types';
import { api } from '../api';
import { BookingPanel } from './BookingPanel';
import { Loading, Notice, PageHeader, StatusBadge, errorMessage } from './ui';

const CampusScene = lazy(() => import('./CampusScene').then((m) => ({ default: m.CampusScene })));

/**
 * Interactive campus map. The 3D view (mouse/touch: drag to rotate, scroll to zoom,
 * click a building) is paired with an equivalent keyboard- and screen-reader-friendly
 * department list; both drive the same selection.
 */
export function CampusMap() {
  const [items, setItems] = useState<EquipmentView[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .catalog()
      .then((r) => {
        setItems(r.items);
        setDepartments(r.departments);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const labs = useMemo(() => {
    const inDept = (items ?? []).filter((e) => e.departmentId === selected);
    const byLab = new Map<string, { name: string; location: string; equipment: EquipmentView[] }>();
    for (const e of inDept) {
      const lab = byLab.get(e.labId) ?? { name: e.labName, location: e.location, equipment: [] };
      lab.equipment.push(e);
      byLab.set(e.labId, lab);
    }
    return [...byLab.values()];
  }, [items, selected]);

  const counts = useMemo(() => {
    const map = new Map<string, { total: number; available: number }>();
    for (const e of items ?? []) {
      const c = map.get(e.departmentId) ?? { total: 0, available: 0 };
      c.total += 1;
      if (e.status === 'available') c.available += 1;
      map.set(e.departmentId, c);
    }
    return map;
  }, [items]);

  const dept = departments.find((d) => d.id === selected);

  return (
    <>
      <PageHeader
        title="Campus map"
        intro="Explore every department's labs. Drag to rotate, scroll to zoom and click a building, or choose a department from the list."
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {!items ? (
        <Loading label="Loading campus" />
      ) : (
        <div className="map-layout">
          <figure className="campus-frame map-frame">
            <Suspense fallback={<div className="campus-scene" aria-hidden="true" />}>
              <CampusScene interactive selected={selected} onSelect={setSelected} />
            </Suspense>
            <figcaption className="campus-caption">
              {dept ? `Selected: ${dept.name}` : 'Click a building to see its labs.'}
            </figcaption>
          </figure>

          <nav aria-label="Departments" className="dept-list">
            <ul role="list">
              {departments.map((d) => {
                const c = counts.get(d.id);
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="dept-button"
                      aria-pressed={selected === d.id}
                      onClick={() => setSelected(d.id)}
                    >
                      <span className="persona-name">{d.name}</span>
                      <span className="muted small">
                        {c?.available ?? 0} of {c?.total ?? 0} units available
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}

      <section aria-live="polite" aria-labelledby={dept ? 'dept-heading' : undefined}>
        {dept && (
          <>
            <h2 id="dept-heading">{dept.name}</h2>
            <div className="grid">
              {labs.map((lab) => (
                <article key={lab.name} className="card">
                  <h3 className="h4">{lab.name}</h3>
                  <p className="muted small">{lab.location}</p>
                  <ul className="lab-equipment" role="list">
                    {lab.equipment.map((e) => (
                      <li key={e.id}>
                        <span>
                          {e.name} <StatusBadge status={e.status} />
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={e.status !== 'available'}
                          onClick={() => setBooking(e.id)}
                        >
                          View slots <span className="sr-only">for {e.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {booking && <BookingPanel equipmentId={booking} onClose={() => setBooking(null)} />}
    </>
  );
}
