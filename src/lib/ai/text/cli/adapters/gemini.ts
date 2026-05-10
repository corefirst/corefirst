import * as os from 'os';
import type {
  CliAdapter,
  AdapterExecuteOptions,
  AdapterResult,
  AdapterProbeResult,
  AdapterErrorCode,
} from '../adapter';
import { runCLIProcess } from '../process';
import { parseGeminiJsonl, detectGeminiAuthRequired } from '../parsers/gemini';

export class GeminiAdapter implements CliAdapter {
  readonly name = 'gemini' as const;
  readonly command: string;

  constructor(command: string = 'gemini') {
    this.command = command;
  }

  async execute(options: AdapterExecuteOptions): Promise<AdapterResult> {
    const args = ['--output-format', 'stream-json', '--approval-mode', 'yolo', '--sandbox=none'];
    args.push(options.prompt); // prompt as final positional argument

    const env = { ...process.env };

    const proc = await runCLIProcess({
      command: this.command,
      args,
      cwd: options.cwd,
      env,
      timeoutSec: options.timeoutSec,
      abortSignal: options.abortSignal,
    });

    const parsed = parseGeminiJsonl(proc.stdout);
    const authRequired = detectGeminiAuthRequired(proc.stdout, proc.stderr);

    let errorCode: AdapterErrorCode | null = null;
    if (proc.timedOut) errorCode = 'timeout';
    else if (authRequired) errorCode = 'auth_required';
    else if (proc.exitCode === null && proc.stderr.includes('ENOENT')) errorCode = 'command_not_found';
    else if (proc.exitCode !== 0 && proc.exitCode !== null) errorCode = 'unknown';

    return {
      success: proc.exitCode === 0 && parsed.summary.length > 0,
      content: parsed.summary,
      usage: {
        inputTokens: parsed.usage.inputTokens,
        outputTokens: parsed.usage.outputTokens,
        cachedTokens: parsed.usage.cachedInputTokens,
      },
      errorMessage: proc.exitCode === 0 ? null : parsed.errorMessage || proc.stderr.trim() || null,
      errorCode,
      exitCode: proc.exitCode,
      timedOut: proc.timedOut,
    };
  }

  async probe(): Promise<AdapterProbeResult> {
    try {
      const versionResult = await runCLIProcess({
        command: this.command,
        args: ['--version'],
        cwd: os.tmpdir(),
        env: { ...process.env },
        timeoutSec: 10,
      });

      if (versionResult.exitCode !== 0 && !versionResult.stdout.trim()) {
        return { available: false, authenticated: false, version: null, errorMessage: 'not installed' };
      }
      const version = versionResult.stdout.trim().split('\n')[0] || null;
      return { available: true, authenticated: true, version, errorMessage: null };
    } catch {
      return { available: false, authenticated: false, version: null, errorMessage: 'not installed' };
    }
  }
}
