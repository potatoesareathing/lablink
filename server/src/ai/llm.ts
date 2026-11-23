import { GoogleGenAI } from '@google/genai';

/** Minimal contract the app needs from a language model; easy to mock in tests. */
export interface LlmClient {
  /** Returns parsed JSON matching `jsonSchema`, or throws. */
  generateJson(req: { system: string; prompt: string; jsonSchema: object }): Promise<unknown>;
}

export class GeminiClient implements LlmClient {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 10_000,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateJson(req: {
    system: string;
    prompt: string;
    jsonSchema: object;
  }): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: req.prompt,
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: req.jsonSchema,
          temperature: 0.2,
          maxOutputTokens: 1024,
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
