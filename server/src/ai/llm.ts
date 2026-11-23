import { GoogleGenAI } from '@google/genai';

/** Minimal contract the app needs from a language model; easy to mock in tests. */
export interface LlmClient {
  /** Returns parsed JSON matching `jsonSchema`, or throws. */
  generateJson(req: { system: string; prompt: string; jsonSchema: object }): Promise<unknown>;
}

const SPECIALISED = /(tts|image|live|audio|embedding|thinking|exp|preview|computer|robotics)/;
const version = (name: string) => Number(/^gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 0);

/**
 * Orders usable Flash models for failover: newest general Flash first, then the newest
 * Flash-Lite (fast, rarely overloaded), then older Flash/Flash-Lite versions.
 */
export function rankFlashModels(available: string[]): string[] {
  const flash = available.filter((n) => /^gemini-[\d.]+-flash/.test(n) && !SPECIALISED.test(n));
  const byVersion = (a: string, b: string) =>
    version(b) - version(a) || a.length - b.length || a.localeCompare(b);
  const full = flash.filter((n) => !n.includes('lite')).sort(byVersion);
  const lite = flash.filter((n) => n.includes('lite')).sort(byVersion);
  const ordered = [full[0], lite[0], ...full.slice(1), ...lite.slice(1)];
  return [...new Set(ordered.filter((n): n is string => !!n))].slice(0, 4);
}

/** Newest general-purpose Flash model, if any. */
export const pickFlashModel = (available: string[]): string | undefined =>
  rankFlashModels(available).find((n) => !n.includes('lite'));

/** Overload, quota and timeout errors are worth retrying on another model. */
export function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|500|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|abort/i.test(
    msg,
  );
}

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

export class GeminiClient implements LlmClient {
  private readonly ai: GoogleGenAI;
  private modelsPromise?: Promise<string[]>;
  /** Mutable failover order; the last model that succeeded is kept first. */
  private order: string[] = [];

  /** @param model a model id, or "auto" to choose from the models the key can use. */
  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 9_000,
    private readonly maxAttempts = 3,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /** Lists available models once and builds the failover order. */
  private resolveModels(): Promise<string[]> {
    this.modelsPromise ??= (async () => {
      try {
        const names: string[] = [];
        const pager = await this.ai.models.list({ config: { pageSize: 100 } });
        for await (const m of pager) {
          if (m.name && (m.supportedActions ?? ['generateContent']).includes('generateContent')) {
            names.push(m.name.replace(/^models\//, ''));
          }
          if (names.length > 300) break;
        }
        const ranked = rankFlashModels(names);
        const preferred = this.model !== 'auto' && names.includes(this.model) ? [this.model] : [];
        const order = [...new Set([...preferred, ...ranked])];
        console.info(`[ai] model failover order: ${order.join(' > ')}`);
        return order.length ? order : FALLBACK_MODELS;
      } catch (err) {
        console.warn('[ai] model listing failed:', err instanceof Error ? err.message : err);
        this.modelsPromise = undefined; // retry listing on the next call
        return this.model === 'auto' ? FALLBACK_MODELS : [this.model];
      }
    })();
    return this.modelsPromise;
  }

  private async callModel(
    model: string,
    req: { system: string; prompt: string; jsonSchema: object },
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: req.prompt,
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: req.jsonSchema,
          temperature: 0.2,
          // Generous limit: newer models may spend part of the budget on internal reasoning.
          maxOutputTokens: 8192,
          abortSignal: controller.signal,
        },
      });
      const text = response.text;
      if (!text) throw new Error('Empty model response');
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  async generateJson(req: {
    system: string;
    prompt: string;
    jsonSchema: object;
  }): Promise<unknown> {
    if (this.order.length === 0) this.order = [...(await this.resolveModels())];
    let lastError: unknown;
    for (const model of this.order.slice(0, this.maxAttempts)) {
      try {
        const result = await this.callModel(model, req);
        // Stick with the model that worked.
        this.order = [model, ...this.order.filter((m) => m !== model)];
        return result;
      } catch (err) {
        lastError = err;
        if (!isRetryable(err)) throw err;
        console.warn(`[ai] ${model} unavailable, trying next model`);
        this.order = [...this.order.filter((m) => m !== model), model];
      }
    }
    throw lastError instanceof Error ? lastError : new Error('All models unavailable');
  }
}

/** Small TTL + size-bounded cache so identical AI prompts are not paid for twice. */
export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly maxEntries = 200,
    private readonly ttlMs = 10 * 60_000,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}
