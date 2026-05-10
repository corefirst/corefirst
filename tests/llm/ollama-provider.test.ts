import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateText } from 'ai';

// The Ollama text provider wraps `ollama-ai-provider-v2`. v2 expects baseURL
// to already include `/api` (it dispatches `${baseURL}/chat`). Our wrapper
// accepts the conventional host-only form (`http://host:11434`) and normalizes
// it to `${host}/api`, while leaving `${host}/api` and trailing slashes alone.
//
// We assert on the URL `fetch` is called with — that's what the SDK actually
// hits — rather than poking at the wrapper's internals. Response is a minimal
// non-streaming Ollama chat reply so generateText() resolves cleanly.

const OLLAMA_RESPONSE = {
  model: 'test-model',
  created_at: new Date().toISOString(),
  message: { role: 'assistant', content: 'ok' },
  done: true,
  done_reason: 'stop',
  total_duration: 1,
  prompt_eval_count: 1,
  eval_count: 1,
};

function mockFetch() {
  const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(OLLAMA_RESPONSE), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

const SAVED_BASE_URL = process.env.OLLAMA_BASE_URL;

beforeEach(() => {
  delete process.env.OLLAMA_BASE_URL;
  vi.resetModules();
});

afterEach(() => {
  if (SAVED_BASE_URL === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = SAVED_BASE_URL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function callOllama() {
  const { ollamaTextModel } = await import('@/src/lib/ai/text/sdk/ollama');
  const model = ollamaTextModel('llama3');
  await generateText({ model, prompt: 'ping' });
}

function urlOf(spy: ReturnType<typeof mockFetch>): string {
  expect(spy).toHaveBeenCalled();
  const arg = spy.mock.calls[0]![0];
  if (typeof arg === 'string') return arg;
  if (arg instanceof URL) return arg.toString();
  return (arg as Request).url;
}

describe('ollamaTextModel — OLLAMA_BASE_URL normalization', () => {
  it('defaults to http://localhost:11434/api/chat when env is unset', async () => {
    const spy = mockFetch();
    await callOllama();
    expect(urlOf(spy)).toBe('http://localhost:11434/api/chat');
  });

  it('appends /api when env is host-only (the regression we fixed)', async () => {
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    const spy = mockFetch();
    await callOllama();
    expect(urlOf(spy)).toBe('http://localhost:11434/api/chat');
  });

  it('does not double-append /api when env already includes it', async () => {
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/api';
    const spy = mockFetch();
    await callOllama();
    expect(urlOf(spy)).toBe('http://localhost:11434/api/chat');
  });

  it('strips trailing slash before appending /api', async () => {
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/';
    const spy = mockFetch();
    await callOllama();
    expect(urlOf(spy)).toBe('http://localhost:11434/api/chat');
  });

  it('strips trailing slash on a /api/-suffixed value', async () => {
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/api/';
    const spy = mockFetch();
    await callOllama();
    expect(urlOf(spy)).toBe('http://localhost:11434/api/chat');
  });

  it('respects a custom host and port', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama.internal:9999';
    const spy = mockFetch();
    await callOllama();
    expect(urlOf(spy)).toBe('http://ollama.internal:9999/api/chat');
  });
});

describe('ollamaTextModel — request shape', () => {
  it('POSTs JSON body containing the model id and prompt', async () => {
    const spy = mockFetch();
    await callOllama();
    const init = spy.mock.calls[0]![1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    const body = typeof init?.body === 'string' ? init.body : '';
    const parsed = JSON.parse(body);
    expect(parsed.model).toBe('llama3');
    expect(parsed.stream).toBe(false);
    // prompt becomes a chat message; assert at least the user content survives.
    const flat = JSON.stringify(parsed);
    expect(flat).toContain('ping');
  });
});
