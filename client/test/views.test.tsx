// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { Approvals } from '../src/components/Approvals';
import { BookingPanel } from '../src/components/BookingPanel';
import { CampusMap } from '../src/components/CampusMap';
import { Dashboard } from '../src/components/Dashboard';
import { MyBookings } from '../src/components/MyBookings';
import { Resolver } from '../src/components/Resolver';
import { StudentRequests } from '../src/components/StudentRequests';

const equipment = {
  id: 'printer-1',
  name: '3D Printer #1',
  category: '3D Printer',
  equivalentGroup: 'fdm',
  labId: 'mech-fab',
  specs: 'FDM',
  tags: [],
  status: 'available',
  labName: 'Fabrication Lab',
  departmentName: 'Mechanical',
  location: 'Bay 2',
};

const pendingRequest = {
  id: 'req-1',
  studentId: 'stu-a',
  studentName: 'Asha',
  projectTitle: 'Drone frame',
  description: 'Print a frame',
  deadline: '2026-11-24',
  hoursNeeded: 6,
  equipmentId: 'printer-1',
  status: 'pending',
  submittedAt: '2026-11-20T00:00:00Z',
  equipmentName: '3D Printer #1',
  labName: 'Fabrication Lab',
  freeHoursBeforeDeadline: 4,
  risks: ['Needs 6 h but only 4 h free before the deadline (incl. equivalent units)'],
};

const plan = {
  generatedAt: '2026-11-23T10:00:00Z',
  summary: 'Plan summary text',
  source: 'ai',
  results: [
    {
      requestId: 'req-1',
      studentId: 'stu-a',
      studentName: 'Asha',
      projectTitle: 'Drone frame',
      deadline: '2026-11-24',
      priority: 0.8,
      outcome: 'partial',
      hoursGranted: 4,
      hoursNeeded: 6,
      reasons: [],
      slots: [],
      explanation: 'Asha gets 4 of 6 hours.',
      ranges: [],
    },
  ],
};

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown };

