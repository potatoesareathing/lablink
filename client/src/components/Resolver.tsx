import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ConflictGroup, Plan } from '../api';
import { PlanView } from './PlanView';
import { Loading, Notice, PageHeader, errorMessage } from './ui';

export function Resolver() {
  const [conflicts, setConflicts] = useState<ConflictGroup[] | null>(null);
  const [active, setActive] = useState<ConflictGroup | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () =>
    api
      .conflicts()
      .then((r) => setConflicts(r.conflicts))
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    void refresh();
  }, []);

  async function preview(group: ConflictGroup) {
    setActive(group);
    setPlan(null);
    setApplied(false);
    setBusy(true);
    setError('');
    try {
      setPlan((await api.resolve(group.requestIds)).plan);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      setPlan((await api.apply(active.requestIds)).plan);
      setApplied(true);
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Resolve scheduling conflicts"
        intro="When several projects compete for the same kind of equipment, LabLink proposes a fair, feasible plan: deadline urgency 50%, fairness 30%, feasibility 20%. Overflow moves to identical units in other labs."
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {!conflicts ? (
        <Loading />
      ) : conflicts.length === 0 ? (
        <Notice tone="ok">No competing requests right now.</Notice>
      ) : (
        <ul className="grid" role="list" aria-label="Equipment with competing requests">
          {conflicts.map((c) => {
            const shortfall = c.hoursDemanded > c.freeHours;
            return (
              <li key={c.equivalentGroup} className="card">
                <h2 className="h4">{c.category}</h2>
                <p className="small">
                  {c.requestIds.length} competing requests · {c.hoursDemanded} h demanded ·{' '}
                  {c.freeHours} h free across all labs
                </p>
                <p className={`small ${shortfall ? 'text-bad' : 'text-ok'}`}>
                  {shortfall
                    ? '⚠ Demand exceeds capacity'
                    : '✓ Capacity exists if scheduled carefully'}
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void preview(c)}
                  disabled={busy}
                >
                  Generate fair plan
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-live="polite" aria-busy={busy}>
        {busy && !plan && <Loading label="Computing allocation" />}
        {plan && (
          <div className="card">
            <PlanView
              plan={plan}
              title={
                applied ? 'Allocation applied' : `Proposed allocation · ${active?.category ?? ''}`
              }
            />
            {applied ? (
              <Notice tone="ok">
                Bookings created. Students can see their slots under My bookings.
              </Notice>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void apply()}
                disabled={busy}
              >
                Apply plan &amp; create bookings
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
