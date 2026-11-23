import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { EquipmentView } from '../../../shared/types';
import { api } from '../api';
import type { RequestView } from '../api';
import { formatDate } from '../format';
import { AiBadge, Loading, Notice, PageHeader, StatusBadge, errorMessage } from './ui';

const emptyForm = {
  projectTitle: '',
  description: '',
  equipmentId: '',
  deadline: '',
  hoursNeeded: 4,
};

export function StudentRequests({ today }: { today: string }) {
  const [catalog, setCatalog] = useState<EquipmentView[]>([]);
  const [requests, setRequests] = useState<RequestView[] | null>(null);
  const [idea, setIdea] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [draftNote, setDraftNote] = useState<{ source: string; text: string } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const refresh = () =>
    api
      .requests()
      .then((r) => setRequests(r.requests))
      .catch((err) => setMessage({ tone: 'bad', text: errorMessage(err) }));

  useEffect(() => {
    void refresh();
    api
      .catalog({ available: true })
      .then((r) => setCatalog(r.items))
      .catch(() => setCatalog([]));
  }, []);

  async function draft() {
    setDrafting(true);
    setMessage(null);
    try {
      const { draft } = await api.draft(idea);
      setForm((f) => ({
        ...f,
        projectTitle: draft.projectTitle,
        description: draft.description,
        equipmentId: draft.equipmentId,
        hoursNeeded: draft.hoursNeeded,
      }));
      setDraftNote({ source: draft.source, text: draft.rationale });
    } catch (err) {
      setMessage({ tone: 'bad', text: errorMessage(err) });
    } finally {
      setDrafting(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      await api.createRequest({ ...form, hoursNeeded: Number(form.hoursNeeded) });
      setMessage({ tone: 'ok', text: 'Request submitted. Faculty will review it shortly.' });
      setForm(emptyForm);
      setIdea('');
      setDraftNote(null);
      void refresh();
    } catch (err) {
      setMessage({ tone: 'bad', text: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Project access requests"
        intro="Request dedicated time for a project. Faculty approve it and LabLink schedules it fairly before your deadline."
      />

      <section className="card" aria-labelledby="new-request">
        <h2 id="new-request" className="h3">
          New request
        </h2>

        <div className="assist">
          <label htmlFor="idea">Describe your project idea (optional AI assist)</label>
          <textarea
            id="idea"
            rows={2}
            maxLength={800}
            value={idea}
            placeholder="e.g. We are building a soil-moisture monitor and need to 3D print 5 waterproof housings"
            onChange={(e) => setIdea(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void draft()}
            disabled={drafting || idea.trim().length < 10}
          >
            {drafting ? 'Drafting…' : '✦ Draft request for me'}
          </button>
          <div aria-live="polite">
            {draftNote && (
              <p className="reason small">
                <AiBadge source={draftNote.source} /> {draftNote.text} Review and edit before
                submitting.
              </p>
            )}
          </div>
        </div>

        <form className="form-grid" onSubmit={(e) => void submit(e)}>
          <label>
            Project title
            <input
              required
              minLength={3}
              maxLength={100}
              value={form.projectTitle}
              onChange={set('projectTitle')}
            />
          </label>
          <label>
            Equipment
            <select required value={form.equipmentId} onChange={set('equipmentId')}>
              <option value="">Choose equipment…</option>
              {catalog.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.labName}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            What will you do with it?
            <textarea
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              value={form.description}
              onChange={set('description')}
            />
          </label>
          <label>
            Deadline
            <input
              type="date"
              required
              min={today}
              value={form.deadline}
              onChange={set('deadline')}
            />
          </label>
          <label>
            Hours needed
            <input
              type="number"
              required
              min={1}
              max={40}
              value={form.hoursNeeded}
              onChange={set('hoursNeeded')}
            />
          </label>
          <div className="span-2">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>
        <div aria-live="polite">
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      </section>

      <section aria-labelledby="my-requests">
        <h2 id="my-requests">My requests</h2>
        {!requests ? (
          <Loading />
        ) : requests.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <ul className="stack" role="list">
            {requests.map((r) => (
              <li key={r.id} className="card">
                <div className="equipment-head">
                  <h3 className="h4">{r.projectTitle}</h3>
                  <StatusBadge status={r.status} />
                </div>
                <p className="muted small">
                  {r.equipmentName} · {r.labName} · {r.hoursNeeded} h · due {formatDate(r.deadline)}
                </p>
                {r.facultyNote && <p className="small">Faculty note: {r.facultyNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
