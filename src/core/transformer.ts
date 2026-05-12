import * as fs from 'fs';
import * as path from 'path';
import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import { transformModel } from '@/src/lib/ai';
import { CFLTResponse, CFLTResponseSchema } from '../types/cflt';

// Read prompt once at module load to avoid synchronous disk I/O per request
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'src/core/system_prompt.md'),
  'utf-8'
);

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
      const dynamicPrompt = SYSTEM_PROMPT
        .replace(/{{SOURCE_LANG}}/g, sourceLang)
        .replace(/{{TARGET_LANG}}/g, targetLang)
        .replace(/{{UI_LANG}}/g, uiLang);

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
