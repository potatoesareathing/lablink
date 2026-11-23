/**
 * Structured-output contracts for each AI task. `json` is sent to Gemini as the
 * response schema; `zod` re-validates whatever comes back before it is used.
 */
import { z } from 'zod';

export interface OutputSchema<T> {
  json: object;
  zod: z.ZodType<T>;
}

const str = { type: 'string' } as const;

export const SEARCH_SCHEMA = {
  json: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            equipmentId: str,
            reason: { type: 'string', description: 'One short sentence on why it fits the need' },
          },
          required: ['equipmentId', 'reason'],
        },
      },
    },
    required: ['matches'],
  },
  zod: z.object({
    matches: z.array(z.object({ equipmentId: z.string(), reason: z.string().max(400) })).max(10),
  }),
} satisfies OutputSchema<unknown>;

export const DRAFT_SCHEMA = {
  json: {
    type: 'object',
    properties: {
      projectTitle: str,
      description: str,
      equipmentId: str,
      hoursNeeded: { type: 'integer' },
      rationale: str,
    },
    required: ['projectTitle', 'description', 'equipmentId', 'hoursNeeded', 'rationale'],
  },
  zod: z.object({
    projectTitle: z.string().min(3).max(100),
    description: z.string().min(10).max(1000),
    equipmentId: z.string(),
    hoursNeeded: z.number().int().min(1).max(40),
    rationale: z.string().max(400),
  }),
} satisfies OutputSchema<unknown>;

export const SUMMARY_SCHEMA = {
  json: { type: 'object', properties: { summary: str }, required: ['summary'] },
  zod: z.object({ summary: z.string().min(5).max(600) }),
} satisfies OutputSchema<unknown>;

export const EXPLAIN_SCHEMA = {
  json: {
    type: 'object',
    properties: {
      summary: str,
      explanations: {
        type: 'array',
        items: {
          type: 'object',
          properties: { requestId: str, text: str },
          required: ['requestId', 'text'],
        },
      },
    },
    required: ['summary', 'explanations'],
  },
  zod: z.object({
    summary: z.string().max(800),
    explanations: z.array(z.object({ requestId: z.string(), text: z.string().max(500) })),
  }),
} satisfies OutputSchema<unknown>;

export type RequestDraft = z.infer<typeof DRAFT_SCHEMA.zod> & { source: 'ai' | 'heuristic' };
