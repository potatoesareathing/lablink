import { existsSync } from 'node:fs';
import path from 'node:path';
import { Assistant } from './ai/assistant.js';
import { GeminiClient } from './ai/llm.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createSeed } from './data/seed.js';
import { Store } from './data/store.js';
import { campusNow } from './lib/time.js';

const config = loadConfig();
const clock = () => campusNow(config.campusOffsetMinutes);

const store = new Store(createSeed(clock().date));
const llm = config.geminiApiKey ? new GeminiClient(config.geminiApiKey, config.geminiModel) : null;
const assistant = new Assistant(llm);

const defaultClientDir = path.resolve('dist/client');
const clientDir = config.clientDir ?? (existsSync(defaultClientDir) ? defaultClientDir : undefined);

const app = createApp({
  store,
  assistant,
  clock,
  sessionSecret: config.sessionSecret,
  secureCookies: config.isProduction,
  clientDir,
});

const server = app.listen(config.port, () => {
  console.info(
    `[lablink] listening on :${config.port} | AI ${llm ? `enabled (${config.geminiModel})` : 'disabled (fallback mode)'}`,
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
