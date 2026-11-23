import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { User } from '../../shared/types';
import { api } from './api';
import { Discover } from './components/Discover';
import { SignIn } from './components/SignIn';
import { Loading, Notice, errorMessage } from './components/ui';

// Faculty-only and secondary views are code-split to keep the first load small.
const StudentRequests = lazy(() =>
  import('./components/StudentRequests').then((m) => ({ default: m.StudentRequests })),
);
const MyBookings = lazy(() =>
  import('./components/MyBookings').then((m) => ({ default: m.MyBookings })),
);
const Approvals = lazy(() =>
  import('./components/Approvals').then((m) => ({ default: m.Approvals })),
);
const Resolver = lazy(() => import('./components/Resolver').then((m) => ({ default: m.Resolver })));
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
);

type View = 'discover' | 'requests' | 'bookings' | 'approvals' | 'resolve' | 'utilisation';

const NAV: Record<User['role'], { id: View; label: string }[]> = {
  student: [
    { id: 'discover', label: 'Discover' },
    { id: 'requests', label: 'Project requests' },
    { id: 'bookings', label: 'My bookings' },
  ],
  faculty: [
    { id: 'approvals', label: 'Approvals' },
    { id: 'resolve', label: 'Resolve conflicts' },
    { id: 'utilisation', label: 'Utilisation' },
    { id: 'discover', label: 'Discover' },
  ],
};

const todayLocal = () => new Date().toLocaleDateString('en-CA');

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('discover');
  const [error, setError] = useState('');

  const loadSession = useCallback(() => {
    api
      .session()
      .then((s) => {
        setUser(s.user);
        setAiEnabled(s.aiEnabled);
        if (s.user) setView(NAV[s.user.role][0]!.id);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setReady(true));
  }, []);

  useEffect(loadSession, [loadSession]);

  // Move focus to the new page heading on navigation for screen-reader and keyboard users.
  useEffect(() => {
    document.getElementById('page-title')?.focus();
  }, [view]);

  async function signOut() {
    await api.signOut().catch(() => undefined);
    setUser(null);
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ⚗
          </span>
          <span>LabLink</span>
        </div>
        {user && (
          <nav aria-label="Primary">
            <ul className="nav" role="list">
              {NAV[user.role].map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="nav-link"
                    aria-current={view === item.id ? 'page' : undefined}
                    onClick={() => setView(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {user && (
          <div className="who">
            <span className="small">
              {user.name} <span className="muted">({user.role})</span>
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              Switch user
            </button>
          </div>
        )}
      </header>

      {error && <Notice tone="bad">{error}</Notice>}

      {!ready ? (
        // Same frame as the loaded app, so nothing shifts when the session resolves.
        <main id="main" className="container">
          <Loading label="Starting LabLink" />
        </main>
      ) : !user ? (
        <SignIn onSignedIn={loadSession} />
      ) : (
        <main id="main" className="container" tabIndex={-1}>
          <Suspense fallback={<Loading />}>
            {view === 'discover' && <Discover aiEnabled={aiEnabled} />}
            {view === 'requests' && <StudentRequests today={todayLocal()} />}
            {view === 'bookings' && <MyBookings />}
            {view === 'approvals' && <Approvals />}
            {view === 'resolve' && <Resolver />}
            {view === 'utilisation' && <Dashboard />}
          </Suspense>
        </main>
      )}
      <footer className="footer small muted">
        LabLink · fair, AI-assisted access to campus laboratories
        {aiEnabled ? ' · AI by Gemini' : ''}
      </footer>
    </>
  );
}
