import { useEffect, useState } from 'react';
import type { UtilisationReport } from '../../../shared/types';
import { api } from '../api';
import { percent } from '../format';
import { Loading, Notice, PageHeader, errorMessage } from './ui';

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="bar" role="img" aria-label={`${label}: ${percent(value)} utilised`}>
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.round(value * 100))}%` }} />
    </div>
  );
}

export function Dashboard() {
  const [report, setReport] = useState<UtilisationReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .utilisation()
      .then(setReport)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!report) return <Loading />;

  const idle = report.items.filter((i) => i.utilisation === 0).length;

  return (
    <>
      <PageHeader
        title="Utilisation"
        intro={`Booked share of open lab hours over the next ${report.windowDays} days.`}
      />

      <div className="kpis">
        <div className="card kpi">
          <p className="kpi-value">{percent(report.overall)}</p>
          <p className="muted small">Campus utilisation</p>
        </div>
        <div className="card kpi">
          <p className="kpi-value">{report.items.length}</p>
          <p className="muted small">Bookable units</p>
        </div>
        <div className="card kpi">
          <p className="kpi-value">{idle}</p>
          <p className="muted small">Idle units this week</p>
        </div>
      </div>

      <section aria-labelledby="redirect-heading" className="card">
        <h2 id="redirect-heading" className="h3">
          Rebalancing suggestions
        </h2>
        {report.redirects.length === 0 ? (
          <p>No rebalancing needed.</p>
        ) : (
          <ul className="stack-tight">
            {report.redirects.map((r) => (
              <li key={`${r.from}-${r.to}`}>
                <strong>{r.fromName}</strong> is busy — point students to the idle{' '}
                <strong>{r.toName}</strong> in {r.toLab}.
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dept-heading" className="card">
        <h2 id="dept-heading" className="h3">
          By department
        </h2>
        <ul className="bars">
          {report.byDepartment.map((d) => (
            <li key={d.departmentId}>
              <span className="bar-label">{d.name}</span>
              <Bar value={d.utilisation} label={d.name} />
              <span className="bar-value">{percent(d.utilisation)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="items-heading" className="card table-scroll">
        <h2 id="items-heading" className="h3">
          By equipment
        </h2>
        <table className="data">
          <caption className="sr-only">Utilisation per equipment unit, busiest first</caption>
          <thead>
            <tr>
              <th scope="col">Equipment</th>
              <th scope="col">Lab</th>
              <th scope="col">Booked</th>
              <th scope="col">Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map((i) => (
              <tr key={i.equipmentId}>
                <td>{i.name}</td>
                <td>{i.labName}</td>
                <td>
                  {i.bookedHours} / {i.openHours} h
                </td>
                <td className="util-cell">
                  <Bar value={i.utilisation} label={i.name} />
                  <span>{percent(i.utilisation)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
