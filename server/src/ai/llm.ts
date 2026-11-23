import { GoogleGenAI } from '@google/genai';

/** Minimal contract the app needs from a language model; easy to mock in tests. */
export interface LlmClient {
  /** Returns parsed JSON matching `jsonSchema`, or throws. */
  generateJson(req: { system: string; prompt: string; jsonSchema: object }): Promise<unknown>;
}

/**
 * Picks the newest general-purpose Flash model from the names the API key can use,
 * skipping specialised variants (lite, TTS, image, live, embeddings).
 */
export function pickFlashModel(available: string[]): string | undefined {
  const version = (name: string) => Number(/^gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 0);
  return available
    .filter((n) => /^gemini-[\d.]+-flash/.test(n))
    .filter((n) => !/(lite|tts|image|live|audio|embedding|thinking|exp)/.test(n))
    .sort((a, b) => version(b) - version(a) || a.length - b.length || a.localeCompare(b))[0];
}

export class GeminiClient implements LlmClient {
  private readonly ai: GoogleGenAI;
  private modelPromise?: Promise<string>;

  /** @param model a model id, or "auto" to pick the newest Flash model at first use. */
  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 20_000,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /** Resolves the model once: uses the configured id if available, else the best Flash model. */
  private resolveModel(): Promise<string> {
    this.modelPromise ??= (async () => {
      try {
        const names: string[] = [];
        const pager = await this.ai.models.list({ config: { pageSize: 100 } });
        for await (const m of pager) {
          if (m.name && (m.supportedActions ?? ['generateContent']).includes('generateContent')) {
            names.push(m.name.replace(/^models\//, ''));
          }
          if (names.length > 300) break;
        }
        if (this.model !== 'auto' && names.includes(this.model)) return this.model;
        const picked = pickFlashModel(names) ?? this.model;
        console.info(`[ai] using model ${picked}`);
        return picked;
      } catch (err) {
        console.warn('[ai] model listing failed:', err instanceof Error ? err.message : err);
        this.modelPromise = undefined; // retry on next call
        return this.model === 'auto' ? 'gemini-2.5-flash' : this.model;
      }
    })();
    return this.modelPromise;
  }

  async generateJson(req: {
    system: string;
    prompt: string;
    jsonSchema: object;
  }): Promise<unknown> {
    const model = await this.resolveModel();
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
