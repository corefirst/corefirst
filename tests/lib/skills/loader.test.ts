import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the store module so tests don't touch PouchDB.
vi.mock('../../../src/lib/skills/store', () => ({
  getSkillPreferences: vi.fn(),
  getSkillById: vi.fn(),
}));

// Mock loadPrompt so we don't need real .md files on disk.
vi.mock('../../../src/lib/prompts/loader', () => ({
  loadPrompt: vi.fn((_path: string, vars: Record<string, string> = {}) => {
    let text = 'system:{{SOURCE_LANG}}→{{TARGET_LANG}}';
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{{${k}}}`, v);
    }
    return text;
  }),
}));

import { loadSkill } from '../../../src/lib/skills/loader';
import { getSkillPreferences, getSkillById } from '../../../src/lib/skills/store';

const mockPrefs = getSkillPreferences as ReturnType<typeof vi.fn>;
const mockSkill = getSkillById as ReturnType<typeof vi.fn>;

describe('loadSkill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to system default when no userId is provided', async () => {
    const result = await loadSkill('speech-eval', {
      SOURCE_LANG: 'Chinese',
      TARGET_LANG: 'English',
    });
    // loadPrompt mock substitutes the vars
    expect(result).toBe('system:Chinese→English');
    expect(mockPrefs).not.toHaveBeenCalled();
  });

  it('falls back to system default when user has no preference for the slot', async () => {
    mockPrefs.mockResolvedValue({});
    const result = await loadSkill('speech-eval', {
      SOURCE_LANG: 'Chinese',
      TARGET_LANG: 'English',
    }, 'user123');
    expect(result).toBe('system:Chinese→English');
  });

  it('returns custom skill content when user has an active preference', async () => {
    mockPrefs.mockResolvedValue({ 'speech-eval': 'skill:abc' });
    mockSkill.mockResolvedValue({
      _id: 'skill:abc',
      content: 'custom: {{SOURCE_LANG}} to {{TARGET_LANG}}',
    });
    const result = await loadSkill('speech-eval', {
      SOURCE_LANG: 'Japanese',
      TARGET_LANG: 'English',
    }, 'user123');
    expect(result).toBe('custom: Japanese to English');
  });

  it('falls back to system default when preferred skill is not found in DB', async () => {
    mockPrefs.mockResolvedValue({ 'speech-eval': 'skill:missing' });
    mockSkill.mockResolvedValue(null);
    const result = await loadSkill('speech-eval', {
      SOURCE_LANG: 'Chinese',
      TARGET_LANG: 'English',
    }, 'user123');
    expect(result).toBe('system:Chinese→English');
  });

  it('falls back silently when DB throws', async () => {
    mockPrefs.mockRejectedValue(new Error('DB unavailable'));
    const result = await loadSkill('speech-eval', {
      SOURCE_LANG: 'Chinese',
      TARGET_LANG: 'English',
    }, 'user123');
    expect(result).toBe('system:Chinese→English');
  });

  it('substitutes {{VAR}} in custom skill content', async () => {
    mockPrefs.mockResolvedValue({ 'roleplay-coach': 'skill:xyz' });
    mockSkill.mockResolvedValue({
      _id: 'skill:xyz',
      content: 'Coach for {{CONTEXT}} in {{TARGET_LANG}}',
    });
    const result = await loadSkill('roleplay-coach', {
      SOURCE_LANG: 'Chinese',
      TARGET_LANG: 'English',
      CONTEXT: 'Business meeting',
    }, 'alice');
    expect(result).toBe('Coach for Business meeting in English');
  });
});
