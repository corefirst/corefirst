import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import { transformModel } from '@/src/lib/ai';
import { loadSkill } from '@/src/lib/skills';
import { CFLTResponse, CFLTResponseSchema } from '../types/cflt';

export class CFLTTransformer {
  private model: LanguageModel;

  constructor(modelOverride?: LanguageModel) {
    this.model = modelOverride ?? transformModel;
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
