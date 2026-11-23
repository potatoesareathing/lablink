import { useEffect, useState } from 'react';
import { api } from '../api';
import type { DemoUser } from '../api';
import { Loading, Notice, errorMessage } from './ui';

/** Demo persona picker so judges can try both student and faculty flows instantly. */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api
      .demoUsers()
      .then((r) => setUsers(r.users))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function choose(id: string) {
    setBusy(id);
    try {
      await api.signIn(id);
      onSignedIn();
    } catch (err) {
      setError(errorMessage(err));
      setBusy('');
    }
  }

  const group = (role: DemoUser['role']) => users?.filter((u) => u.role === role) ?? [];

  return (
    <main id="main" className="signin">
      <div className="signin-hero">
        <p className="eyebrow">Campus laboratory resource sharing</p>
        <h1>Find the right lab equipment. Get fair time on it.</h1>
        <p className="lede">
          LabLink connects students to oscilloscopes, FPGA boards, 3D printers, GPU workstations and
          more across every department — with AI-assisted discovery, conflict-free booking, faculty
          approvals and fair allocation when demand spikes before deadlines.
        </p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {!users ? (
        <Loading label="Loading demo accounts" />
      ) : (
        <div className="persona-groups">
          {(['student', 'faculty'] as const).map((role) => (
            <section key={role} aria-labelledby={`${role}-heading`}>
              <h2 id={`${role}-heading`} className="h3">
                Continue as {role === 'student' ? 'a student' : 'faculty / lab in-charge'}
              </h2>
              <ul className="persona-list" role="list">
                {group(role).map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="persona"
                      onClick={() => void choose(u.id)}
                      disabled={!!busy}
                    >
                      <span className="persona-name">{u.name}</span>
                      <span className="muted small">{u.department}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
