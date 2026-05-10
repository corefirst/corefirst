import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoursewareOrchestrator } from '../src/generator/orchestrator';

// Mock the Vercel AI SDK's generateObject so the test runs without network /
// API keys. The orchestrator and the transformer it composes both call into
// `generateObject` from the `ai` package.
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from 'ai';

const childManifest = {
  age_group: 'Child (Age 8)',
  industry_context: 'General',
  topic: 'At the Zoo',
  lessons: [
    {
      title: 'Funny Monkeys',
      scenario_description: 'Looking at monkeys jumping around.',
      cflt_scripts: [
        {
          speaker: 'Guide',
          cflt_l1: '看，那些猴子正在跳，在树上。',
          cflt_l2: 'Look, those monkeys are jumping, on the trees.',
          standard_l2: 'Look at those monkeys jumping in the trees!',
          ssml: "<prosody pitch='+15%'>Look, those monkeys are jumping</prosody> <break time='400ms'/> on the trees.",
        },
      ],
      visual_generation_prompts: ['A cartoon zoo with happy monkeys'],
      vocabulary_focus: [{ token: 'Monkey', meaning: '猴子' }],
    },
  ],
};

const childAudit = {
  is_cflt_compliant: true,
  cflt_l1: '看，那些猴子正在跳，在树上。',
  cflt_l2: 'Look, those monkeys are jumping, on the trees.',
  standard_l2: 'Look at those monkeys jumping in the trees!',
  standard_l1: '看那些在树上跳跃的猴子！',
  corrections: [],
};

const proManifest = {
  age_group: 'Professional',
  industry_context: 'Business',
  topic: 'Contract Negotiation',
  lessons: [
    {
      title: 'Closing the Deal',
      scenario_description: 'Negotiating final terms of a merger.',
      cflt_scripts: [
        {
          speaker: 'CEO',
          cflt_l1: '我们签署这份合同，今天。',
          cflt_l2: 'We sign this contract, today.',
          standard_l2: 'We will sign this contract today.',
          ssml: "<prosody pitch='+10%'>We sign this contract</prosody> <break time='400ms'/> today.",
        },
      ],
      visual_generation_prompts: ['A formal boardroom setting'],
      vocabulary_focus: [{ token: 'Contract', meaning: '合同' }],
    },
  ],
};

const proAudit = {
  is_cflt_compliant: true,
  cflt_l1: '我们签署这份合同，今天。',
  cflt_l2: 'We sign this contract, today.',
  standard_l2: 'We will sign this contract today.',
  standard_l1: '我们今天签署合同。',
  corrections: [],
};

describe('CoursewareOrchestrator', () => {
  let orchestrator: CoursewareOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new CoursewareOrchestrator();
  });

  it('generates child-appropriate content with SSML', async () => {
    // First call: courseware manifest. Second call: per-script CFLT audit.
    vi.mocked(generateObject)
      .mockResolvedValueOnce({ object: childManifest } as any)
      .mockResolvedValueOnce({ object: childAudit } as any);

    const result = await orchestrator.generate({
      age_group: 'Child (Age 8)',
      industry_context: 'General',
      topic: 'At the Zoo',
    });

    if ('error' in result) {
      throw new Error(result.error);
    }

    expect(result.age_group).toBe('Child (Age 8)');
    expect(result.lessons[0].cflt_scripts[0].ssml).toContain('<prosody');
  });

  it('generates professional content with industry tokens', async () => {
    vi.mocked(generateObject)
      .mockResolvedValueOnce({ object: proManifest } as any)
      .mockResolvedValueOnce({ object: proAudit } as any);

    const result = await orchestrator.generate({
      age_group: 'Professional',
      industry_context: 'Business',
      topic: 'Contract Negotiation',
    });

    if ('error' in result) {
      throw new Error(result.error);
    }

    expect(result.industry_context).toBe('Business');
    expect(result.lessons[0].vocabulary_focus[0].token).toBe('Contract');
  });
});
