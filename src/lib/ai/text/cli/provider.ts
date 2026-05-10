import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3StreamPart,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import { APICallError, UnsupportedFunctionalityError } from '@ai-sdk/provider';
import type { CliAdapter, CliAdapterName, AdapterResult } from './adapter';
import { ClaudeAdapter } from './adapters/claude';
import { GeminiAdapter } from './adapters/gemini';
import { injectJsonSchemaInstructions, extractJson } from './schema';

const DEFAULT_TIMEOUT_SEC = 180;

export function cliTextModel(name: CliAdapterName, commandOverride: string | undefined): LanguageModelV3 {
  const command = commandOverride ?? name;
  const adapter: CliAdapter = name === 'claude' ? new ClaudeAdapter(command) : new GeminiAdapter(command);

  return new CliLanguageModel(adapter);
}

class CliLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  constructor(private readonly adapter: CliAdapter) {
    this.provider = `cli/${adapter.name}`;
    this.modelId = adapter.command;
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const flatPrompt = renderPromptToText(options.prompt);
    const finalPrompt =
      options.responseFormat?.type === 'json'
        ? injectJsonSchemaInstructions(flatPrompt, options.responseFormat.schema, options.responseFormat.name)
        : flatPrompt;

    const result = await this.adapter.execute({
      prompt: finalPrompt,
      cwd: process.cwd(),
      timeoutSec: DEFAULT_TIMEOUT_SEC,
      abortSignal: options.abortSignal,
    });

    if (!result.success) {
      throw mapAdapterError(this.provider, this.modelId, result);
    }

    const text = options.responseFormat?.type === 'json' ? extractJson(result.content) : result.content;

    return {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: result.usage.inputTokens || undefined,
          noCache: undefined,
          cacheRead: result.usage.cachedTokens || undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: result.usage.outputTokens || undefined,
          text: result.usage.outputTokens || undefined,
          reasoning: undefined,
        },
      },
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    // The CLI emits a stream-json event flow, but the consumers in this app
    // (generateObject / generateText) buffer everything anyway. Collapsing to
    // a single doGenerate call keeps the streaming code path trivial.
    const generated = await this.doGenerate(options);
    const textParts = generated.content.filter((c): c is { type: 'text'; text: string } => c.type === 'text');
    const id = 't0';

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: generated.warnings });
        if (textParts.length > 0) {
          controller.enqueue({ type: 'text-start', id });
          for (const part of textParts) {
            controller.enqueue({ type: 'text-delta', id, delta: part.text });
          }
          controller.enqueue({ type: 'text-end', id });
        }
        controller.enqueue({
          type: 'finish',
          finishReason: generated.finishReason,
          usage: generated.usage,
        });
        controller.close();
      },
    });

    return { stream };
  }
}

function renderPromptToText(prompt: LanguageModelV3Prompt): string {
  const lines: string[] = [];
  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        lines.push(message.content);
        break;
      case 'user': {
        lines.push('[USER]:');
        for (const part of message.content) {
          if (part.type === 'text') {
            lines.push(part.text);
          } else {
            throw new UnsupportedFunctionalityError({
              functionality: `CLI text provider does not support ${part.type} parts in user messages`,
            });
          }
        }
        break;
      }
      case 'assistant': {
        lines.push('[ASSISTANT]:');
        for (const part of message.content) {
          if (part.type === 'text') {
            lines.push(part.text);
          } else if (part.type === 'reasoning') {
            // Drop reasoning silently — CLI doesn't reason on our behalf.
          } else {
            throw new UnsupportedFunctionalityError({
              functionality: `CLI text provider does not support ${part.type} parts in assistant messages`,
            });
          }
        }
        break;
      }
      case 'tool':
        throw new UnsupportedFunctionalityError({
          functionality: 'CLI text provider does not support tool messages',
        });
    }
  }
  return lines.join('\n\n');
}

function mapAdapterError(provider: string, modelId: string, result: AdapterResult): Error {
  const baseMsg = result.errorMessage || 'CLI adapter call failed';
  const url = `cli://${provider}`;

  const cliName = provider.replace('cli/', '');
  if (result.errorCode === 'auth_required') {
    return new APICallError({
      url,
      requestBodyValues: {},
      message: `${provider} is not authenticated. Run \`${modelId} login\` (Claude) or \`${modelId} auth\` (Gemini) and try again.`,
      isRetryable: false,
    });
  }
  if (result.errorCode === 'command_not_found') {
    return new APICallError({
      url,
      requestBodyValues: {},
      message: `Command "${modelId}" not found on PATH. Install the ${cliName} CLI.`,
      isRetryable: false,
    });
  }
  if (result.errorCode === 'timeout') {
    return new APICallError({
      url,
      requestBodyValues: {},
      message: `${provider} timed out after ${DEFAULT_TIMEOUT_SEC}s.`,
      isRetryable: true,
    });
  }
  return new APICallError({
    url,
    requestBodyValues: {},
    message: `${provider} call failed: ${baseMsg}`,
    isRetryable: false,
  });
}
