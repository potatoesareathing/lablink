import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { EquipmentView } from '../../../shared/types';
import { api } from '../api';
import type { Draft, RequestView } from '../api';
import { formatDate } from '../format';
import { AiBadge, Notice, PageHeader, StatusBadge, errorMessage, DataState } from './ui';

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
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  // Bumped after a successful submit to reset the AI assistant.
  const [assistKey, setAssistKey] = useState(0);
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      await api.createRequest({ ...form, hoursNeeded: Number(form.hoursNeeded) });
      setMessage({ tone: 'ok', text: 'Request submitted. Faculty will review it shortly.' });
      setForm(emptyForm);
      setAssistKey((k) => k + 1);
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

        <DraftAssistant
          key={assistKey}
          onDraft={(draft) =>
            setForm((f) => ({
              ...f,
              projectTitle: draft.projectTitle,
              description: draft.description,
              equipmentId: draft.equipmentId,
              hoursNeeded: draft.hoursNeeded,
            }))
          }
          onError={(text) => setMessage({ tone: 'bad', text })}
        />

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

      <MyRequests requests={requests} />
    </>
  );
}

/** The student's submitted requests with status and any faculty note. */
function MyRequests({ requests }: { requests: RequestView[] | null }) {
  return (
    <section aria-labelledby="my-requests">
      <h2 id="my-requests">My requests</h2>
      <DataState items={requests} empty={<p>No requests yet.</p>}>
        {(requests) => (
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
      </DataState>
    </section>
  );
}

interface DraftAssistantProps {
  onDraft: (draft: Draft) => void;
  onError: (message: string) => void;
}

/** Optional AI helper: turns a rough idea into a pre-filled request the student edits. */
function DraftAssistant({ onDraft, onError }: DraftAssistantProps) {
  const [idea, setIdea] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState<{ source: string; text: string } | null>(null);

  async function draft() {
    setDrafting(true);
    try {
      const { draft } = await api.draft(idea);
      onDraft(draft);
      setNote({ source: draft.source, text: draft.rationale });
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setDrafting(false);
    }
  }

  return (
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
        {note && (
          <p className="reason small">
            <AiBadge source={note.source} /> {note.text} Review and edit before submitting.
          </p>
        )}
      </div>
    </div>
  );
}
