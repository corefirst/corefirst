import { describe, it, expect } from 'vitest';
import { trySalvage } from '@/src/generator/orchestrator';

// The orchestrator falls back to trySalvage() when the AI SDK can't parse
// `generateObject`'s raw text. Weaker JSON-mode models (gpt-oss on Ollama
// Cloud, etc.) routinely wrap their output in markdown fences or the
// `{ "CoursewareManifest": {...} }` self-wrap. trySalvage rescues both.

const VALID_MANIFEST = {
  age_group: 'Adult / Professional',
  industry_context: 'IT / Software Engineering',
  topic: 'Deploy a microservice',
  lessons: [
    {
      title: 'Production deploy',
      scenario_description: 'Engineer rolling out a service.',
      vocabulary_focus: [{ token: 'deploy', meaning: '部署' }],
      visual_generation_prompts: ['A whiteboard with a deploy diagram'],
      cflt_scripts: [
        {
          speaker: 'Engineer',
          cflt_l1: 'Deploy the service because traffic spiked, on prod, today.',
          cflt_l2: '部署 服务 因为 流量 上升 在 生产 今天',
          standard_l2: '由于流量上升，今天在生产环境部署服务。',
          ssml: '<speak>由于流量上升，今天在生产环境部署服务。</speak>',
        },
      ],
    },
  ],
};

const VALID_JSON = JSON.stringify(VALID_MANIFEST);

describe('trySalvage', () => {
  it('returns null on empty input', () => {
    expect(trySalvage('')).toBeNull();
    expect(trySalvage('   ')).toBeNull();
  });

  it('parses already-clean JSON the SDK happened to reject', () => {
    const result = trySalvage(VALID_JSON);
    expect(result).not.toBeNull();
    expect(result?.lessons[0].title).toBe('Production deploy');
  });

  it('strips ```json fences', () => {
    const wrapped = '```json\n' + VALID_JSON + '\n```';
    const result = trySalvage(wrapped);
    expect(result).not.toBeNull();
    expect(result?.topic).toBe('Deploy a microservice');
  });

  it('strips bare ``` fences', () => {
    const wrapped = '```\n' + VALID_JSON + '\n```';
    const result = trySalvage(wrapped);
    expect(result).not.toBeNull();
  });

  it('strips leading prose before the JSON', () => {
    const wrapped = "Sure! Here's your manifest:\n" + VALID_JSON;
    const result = trySalvage(wrapped);
    expect(result).not.toBeNull();
    expect(result?.industry_context).toBe('IT / Software Engineering');
  });

  it('unwraps `{ "CoursewareManifest": {...} }` self-wrap', () => {
    const wrapped = JSON.stringify({ CoursewareManifest: VALID_MANIFEST });
    const result = trySalvage(wrapped);
    expect(result).not.toBeNull();
    expect(result?.lessons[0].cflt_scripts[0].speaker).toBe('Engineer');
  });

  it('unwraps the self-wrap inside markdown fences', () => {
    const wrapped = '```json\n' + JSON.stringify({ CoursewareManifest: VALID_MANIFEST }) + '\n```';
    const result = trySalvage(wrapped);
    expect(result).not.toBeNull();
  });

  it('returns null when the shape is irrecoverably wrong (flat scripts)', () => {
    // The actual gpt-oss output we saw — top-level `scripts` instead of
    // `lessons[*].cflt_scripts`. Salvage cannot infer the missing nesting.
    const garbage = JSON.stringify({
      manifestVersion: '1.0',
      title: 'IT lesson',
      scripts: [VALID_MANIFEST.lessons[0].cflt_scripts[0]],
    });
    expect(trySalvage(garbage)).toBeNull();
  });

  it('returns null on non-JSON text', () => {
    expect(trySalvage('Sorry, I cannot do that.')).toBeNull();
  });

  it('backfills the optional ssml field via the schema default', () => {
    // Drop `ssml` to confirm the schema default kicks in through salvage.
    const noSsml = {
      ...VALID_MANIFEST,
      lessons: [
        {
          ...VALID_MANIFEST.lessons[0],
          cflt_scripts: [
            (() => {
              const s = { ...VALID_MANIFEST.lessons[0].cflt_scripts[0] } as Record<string, unknown>;
              delete s.ssml;
              return s;
            })(),
          ],
        },
      ],
    };
    const result = trySalvage(JSON.stringify(noSsml));
    expect(result).not.toBeNull();
    expect(result?.lessons[0].cflt_scripts[0].ssml).toBe('');
  });
});
