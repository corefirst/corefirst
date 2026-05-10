// Vendored from reachforge/src/llm/process.ts.

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { appendWithCap, MAX_CAPTURE_BYTES } from './parsers/utils';

export interface ProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutSec: number;
  abortSignal?: AbortSignal;
}

export interface ProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

const GRACE_SEC = 20;

const CLAUDE_NESTING_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION',
  'CLAUDE_CODE_PARENT_SESSION',
];

export async function runCLIProcess(options: ProcessOptions): Promise<ProcessResult> {
  const { command, args, cwd, stdin, timeoutSec, abortSignal } = options;

  const env = { ...options.env };
  for (const key of CLAUDE_NESTING_VARS) {
    delete env[key];
  }
  if (!env.PATH) {
    env.PATH = defaultPath();
  } else if (process.platform !== 'win32') {
    const extras = ['/usr/local/bin', '/opt/homebrew/bin'];
    for (const dir of extras) {
      if (!env.PATH.includes(dir)) {
        env.PATH = `${env.PATH}:${dir}`;
      }
    }
  }

  return new Promise<ProcessResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let graceId: ReturnType<typeof setTimeout> | undefined;

    const child: ChildProcessWithoutNullStreams = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendWithCap(stdout, chunk.toString(), MAX_CAPTURE_BYTES);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendWithCap(stderr, chunk.toString(), MAX_CAPTURE_BYTES);
    });

    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    if (timeoutSec > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        graceId = setTimeout(() => {
          child.kill('SIGKILL');
        }, GRACE_SEC * 1000);
      }, timeoutSec * 1000);
    }

    const onAbort = () => {
      timedOut = true;
      child.kill('SIGTERM');
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (graceId) clearTimeout(graceId);
      abortSignal?.removeEventListener('abort', onAbort);
      resolve({
        exitCode: null,
        signal: null,
        timedOut: false,
        stdout,
        stderr: stderr || err.message,
      });
    });

    child.on('close', (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (graceId) clearTimeout(graceId);
      abortSignal?.removeEventListener('abort', onAbort);
      resolve({
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        stdout,
        stderr,
      });
    });
  });
}

function defaultPath(): string {
  if (process.platform === 'win32') {
    return 'C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem';
  }
  return '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin';
}
