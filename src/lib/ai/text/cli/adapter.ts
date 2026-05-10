// Trimmed from reachforge: no skills layer, no session resume — CoreFirst's
// LLM calls are stateless (the AI SDK passes full prompts each time).

export type CliAdapterName = 'claude' | 'gemini';

export type AdapterErrorCode =
  | 'auth_required'
  | 'command_not_found'
  | 'timeout'
  | 'parse_error'
  | 'unknown';

export interface AdapterExecuteOptions {
  prompt: string;
  cwd: string;
  timeoutSec: number;
  abortSignal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface AdapterResult {
  success: boolean;
  content: string;
  usage: TokenUsage;
  errorMessage: string | null;
  errorCode: AdapterErrorCode | null;
  exitCode: number | null;
  timedOut: boolean;
}

export interface AdapterProbeResult {
  available: boolean;
  authenticated: boolean;
  version: string | null;
  errorMessage: string | null;
}

export interface CliAdapter {
  readonly name: CliAdapterName;
  readonly command: string;
  execute(options: AdapterExecuteOptions): Promise<AdapterResult>;
  probe(): Promise<AdapterProbeResult>;
}
