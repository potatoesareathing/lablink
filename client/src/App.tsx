import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
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
const CampusMap = lazy(() =>
  import('./components/CampusMap').then((m) => ({ default: m.CampusMap })),
);
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
);

type View = 'discover' | 'map' | 'requests' | 'bookings' | 'approvals' | 'resolve' | 'utilisation';

const NAV: Record<User['role'], { id: View; label: string }[]> = {
  student: [
    { id: 'discover', label: 'Discover' },
    { id: 'map', label: 'Campus map' },
    { id: 'requests', label: 'Project requests' },
    { id: 'bookings', label: 'My bookings' },
  ],
  faculty: [
    { id: 'approvals', label: 'Approvals' },
    { id: 'resolve', label: 'Resolve conflicts' },
    { id: 'utilisation', label: 'Utilisation' },
    { id: 'discover', label: 'Discover' },
    { id: 'map', label: 'Campus map' },
  ],
};

const todayLocal = () => new Date().toLocaleDateString('en-CA');

/** The page for each view; only the active one is mounted. */
function renderView(view: View, aiEnabled: boolean) {
  const views: Record<View, () => JSX.Element> = {
    discover: () => <Discover aiEnabled={aiEnabled} />,
    map: () => <CampusMap />,
    requests: () => <StudentRequests today={todayLocal()} />,
    bookings: () => <MyBookings />,
    approvals: () => <Approvals />,
    resolve: () => <Resolver />,
    utilisation: () => <Dashboard />,
  };
  return views[view]();
}

interface TopBarProps {
  user: User | null;
  view: View;
  onNavigate: (view: View) => void;
  onSignOut: () => void;
}

function TopBar({ user, view, onNavigate, onSignOut }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          ⚗
        </span>
        <span className="brand-name">LabLink</span>
      </div>
      {user && (
        <>
          <nav aria-label="Primary">
            <ul className="nav" role="list">
              {NAV[user.role].map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="nav-link"
                    aria-current={view === item.id ? 'page' : undefined}
                    onClick={() => onNavigate(item.id)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="who">
            <span className="small who-name">
              {user.name} <span className="muted">({user.role})</span>
            </span>
            <button type="button" className="btn btn-ghost" onClick={onSignOut}>
              Switch user
            </button>
          </div>
        </>
      )}
    </header>
  );
}

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

  const signOut = () => {
    void api
      .signOut()
      .catch(() => undefined)
      .then(() => setUser(null));
  };

  const signedOut = ready && !user;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <TopBar user={user} view={view} onNavigate={setView} onSignOut={signOut} />
      {error && <Notice tone="bad">{error}</Notice>}
      {signedOut ? (
        <SignIn onSignedIn={loadSession} />
      ) : (
        // Same frame while the session loads, so nothing shifts when it resolves.
        <main id="main" className="container" tabIndex={-1}>
          {ready ? (
            <Suspense fallback={<Loading />}>{renderView(view, aiEnabled)}</Suspense>
          ) : (
            <Loading label="Starting LabLink" />
          )}
        </main>
      )}
      <footer className="footer small muted">
        LabLink · fair, AI-assisted access to campus laboratories
        {aiEnabled ? ' · AI by Gemini' : ''}
      </footer>
    </>
  );
}
