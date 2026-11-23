import type { AccessRequest, Booking, Equipment, User } from '../../shared/types.js';
import { Assistant } from '../src/ai/assistant.js';
import type { LlmClient } from '../src/ai/llm.js';
import { createApp } from '../src/app.js';
import { createSeed } from '../src/data/seed.js';
import { Store } from '../src/data/store.js';
import type { CampusClock } from '../src/lib/time.js';

/** Monday 23 Nov 2026, 08:00 campus time - before labs open. */
export const NOW: CampusClock = { date: '2026-11-23', hour: 8 };

export const unit = (
  id: string,
  group: string,
  labId = 'lab-a',
  status: Equipment['status'] = 'available',
): Equipment => ({
  id,
  name: id,
  category: group,
  equivalentGroup: group,
  labId,
  specs: '',
  tags: [],
  status,
});

export const student = (id: string, recentDenials = 0): User => ({
  id,
  name: id,
  role: 'student',
  departmentId: 'cse',
  recentDenials,
});

export const req = (
  id: string,
  studentId: string,
  equipmentId: string,
  hoursNeeded: number,
  deadline: string,
  submittedAt = '2026-11-20T10:00:00Z',
): AccessRequest => ({
  id,
  studentId,
  equipmentId,
  hoursNeeded,
  deadline,
  submittedAt,
  projectTitle: id,
  description: 'test request description',
  status: 'pending',
});

export const booking = (
  equipmentId: string,
  userId: string,
  date: string,
  startHour: number,
  endHour: number,
): Booking => ({
  id: `${equipmentId}-${date}-${startHour}`,
  equipmentId,
  userId,
  date,
  startHour,
  endHour,
});

export function testApp(llm: LlmClient | null = null) {
  const store = new Store(createSeed(NOW.date));
  const app = createApp({
    store,
    assistant: new Assistant(llm),
    clock: () => NOW,
    sessionSecret: 'test-secret-test-secret',
    secureCookies: false,
  });
  return { app, store };
}
