import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('auto'),
  SESSION_SECRET: z.string().min(16).optional(),
  CAMPUS_UTC_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(330),
  CLIENT_DIR: z.string().optional(),
});

export interface AppConfig {
  isProduction: boolean;
  port: number;
  geminiApiKey?: string;
  geminiModel: string;
  sessionSecret: string;
  campusOffsetMinutes: number;
  clientDir?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const e = parsed.data;
  if (!e.SESSION_SECRET) {
    console.warn(
      '[config] SESSION_SECRET not set - using an ephemeral secret (sessions reset on restart).',
    );
  }
  return {
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    geminiApiKey: e.GEMINI_API_KEY?.trim() || undefined,
    geminiModel: e.GEMINI_MODEL,
    sessionSecret: e.SESSION_SECRET ?? randomBytes(32).toString('hex'),
    campusOffsetMinutes: e.CAMPUS_UTC_OFFSET_MINUTES,
    clientDir: e.CLIENT_DIR,
  };
}
