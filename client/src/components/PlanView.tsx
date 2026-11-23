import type { Plan } from '../api';
import { formatDate, formatRange } from '../format';
import { AiBadge, StatusBadge } from './ui';

/** Renders an allocation plan: ranked results, granted time and plain-language reasons. */
export function PlanView({ plan, title = 'Proposed allocation' }: { plan: Plan; title?: string }) {
  return (
    <div className="plan">
      <h3 className="h4">
        {title} <AiBadge source={plan.source} />
      </h3>
      <p>{plan.summary}</p>
      <ol className="stack" aria-label="Allocation by priority">
        {plan.results.map((r, i) => (
          <li key={r.requestId} className="card plan-item">
            <div className="equipment-head">
              <h4 className="h4">
                #{i + 1} {r.studentName} — {r.projectTitle}
              </h4>
              <StatusBadge status={r.outcome} />
            </div>
            <p className="muted small">
              Priority score {r.priority.toFixed(2)} · {r.hoursGranted}/{r.hoursNeeded} h granted ·
              due {formatDate(r.deadline)}
            </p>
            {r.ranges.length > 0 && (
              <ul className="small">
                {r.ranges.map((g) => (
                  <li key={`${g.equipmentId}-${g.date}-${g.startHour}`}>
                    {formatRange(g.date, g.startHour, g.endHour)} · {g.equipmentName} ({g.labName})
                  </li>
                ))}
              </ul>
            )}
            <p className="reason small">{r.explanation}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
