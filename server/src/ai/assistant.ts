/**
 * GenAI features. Every method validates model output (schemas.ts), checks any ids
 * against real data, and degrades to a deterministic fallback (fallbacks.ts) on any
 * failure, so the platform never depends on the model being available or well-behaved.
 */
import type { EquipmentView, SearchResponse } from '../../../shared/types.js';
import { keywordSearch } from '../services/catalog.js';
import { heuristicDraft, templatePlan, templateSummary } from './fallbacks.js';
import type { LlmClient } from './llm.js';
import { TtlCache } from './llm.js';
import {
  SYSTEM_BASE,
  TASKS,
  catalogPrompt,
  planFacts,
  sanitize,
  summaryPrompt,
} from './prompts.js';
import { DRAFT_SCHEMA, EXPLAIN_SCHEMA, SEARCH_SCHEMA, SUMMARY_SCHEMA } from './schemas.js';
import type { OutputSchema, RequestDraft } from './schemas.js';
import type { PlanContext, PlanExplanation, RequestSummaryContext, TextSource } from './types.js';

export { templateExplanation } from './fallbacks.js';
export type { RequestDraft } from './schemas.js';
export type { PlanContext, RequestSummaryContext } from './types.js';

const MAX_SEARCH_MATCHES = 6;

export class Assistant {
  private readonly cache = new TtlCache<unknown>();

  constructor(private readonly llm: LlmClient | null) {}

  get enabled(): boolean {
    return this.llm !== null;
  }

  /** Calls the model with a cache; returns validated output or null on any failure. */
  private async ask<T>(
    cacheKey: string,
    task: string,
    prompt: string,
    schema: OutputSchema<T>,
  ): Promise<T | null> {
    if (!this.llm) return null;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached as T;
    try {
      const raw = await this.llm.generateJson({
        system: `${SYSTEM_BASE}\n${task}`,
        prompt,
        jsonSchema: schema.json,
      });
      const parsed = schema.zod.safeParse(raw);
      if (!parsed.success) return null;
      this.cache.set(cacheKey, parsed.data);
      return parsed.data;
    } catch (err) {
      console.warn('[ai] falling back:', err instanceof Error ? err.message : 'unknown error');
      return null;
    }
  }

  /** Natural-language equipment discovery; ids are verified against the catalogue. */
  async searchEquipment(query: string, catalog: EquipmentView[]): Promise<SearchResponse> {
    const q = sanitize(query, 300);
    const ai = await this.ask(
      `search:${q.toLowerCase()}`,
      TASKS.search,
      catalogPrompt(catalog, q),
      SEARCH_SCHEMA,
    );
    const byId = new Map(catalog.map((e) => [e.id, e]));
    const matches = (ai?.matches ?? [])
      .filter((m) => byId.has(m.equipmentId))
      .slice(0, MAX_SEARCH_MATCHES)
      .map((m) => ({ equipment: byId.get(m.equipmentId)!, reason: sanitize(m.reason, 200) }));
    return matches.length > 0
      ? { source: 'ai', matches }
      : { source: 'keyword', matches: keywordSearch(catalog, q) };
  }

  /** Turns a rough idea into a structured, editable access request. */
  async draftRequest(idea: string, catalog: EquipmentView[]): Promise<RequestDraft> {
    const text = sanitize(idea, 800);
    const ai = await this.ask(
      `draft:${text.toLowerCase()}`,
      TASKS.draft,
      catalogPrompt(catalog, text),
      DRAFT_SCHEMA,
    );
    if (!ai || !catalog.some((e) => e.id === ai.equipmentId)) return heuristicDraft(text, catalog);
    return {
      ...ai,
      projectTitle: sanitize(ai.projectTitle, 100),
      description: sanitize(ai.description, 1000),
      source: 'ai',
    };
  }

  /** Short faculty summary; deterministic risk flags are always computed separately. */
  async summarizeRequest(
    ctx: RequestSummaryContext,
  ): Promise<{ summary: string; source: TextSource }> {
    const prompt = summaryPrompt(ctx);
    const ai = await this.ask(`summary:${prompt}`, TASKS.summary, prompt, SUMMARY_SCHEMA);
    return ai
      ? { summary: sanitize(ai.summary, 600), source: 'ai' }
      : { summary: templateSummary(ctx), source: 'template' };
  }

  /** Plain-language explanation of an already-decided allocation plan. */
  async explainPlan(items: PlanContext[]): Promise<PlanExplanation> {
    const facts = planFacts(items);
    const ai = await this.ask(`explain:${facts}`, TASKS.explain, facts, EXPLAIN_SCHEMA);
    if (!ai) return templatePlan(items);
    const known = new Set(items.map((i) => i.result.requestId));
    const explanations = new Map(
      ai.explanations
        .filter((e) => known.has(e.requestId))
        .map((e) => [e.requestId, sanitize(e.text, 400)]),
    );
    // Only trust the AI version if it explains every request.
    return explanations.size === items.length
      ? { summary: sanitize(ai.summary, 800), explanations, source: 'ai' }
      : templatePlan(items);
  }
}
