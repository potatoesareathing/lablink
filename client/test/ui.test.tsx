// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Discover } from '../src/components/Discover';
import { PlanView } from '../src/components/PlanView';
import { CampusScene } from '../src/components/CampusScene';
import { SignIn } from '../src/components/SignIn';
import { StatusBadge } from '../src/components/ui';
import { formatHour, formatRange, percent } from '../src/format';
import type { Plan } from '../src/api';

const scope = {
  id: 'scope-1',
  name: 'Digital Oscilloscope #1',
  category: 'Oscilloscope',
  equivalentGroup: 'scope',
  labId: 'ece-elec',
  departmentId: 'ece',
  specs: '4-ch 200 MHz',
  tags: ['signal'],
  status: 'available',
  labName: 'Electronics Lab 2',
  departmentName: 'Electronics & Communication',
  location: 'Block B',
};

type Route = (url: string, init?: RequestInit) => unknown;

function mockFetch(route: Route) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = route(url, init);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

/** Runs axe-core WCAG checks (colour contrast is verified manually: jsdom has no layout). */
async function expectAccessible(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SignIn', () => {
  it('lists student and faculty personas and is accessible', async () => {
    mockFetch(() => ({
      users: [
        { id: 'stu-a', name: 'Asha', role: 'student', department: 'CSE' },
        { id: 'fac-b', name: 'Dr. Bose', role: 'faculty', department: 'ECE' },
      ],
    }));
    const { container } = render(<SignIn onSignedIn={() => undefined} />);
    expect(await screen.findByRole('button', { name: /Asha/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /faculty/i })).toBeTruthy();
    await expectAccessible(container);
  });
});

describe('Discover', () => {
  it('runs a natural-language search and shows AI-ranked matches with reasons', async () => {
    mockFetch((url) =>
      url.includes('/ai/search')
        ? {
            source: 'ai',
            matches: [{ equipment: scope, reason: 'Measures signal noise precisely' }],
          }
        : {
            items: [scope],
            categories: ['Oscilloscope'],
            departments: [{ id: 'ece', name: 'Electronics & Communication' }],
          },
    );
    const user = userEvent.setup();
    const { container } = render(<Discover aiEnabled />);
    await screen.findByLabelText('1 equipment items');

    await user.type(screen.getByLabelText('Describe what you need'), 'measure noise on my sensor');
    await user.click(screen.getByRole('button', { name: 'Find equipment' }));

    expect(await screen.findByText('Measures signal noise precisely')).toBeTruthy();
    expect(screen.getAllByText(/match/).length).toBeGreaterThan(0);
    await expectAccessible(container);
  });

  it('shows an error message when the catalogue fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Server down' } }), { status: 500 }),
      ),
    );
    render(<Discover aiEnabled={false} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Server down'));
  });
});

describe('PlanView', () => {
  it('renders ranked allocations with outcomes and explanations', async () => {
    const plan: Plan = {
      generatedAt: '2026-11-23T10:00:00Z',
      summary: '1 of 2 requests fully allocated.',
      source: 'template',
      results: [
        {
          requestId: 'r1',
          studentId: 's1',
          studentName: 'Asha',
          projectTitle: 'Drone frame',
          deadline: '2026-11-24',
          priority: 0.9,
          outcome: 'allocated',
          hoursGranted: 2,
          hoursNeeded: 2,
          reasons: ['URGENT_DEADLINE'],
          slots: [],
          explanation: 'Asha receives all 2 h because the deadline is very close.',
          ranges: [
            {
              equipmentId: 'p1',
              equipmentName: 'Printer',
              labName: 'Fab Lab',
              date: '2026-11-23',
              startHour: 9,
              endHour: 11,
            },
          ],
        },
        {
          requestId: 'r2',
          studentId: 's2',
          studentName: 'Ben',
          projectTitle: 'Grip',
          deadline: '2026-11-26',
          priority: 0.4,
          outcome: 'waitlisted',
          hoursGranted: 0,
          hoursNeeded: 4,
          reasons: ['INSUFFICIENT_CAPACITY'],
          slots: [],
          explanation: 'Ben is waitlisted.',
          ranges: [],
        },
      ],
    };
    const { container } = render(<PlanView plan={plan} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('#1 Asha');
    expect(screen.getByText('Fully allocated')).toBeTruthy();
    expect(screen.getByText('Waitlisted')).toBeTruthy();
    await expectAccessible(container);
  });
});

describe('CampusScene', () => {
  it('renders a decorative, screen-reader-hidden container and degrades without WebGL', () => {
    const { container } = render(<CampusScene />);
    const host = container.querySelector('.campus-scene');
    expect(host?.getAttribute('aria-hidden')).toBe('true');
    expect(host?.querySelector('canvas')).toBeNull(); // jsdom has no WebGL
  });
});

describe('presentation helpers', () => {
  it('status badges carry a text label, not colour alone', () => {
    render(<StatusBadge status="partial" />);
    expect(screen.getByText(/Partially approved/)).toBeTruthy();
  });

  it('formats hours, ranges and percentages', () => {
    expect(formatHour(9)).toBe('09:00');
    expect(formatRange('2026-11-23', 9, 11)).toMatch(/23 Nov, 09:00–11:00/);
    expect(percent(0.456)).toBe('46%');
  });
});
