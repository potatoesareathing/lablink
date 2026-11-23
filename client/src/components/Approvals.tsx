import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Plan, RequestView } from '../api';
import { formatDate } from '../format';
import { PlanView } from './PlanView';
import { AiBadge, Loading, Notice, PageHeader, StatusBadge, errorMessage } from './ui';

export function Approvals() {
  const [requests, setRequests] = useState<RequestView[] | null>(null);
  const [error, setError] = useState('');

  const refresh = () =>
    api
      .requests()
      .then((r) => setRequests(r.requests))
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    void refresh();
  }, []);

  const pending = requests?.filter((r) => r.status === 'pending') ?? [];
  const decided = requests?.filter((r) => r.status !== 'pending') ?? [];

  return (
    <>
      <PageHeader
        title="Approval queue"
        intro="Pending project requests, most urgent deadline first. Approving schedules the hours automatically without overlaps."
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {!requests ? (
        <Loading />
      ) : (
        <>
          <section aria-labelledby="pending-heading">
            <h2 id="pending-heading">Pending ({pending.length})</h2>
            {pending.length === 0 ? (
              <p>Nothing waiting for review.</p>
            ) : (
              <ul className="stack" role="list">
                {pending.map((r) => (
                  <ApprovalCard key={r.id} request={r} onDecided={() => void refresh()} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="decided-heading">
            <h2 id="decided-heading">Recently decided</h2>
            {decided.length === 0 ? (
              <p>No decisions yet.</p>
            ) : (
              <ul className="stack" role="list">
                {decided.map((r) => (
                  <li key={r.id} className="card">
                    <div className="equipment-head">
                      <h3 className="h4">
                        {r.projectTitle} <span className="muted">· {r.studentName}</span>
                      </h3>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.facultyNote && <p className="small">Note: {r.facultyNote}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function ApprovalCard({ request, onDecided }: { request: RequestView; onDecided: () => void }) {
  const [summary, setSummary] = useState<{ text: string; source: string } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const noteId = `reject-note-${request.id}`;

  async function loadSummary() {
    setLoadingSummary(true);
    try {
      const res = await api.summary(request.id);
      setSummary({ text: res.summary, source: res.source });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingSummary(false);
    }
  }

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    try {
      const res = await api.decide(request.id, decision, decision === 'reject' ? note : undefined);
      if (res.plan) setPlan(res.plan);
      else onDecided();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card">
      <div className="equipment-head">
        <h3 className="h4">
          {request.projectTitle} <span className="muted">· {request.studentName}</span>
        </h3>
        <StatusBadge status={plan ? 'approved' : request.status} />
      </div>
      <p className="muted small">
        {request.equipmentName} ({request.labName}) · {request.hoursNeeded} h needed · due{' '}
        {formatDate(request.deadline)} · {request.freeHoursBeforeDeadline} h free before deadline
      </p>
      <p className="small">{request.description}</p>
      {request.risks.length > 0 && (
        <ul className="risks small" aria-label="Risk flags">
          {request.risks.map((risk) => (
            <li key={risk}>
              <span aria-hidden="true">⚠ </span>
              {risk}
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite">
        {summary && (
          <p className="reason small">
            <AiBadge source={summary.source} /> {summary.text}
          </p>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        {plan && <PlanView plan={plan} title="Scheduled" />}
      </div>

      {plan ? (
        <button type="button" className="btn btn-secondary" onClick={onDecided}>
          Done
        </button>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void loadSummary()}
            disabled={loadingSummary || !!summary}
          >
            {loadingSummary ? 'Summarising…' : '✦ AI summary'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void decide('approve')}
            disabled={busy}
          >
            Approve &amp; schedule
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setRejecting((v) => !v)}
            aria-expanded={rejecting}
            aria-controls={noteId}
          >
            Reject…
          </button>
        </div>
      )}
      {rejecting && !plan && (
        <div className="reject" id={noteId}>
          <label htmlFor={`${noteId}-input`}>Reason shared with the student (required)</label>
          <textarea
            id={`${noteId}-input`}
            rows={2}
            minLength={3}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void decide('reject')}
            disabled={busy || note.trim().length < 3}
          >
            Confirm rejection
          </button>
        </div>
      )}
    </li>
  );
}
