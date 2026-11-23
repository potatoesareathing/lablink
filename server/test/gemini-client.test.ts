import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const list = vi.fn();

vi.mock('@google/genai', () => ({
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
  GoogleGenAI: class {
    models = { generateContent, list };
  },
}));

const { GeminiClient } = await import('../src/ai/llm.js');

const req = { system: 's', prompt: 'p', jsonSchema: { type: 'object' } };
const models = (...names: string[]) =>
  (async function* () {
    for (const n of names) yield { name: `models/${n}`, supportedActions: ['generateContent'] };
  })();

beforeEach(() => {
  generateContent.mockReset();
  list.mockReset();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('GeminiClient', () => {
  it('lists models, prefers Flash-Lite, and requests minimal thinking with JSON output', async () => {
    list.mockResolvedValue(models('gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-2.5-pro'));
    generateContent.mockResolvedValue({ text: '{"ok":true}' });
    const client = new GeminiClient('key', 'auto');
    await expect(client.generateJson(req)).resolves.toEqual({ ok: true });
    const call = generateContent.mock.calls[0]![0];
    expect(call.model).toBe('gemini-3.8-flash-lite');
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('fails over on overload and sticks with the model that worked', async () => {
    list.mockResolvedValue(models('gemini-3.8-flash', 'gemini-3.8-flash-lite'));
    generateContent
      .mockRejectedValueOnce(new Error('{"code":503,"status":"UNAVAILABLE"}'))
      .mockResolvedValue({ text: '{"n":1}' });
    const client = new GeminiClient('key', 'auto');
    await expect(client.generateJson(req)).resolves.toEqual({ n: 1 });
    await client.generateJson(req);
    const used = generateContent.mock.calls.map((c) => c[0].model);
    expect(used).toEqual(['gemini-3.8-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-flash']);
  });

  it('retries once without thinking controls when a model rejects them', async () => {
    list.mockResolvedValue(models('gemini-2.5-flash'));
    generateContent
      .mockRejectedValueOnce(new Error('{"code":400,"message":"thinking_level not supported"}'))
      .mockResolvedValue({ text: '{"a":1}' });
    const client = new GeminiClient('key', 'auto');
    await expect(client.generateJson(req)).resolves.toEqual({ a: 1 });
    expect(generateContent.mock.calls[1]![0].config.thinkingConfig).toBeUndefined();
  });

  it('does not retry non-retryable errors and rejects empty responses', async () => {
    list.mockResolvedValue(models('gemini-2.5-flash', 'gemini-2.5-flash-lite'));
    generateContent.mockRejectedValueOnce(new Error('{"code":400,"message":"bad schema"}'));
    const client = new GeminiClient('key', 'auto');
    await expect(client.generateJson(req)).rejects.toThrow(/bad schema/);
    expect(generateContent).toHaveBeenCalledTimes(1);

    generateContent.mockResolvedValue({ text: '' });
    await expect(client.generateJson(req)).rejects.toThrow(/Empty model response/);
  });

  it('uses a configured model when available and falls back when listing fails', async () => {
    list.mockResolvedValue(models('gemini-3.8-flash', 'my-model'));
    generateContent.mockResolvedValue({ text: '{}' });
    await new GeminiClient('key', 'my-model').generateJson(req);
    expect(generateContent.mock.calls[0]![0].model).toBe('my-model');

    generateContent.mockClear();
    list.mockRejectedValue(new Error('network down'));
    await new GeminiClient('key', 'auto').generateJson(req);
    expect(generateContent.mock.calls[0]![0].model).toBe('gemini-2.5-flash');
  });

  it('gives up after the attempt limit when every model is overloaded', async () => {
    list.mockResolvedValue(models('gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-2.5-flash'));
    generateContent.mockRejectedValue(new Error('503 high demand'));
    const client = new GeminiClient('key', 'auto', 1000, 2);
    await expect(client.generateJson(req)).rejects.toThrow(/high demand/);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});
