import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import { z } from 'zod';
import { transformModel } from '@/src/lib/ai';
import { loadSkill } from '@/src/lib/skills';
import { CFLTResponse, CFLTResponseSchema, CFLTResponseGenerationSchema } from '../types/cflt';

// Minimal schema for the orchestrator's script-audit pass.
// Only captures the three fields orchestrator actually reads (cflt_l1, cflt_l2,
// standard_l1). Deliberately omits corrections and slots so strict enum /
// nested-array validation can't cause false failures on simple sentences.
const AuditResultSchema = z.object({
  cflt_l1: z.string(),
  cflt_l2: z.string(),
  standard_l1: z.string(),
});

export class CFLTTransformer {
  private model: LanguageModel;

  constructor(modelOverride?: LanguageModel) {
    if (!modelOverride) console.log('[ai/transform] no UI settings — using env fallback');
    this.model = modelOverride ?? transformModel;
  }

  // Lightweight audit used by the orchestrator to re-verify and backfill
  // cflt_l1 / cflt_l2 / standard_l1 on generated course scripts. Uses a
  // minimal schema so strict corrections/slots validation can't cause false
  // failures on intentionally simple sentences (children's content etc.).
  async auditScript(
    standard_l2: string,
    sourceLang: string,
    targetLang: string,
    userId?: string,
  ): Promise<{ cflt_l1: string; cflt_l2: string; standard_l1: string } | { error: string }> {
    try {
      const system = await loadSkill('cflt-transformer', {
        SOURCE_LANG: sourceLang,
        TARGET_LANG: targetLang,
        UI_LANG: sourceLang,
      }, userId);
      const { object } = await generateObject({
        model: this.model,
        schema: AuditResultSchema,
        system,
        prompt: standard_l2,
        maxTokens: 2048,
      });
      return object;
    } catch (e) {
      const raw = e instanceof NoObjectGeneratedError ? (e.text ?? '') : '';
      const msg = e instanceof Error ? e.message : String(e);

      // Salvage attempt
      const salvaged = trySalvageAudit(raw);
      if (salvaged) {
        console.warn('[transformer] Audit recovered by salvaging raw output.');
        return salvaged;
      }

      console.error('[transformer] Audit error:', msg);
      if (raw) console.error('[transformer] Audit raw response:', raw);
      return { error: msg };
    }
  }

  async transform(
    userInput: string,
    sourceLang: string = 'Chinese',
    targetLang: string = 'English',
    uiLang: string = sourceLang,
    userId?: string,
  ): Promise<CFLTResponse | { error: string; raw: string }> {
    try {
      const dynamicPrompt = await loadSkill('cflt-transformer', {
        SOURCE_LANG: sourceLang,
        TARGET_LANG: targetLang,
        UI_LANG: uiLang,
      }, userId);

      const { object } = await generateObject({
        model: this.model,
        schema: CFLTResponseGenerationSchema,
        system: dynamicPrompt,
        prompt: userInput,
        maxTokens: 2048,
      });

      return object as CFLTResponse;
    } catch (e) {
      const raw = e instanceof NoObjectGeneratedError ? (e.text ?? '') : '';
      const msg = e instanceof Error ? e.message : String(e);

      // Salvage attempt for malformed JSON (common with Qwen/DeepSeek)
      const salvaged = trySalvageCFLT(raw);
      if (salvaged) {
        console.warn('[transformer] Recovered by salvaging raw output.');
        return salvaged;
      }

      console.error('[transformer] Error:', msg);
      if (raw) console.error('[transformer] Raw response:', raw);
      return { error: msg, raw };
    }
  }
}

function trySalvageAudit(raw: string): { cflt_l1: string; cflt_l2: string; standard_l1: string } | null {
  if (!raw || !raw.trim()) return null;
  const candidates: string[] = [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  candidates.push(raw.trim());

  for (const text of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const result = AuditResultSchema.safeParse(parsed);
    if (result.success) return result.data;
  }
  return null;
}

/**
 * Best-effort salvage for CFLTResponse JSON that the AI SDK couldn't parse.
 * Strips markdown fences and attempts to parse the core object.
 */
function trySalvageCFLT(raw: string): CFLTResponse | null {
  if (!raw || !raw.trim()) return null;
  const candidates: string[] = [];

  // 1) strip markdown fences
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());

  // 2) first { to last }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));

  // 3) raw text
  candidates.push(raw.trim());

  for (const text of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // If direct JSON.parse fails, try to fix common escaping issues (experimental)
      try {
        // Fix unescaped double quotes inside values. 
        // This is risky but helps with the specific "original": "outdoors" issue.
        const fixed = text.replace(/":\s*"(.*)"\s*([,}])/g, (m, p1, p2) => {
           const escaped = p1.replace(/"/g, '\\"');
           return `": "${escaped}"${p2}`;
        });
        parsed = JSON.parse(fixed);
      } catch {
        continue;
      }
    }
    const result = CFLTResponseSchema.safeParse(parsed);
    if (result.success) return result.data;
  }
  return null;
}