function mockApi(handler: Handler) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { status = 200, body } = handler(url, init);
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function expectAccessible(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App shell', () => {
  it('shows the persona picker when signed out', async () => {
    mockApi((url) =>
      url.endsWith('/session')
        ? { body: { user: null, aiEnabled: true } }
        : { body: { users: [{ id: 'stu-a', name: 'Asha', role: 'student', department: 'CSE' }] } },
    );
    const { container } = render(<App />);
    expect(await screen.findByRole('button', { name: /Asha/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeTruthy();
    await expectAccessible(container);
  });

  it('shows role-based navigation for faculty', async () => {
    mockApi((url) => {
      if (url.endsWith('/session'))
        return {
          body: {
            user: {
              id: 'fac',
              name: 'Dr. Rao',
              role: 'faculty',
              departmentId: 'mech',
              recentDenials: 0,
            },
            aiEnabled: true,
          },
        };
      return { body: { requests: [] } };
    });
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(nav.textContent).toContain('Resolve conflicts');
    expect(screen.getByRole('button', { name: 'Approvals' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

describe('BookingPanel', () => {
  const grid = {
    equipment,
    now: { date: '2026-11-23', hour: 8 },
    days: [
      {
        date: '2026-11-23',
        hours: [
          { hour: 9, booked: false },
          { hour: 10, booked: true },
        ],
      },
    ],
  };

  it('books a free slot and confirms it', async () => {
    const fetchMock = mockApi((url, init) =>
      init?.method === 'POST' ? { status: 201, body: { booking: { id: 'b1' } } } : { body: grid },
    );
    const user = userEvent.setup();
    const { container } = render(
      <BookingPanel equipmentId="printer-1" onClose={() => undefined} />,
    );
    await user.click(await screen.findByRole('button', { name: /09:00 free/ }));
    await user.click(screen.getByRole('button', { name: /^Book / }));
    expect(await screen.findByText(/Booked .*09:00/)).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      equipmentId: 'printer-1',
      startHour: 9,
      hours: 1,
    });
    await expectAccessible(container);
  });

  it('offers alternatives when a booked slot is chosen', async () => {
    mockApi((_url, init) =>
      init?.method === 'POST'
        ? {
            status: 409,
            body: {
              error: { message: 'That slot is already booked' },
              alternatives: {
                sameEquipment: [{ date: '2026-11-23', startHour: 11, endHour: 12 }],
                equivalents: [
                  {
                    date: '2026-11-23',
                    startHour: 10,
                    endHour: 11,
                    equipment: {
                      ...equipment,
                      id: 'printer-2',
                      name: '3D Printer #2',
                      labName: 'Maker Studio',
                    },
                  },
                ],
              },
            },
          }
        : { body: grid },
    );
    const user = userEvent.setup();
    render(<BookingPanel equipmentId="printer-1" onClose={() => undefined} />);
    await user.click(await screen.findByRole('button', { name: /10:00 booked/ }));
    expect(await screen.findByRole('button', { name: /11:00–12:00/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /3D Printer #2 · Maker Studio/ })).toBeTruthy();
  });
});

describe('StudentRequests', () => {
  it('drafts a request with AI and submits it', async () => {
    const fetchMock = mockApi((url, init) => {
      if (url.includes('/ai/draft-request')) {
        return {
          body: {
            draft: {
              projectTitle: 'Sensor housing',
              description: 'Print 5 waterproof housings',
              equipmentId: 'printer-1',
              hoursNeeded: 5,
              rationale: 'Needs FDM printing.',
              source: 'ai',
            },
          },
        };
      }
      if (url.includes('/equipment'))
        return { body: { items: [equipment], categories: [], departments: [] } };
      if (init?.method === 'POST') return { status: 201, body: { request: pendingRequest } };
      return { body: { requests: [] } };
    });
    const user = userEvent.setup();
    const { container } = render(<StudentRequests today="2026-11-23" />);
    await screen.findByText('No requests yet.');
    await user.type(
      screen.getByLabelText(/Describe your project idea/),
      'soil monitor needs 5 printed housings',
    );
    await user.click(screen.getByRole('button', { name: /Draft request for me/ }));
    expect(await screen.findByDisplayValue('Sensor housing')).toBeTruthy();
    await user.type(screen.getByLabelText('Deadline'), '2026-11-30');
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByText(/Request submitted/)).toBeTruthy();
    const post = fetchMock.mock.calls.find(
      ([u, init]) => String(u).endsWith('/requests') && init?.method === 'POST',
    );
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      projectTitle: 'Sensor housing',
      hoursNeeded: 5,
    });
    await expectAccessible(container);
  });
});

describe('Approvals', () => {
  it('shows risk flags, loads an AI summary and approves', async () => {
    mockApi((url) => {
      if (url.includes('/summary'))
        return { body: { summary: 'Feasible with a partial grant.', source: 'ai', risks: [] } };
      if (url.includes('/decision'))
        return { body: { request: { ...pendingRequest, status: 'partial' }, plan } };
      return { body: { requests: [pendingRequest] } };
    });
    const user = userEvent.setup();
    const { container } = render(<Approvals />);
    expect(await screen.findByText(/only 4 h free/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /AI summary/ }));
    expect(await screen.findByText('Feasible with a partial grant.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Approve & schedule/ }));
    expect(await screen.findByText('Asha gets 4 of 6 hours.')).toBeTruthy();
    await expectAccessible(container);
  });

  it('requires a reason before rejecting', async () => {
    mockApi(() => ({ body: { requests: [pendingRequest] } }));
    const user = userEvent.setup();
    render(<Approvals />);
    await user.click(await screen.findByRole('button', { name: /Reject/ }));
    const confirm = screen.getByRole('button', { name: 'Confirm rejection' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Reason shared with the student/), 'Use the other lab');
    expect(confirm.disabled).toBe(false);
  });
});

describe('Resolver', () => {
  it('previews and applies a fair plan', async () => {
    const fetchMock = mockApi((url) => {
      if (url.includes('/conflicts'))
        return {
          body: {
            conflicts: [
              {
                equivalentGroup: 'fdm',
                category: '3D Printer',
                requestIds: ['req-1', 'req-2'],
                hoursDemanded: 30,
                freeHours: 29,
              },
            ],
          },
        };
      return { body: { plan } };
    });
    const user = userEvent.setup();
    const { container } = render(<Resolver />);
    expect(await screen.findByText(/Demand exceeds capacity/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Generate fair plan' }));
    expect(await screen.findByText('Plan summary text')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Apply plan/ }));
    expect(await screen.findByText(/Bookings created/)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/allocations/apply'))).toBe(true);
    await expectAccessible(container);
  });
});

describe('Dashboard and bookings', () => {
  it('renders utilisation KPIs, bars and rebalancing suggestions', async () => {
    mockApi(() => ({
      body: {
        windowDays: 7,
        overall: 0.25,
        items: [
          {
            equipmentId: 'gpu-1',
            name: 'GPU #1',
            labName: 'AI Lab',
            bookedHours: 16,
            openHours: 56,
            utilisation: 0.29,
          },
        ],
        byDepartment: [{ departmentId: 'cse', name: 'CSE', utilisation: 0.1 }],
        redirects: [
          { from: 'gpu-1', fromName: 'GPU #1', to: 'gpu-2', toName: 'GPU #2', toLab: 'AI Lab' },
        ],
      },
    }));
    const { container } = render(<Dashboard />);
    expect(await screen.findByText('25%')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'GPU #1: 29% utilised' })).toBeTruthy();
    expect(screen.getByText(/point students to the idle/)).toBeTruthy();
    await expectAccessible(container);
  });

  it('lists upcoming bookings', async () => {
    mockApi(() => ({
      body: {
        bookings: [
          {
            id: 'b1',
            equipmentId: 'printer-1',
            userId: 'stu-a',
            date: '2026-11-24',
            startHour: 9,
            endHour: 11,
            requestId: 'req-1',
            equipment,
          },
        ],
      },
    }));
    const { container } = render(<MyBookings />);
    expect(await screen.findByText('Project allocation')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    await expectAccessible(container);
  });
});

describe('CampusMap', () => {
  it('lists departments accessibly and shows labs and equipment for the chosen one', async () => {
    const scope = {
      ...equipment,
      id: 'scope-1',
      name: 'Oscilloscope',
      category: 'Oscilloscope',
      labId: 'ece-elec',
      labName: 'Electronics Lab 2',
      departmentName: 'Electronics',
      location: 'Block B',
    };
    mockApi((url) =>
      url.includes('/availability')
        ? { body: { equipment: scope, now: { date: '2026-11-23', hour: 8 }, days: [] } }
        : {
            body: {
              items: [equipment, scope],
              categories: [],
              departments: [
                { id: 'mech', name: 'Mechanical Engineering' },
                { id: 'ece', name: 'Electronics & Communication' },
              ],
            },
          },
    );
    const user = userEvent.setup();
    const { container } = render(<CampusMap />);
    const ece = await screen.findByRole('button', { name: /Electronics & Communication/ });
    expect(ece.getAttribute('aria-pressed')).toBe('false');
    await user.click(ece);
    expect(ece.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'Electronics Lab 2' })).toBeTruthy();
    expect(screen.queryByText('3D Printer #1')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View slots for Oscilloscope' }));
    expect(await screen.findByRole('heading', { name: 'Oscilloscope' })).toBeTruthy();
    await expectAccessible(container);
  });
});
