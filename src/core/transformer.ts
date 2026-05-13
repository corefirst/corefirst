import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import { z } from 'zod';
import { transformModel } from '@/src/lib/ai';
import { loadSkill } from '@/src/lib/skills';
import { CFLTResponse, CFLTResponseSchema } from '../types/cflt';

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
      });
      return object;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[transformer] Audit error:', msg);
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
        schema: CFLTResponseSchema,
        system: dynamicPrompt,
        prompt: userInput,
      });

      return object;
    } catch (e) {
      const raw = e instanceof NoObjectGeneratedError ? (e.text ?? '') : '';
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[transformer] Error:', msg);
      return { error: msg, raw };
    }
  }
}
