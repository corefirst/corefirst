// Subscription CLIs (Claude / Gemini) do not expose native structured-output
// modes. We inject the JSON schema into the prompt and rely on the AI SDK's
// downstream parsing + repair pipeline to validate.

import type { JSONSchema7 } from '@ai-sdk/provider';

export function injectJsonSchemaInstructions(prompt: string, schema?: JSONSchema7, name?: string): string {
  const schemaBlock = schema
    ? '\n\nThe response MUST be a single JSON object that conforms to this JSON Schema:\n```json\n' +
      JSON.stringify(schema, null, 2) +
      '\n```'
    : '';
  const namePart = name ? ` named "${name}"` : '';

  return (
    prompt +
    '\n\n---\n' +
    `Output format: respond with raw JSON only${namePart}. ` +
    'Do not wrap the JSON in code fences. Do not add any prose, headings, or commentary before or after the JSON. ' +
    'The first character of your response must be `{` and the last must be `}`.' +
    schemaBlock
  );
}

/**
 * Strips the most common forms of CLI-side JSON wrapping that slip past the
 * "raw JSON only" instruction: surrounding code fences and leading/trailing
 * prose. Returns the substring from the first `{` to the matching final `}`.
 * If no balanced object is found, returns the input unchanged so the AI SDK's
 * own parser can produce a clear error.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}
