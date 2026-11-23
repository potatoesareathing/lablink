import { Suspense, lazy, useEffect, useState } from 'react';
import { api } from '../api';
import type { DemoUser } from '../api';
import { Loading, Notice, errorMessage } from './ui';

// Three.js is loaded only here, after first paint, so it never delays the app itself.
const CampusScene = lazy(() => import('./CampusScene').then((m) => ({ default: m.CampusScene })));

/** Landing page: what LabLink is, a live 3D campus, and demo personas for each role. */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showScene, setShowScene] = useState(false);

  // Fetch the 3D chunk only once the browser is idle, so it never competes with first paint.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => setShowScene(true));
    return () => cancel(id);
  }, []);

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
        <h1>Every lab on campus, one booking sheet.</h1>
        <p className="lede">
          Find oscilloscopes, FPGA boards, 3D printers and GPU workstations in any department, book
          time that never clashes, and get a fair share when everyone needs the same machine before
          a deadline.
        </p>
      </div>

      <figure className="campus-frame">
        {showScene ? (
          <Suspense fallback={<div className="campus-scene" aria-hidden="true" />}>
            <CampusScene />
          </Suspense>
        ) : (
          <div className="campus-scene" aria-hidden="true" />
        )}
        <figcaption className="campus-caption">
          Five departments, one shared pool of equipment.
        </figcaption>
      </figure>

      <div className="signin-people">
        {error && <Notice tone="bad">{error}</Notice>}
        {!users ? (
          <Loading label="Loading demo accounts" />
        ) : (
          <div className="persona-groups">
            {(['student', 'faculty'] as const).map((role) => (
              <section key={role} aria-labelledby={`${role}-heading`}>
                <h2 id={`${role}-heading`} className="h3">
                  {role === 'student' ? 'Try it as a student' : 'Try it as faculty'}
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
      </div>
    </main>
  );
}
