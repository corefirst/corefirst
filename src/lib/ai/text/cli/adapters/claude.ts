import * as os from 'os';
import type {
  CliAdapter,
  AdapterExecuteOptions,
  AdapterResult,
  AdapterProbeResult,
  AdapterErrorCode,
} from '../adapter';
import { runCLIProcess } from '../process';
import { parseClaudeStreamJson, detectClaudeAuthRequired } from '../parsers/claude';

export class ClaudeAdapter implements CliAdapter {
  readonly name = 'claude' as const;
  readonly command: string;

  constructor(command: string = 'claude') {
    this.command = command;
  }

  async execute(options: AdapterExecuteOptions): Promise<AdapterResult> {
    const args = [
      '--print',
      '-',
      '--output-format',
      'stream-json',
      '--verbose',
      '--max-turns',
      '1',
      '--dangerously-skip-permissions',
    ];

    const env = { ...process.env };

    const proc = await runCLIProcess({
      command: this.command,
      args,
      cwd: options.cwd,
      env,
      stdin: options.prompt,
      timeoutSec: options.timeoutSec,
      abortSignal: options.abortSignal,
    });

    const parsed = parseClaudeStreamJson(proc.stdout);
    const authRequired = detectClaudeAuthRequired(proc.stdout, proc.stderr);

    let errorCode: AdapterErrorCode | null = null;
    if (proc.timedOut) errorCode = 'timeout';
    else if (authRequired) errorCode = 'auth_required';
    else if (proc.exitCode === null && proc.stderr.includes('ENOENT')) errorCode = 'command_not_found';
    else if (proc.exitCode !== 0 && proc.exitCode !== null) errorCode = 'unknown';

    return {
      success: proc.exitCode === 0 && parsed.summary.length > 0,
      content: parsed.summary,
      usage: parsed.usage
        ? {
            inputTokens: parsed.usage.inputTokens,
            outputTokens: parsed.usage.outputTokens,
            cachedTokens: parsed.usage.cachedInputTokens,
          }
        : { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      errorMessage: proc.exitCode === 0 ? null : proc.stderr.trim() || parsed.summary || null,
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
