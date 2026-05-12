import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import { transformModel } from '@/src/lib/ai';
import { loadPrompt } from '@/src/lib/prompts/loader';
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
  ): Promise<CFLTResponse | { error: string; raw: string }> {
    try {
      const dynamicPrompt = loadPrompt('src/core/system_prompt.md', {
        SOURCE_LANG: sourceLang,
        TARGET_LANG: targetLang,
        UI_LANG: uiLang,
      });

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
