import type { Assistant } from './ai/assistant.js';
import type { Store } from './data/store.js';
import type { CampusClock } from './lib/time.js';

/** Everything route handlers need; injected so tests can control time, data and AI. */
export interface AppDeps {
  store: Store;
  assistant: Assistant;
  clock: () => CampusClock;
  sessionSecret: string;
  secureCookies: boolean;
  clientDir?: string;
}
