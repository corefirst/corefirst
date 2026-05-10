import { describe, it, expect, beforeAll } from 'vitest';

// E2E test for the local AI stack:
//   - Kokoro-FastAPI (TTS)         http://localhost:8880/v1
//   - faster-whisper-server (STT)  http://localhost:8000/v1
//
// Run with: `pnpm test:e2e`
// Requires services up — bring them up first with `docker compose up -d`.
//
// Tests verify CoreFirst's openai-provider façade can talk to OpenAI-
// compatible local servers via <FEATURE>_BASE_URL. They DO hit real
// services and DO return real audio bytes / transcribed text.

const KOKORO_URL = process.env.E2E_KOKORO_URL ?? 'http://localhost:8880/v1';
const FWHISPER_URL = process.env.E2E_FWHISPER_URL ?? 'http://localhost:8000/v1';

let kokoroUp = false;
let fwhisperUp = false;
let warmedUp = false;

beforeAll(async () => {
  kokoroUp = await probe(`${KOKORO_URL}/models`);
  fwhisperUp = await probe(`${FWHISPER_URL}/models`);

  if (!kokoroUp || !fwhisperUp) {
    const status = `Kokoro: ${kokoroUp ? 'up' : 'DOWN'}, faster-whisper: ${fwhisperUp ? 'up' : 'DOWN'}`;
    console.warn(
      `\n[e2e] Local stack not fully reachable (${status}). ` +
        `Start it with \`docker compose up -d\` and retry.\n`,
    );
    return;
  }

  // Warm up the STT model. faster-whisper-server lazy-loads the model on
  // first request (~30-60 s for Large-v3). Hitting it once in beforeAll
  // (with hookTimeout=5min) keeps individual test cases fast.
  console.log('[e2e] warming up faster-whisper (first call may take 30-60s)…');
  const warmupAudio = await synthesize('warm up');
  if (warmupAudio) {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(warmupAudio)], { type: 'audio/mpeg' }),
      'warmup.mp3',
    );
    formData.append('model', 'Systran/faster-whisper-large-v3');
    try {
      const r = await fetch(`${FWHISPER_URL}/audio/transcriptions`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(180_000),
      });
      warmedUp = r.ok;
      if (!r.ok) console.warn(`[e2e] warmup non-OK: ${r.status} ${await r.text()}`);
    } catch (err) {
      console.warn(`[e2e] warmup failed: ${(err as Error).message}`);
    }
  }
});

async function synthesize(text: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(`${KOKORO_URL}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice: 'af_sky',
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function probe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

function configureTts() {
  process.env.TTS_PROVIDER = 'openai';
  process.env.TTS_MODEL = 'kokoro';
  process.env.TTS_BASE_URL = KOKORO_URL;
  process.env.TTS_API_KEY = 'no-key-needed';
  process.env.TTS_VOICE = 'af_sky';
}

function configureStt() {
  process.env.STT_PROVIDER = 'openai';
  process.env.STT_MODEL = 'Systran/faster-whisper-large-v3';
  process.env.STT_BASE_URL = FWHISPER_URL;
  process.env.STT_API_KEY = 'no-key-needed';
}

async function freshAi() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('@/src/lib/ai');
}

describe('E2E: TTS via Kokoro-FastAPI', () => {
  it('synthesizes audio for a short prompt', async () => {
    if (!kokoroUp) return;

    configureTts();
    const { ttsModel } = await freshAi();
    const { experimental_generateSpeech: generateSpeech } = await import('ai');

    const { audio } = await generateSpeech({
      model: ttsModel,
      text: 'Hello world from CoreFirst.',
      voice: 'af_sky',
    });

    expect(audio.uint8Array).toBeInstanceOf(Uint8Array);
    expect(audio.uint8Array.byteLength).toBeGreaterThan(1024); // not an error response
    // Kokoro-FastAPI returns MP3 by default. MP3 frames start with 0xFF 0xFB
    // (or 0xFF 0xF3 / 0xF2). ID3 tag prefix is 'ID3'. Either is acceptable.
    const head = audio.uint8Array.slice(0, 3);
    const isMp3 = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
    const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
    const isWav = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46; // RIFF
    const isOgg = head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67;
    expect(isMp3 || isId3 || isWav || isOgg).toBe(true);
  });
});

describe('E2E: STT via faster-whisper-server', () => {
  it('transcribes a short audio clip back to text', async () => {
    if (!kokoroUp || !fwhisperUp || !warmedUp) return;

    // Generate a known utterance via TTS first so the test has a fresh,
    // deterministic audio fixture.
    configureTts();
    const tts = await freshAi();
    const { experimental_generateSpeech: generateSpeech, experimental_transcribe: transcribe } =
      await import('ai');

    const expected = 'Hello world.';
    const { audio } = await generateSpeech({
      model: tts.ttsModel,
      text: expected,
      voice: 'af_sky',
    });

    // Now switch the AI module's process.env to STT config and re-import so
    // sttModel is rebuilt against faster-whisper-server.
    configureStt();
    const stt = await freshAi();

    const { text } = await transcribe({
      model: stt.sttModel,
      audio: audio.uint8Array,
    });

    expect(text).toBeTruthy();
    // Whisper may render this as "Hello world." or "Hello, world." or with
    // trailing punctuation variations. Match the lowercased word-only form.
    const normalized = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
    expect(normalized).toContain('hello');
    expect(normalized).toContain('world');
  });
});

describe('E2E: TTS → STT round-trip preserves content', () => {
  it('round-trips a longer sentence', async () => {
    if (!kokoroUp || !fwhisperUp || !warmedUp) return;

    const sentence = 'The cat sat on the mat by the window.';

    configureTts();
    const tts = await freshAi();
    const { experimental_generateSpeech: generateSpeech, experimental_transcribe: transcribe } =
      await import('ai');

    const { audio } = await generateSpeech({
      model: tts.ttsModel,
      text: sentence,
      voice: 'af_sky',
    });

    configureStt();
    const stt = await freshAi();

    const { text } = await transcribe({
      model: stt.sttModel,
      audio: audio.uint8Array,
    });

    const normalized = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
    // All content words should make it through.
    for (const word of ['cat', 'sat', 'mat', 'window']) {
      expect(normalized).toContain(word);
    }
  });
});
