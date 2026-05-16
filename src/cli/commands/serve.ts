import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import pc from 'picocolors';
import { applyToEnv } from '../utils/config-store';
import { printError, printInfo } from '../utils/output';

export function makeServeCommand(): Command {
  return new Command('serve')
    .description('Start the CoreFirst web server')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('--host <host>', 'Host to bind', 'localhost')
    .action(async (opts: { port: string; host: string }) => {
      applyToEnv();

      const cwd = process.cwd();
      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        printError(`Invalid port "${opts.port}" — must be 1–65535.`);
        process.exit(1);
      }
      const env = { ...process.env, PORT: String(port), HOSTNAME: opts.host };

      const attachShutdown = (child: ReturnType<typeof spawn>) => {
        child.on('error', (err) => printError(err.message));
        const shutdown = (signal: NodeJS.Signals) => {
          child.kill(signal);
          process.exit(0);
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
      };

      // Prefer pre-built standalone server
      const standalonePath = path.join(cwd, '.next', 'standalone', 'server.js');
      if (fs.existsSync(standalonePath)) {
        console.log(pc.bold('CoreFirst') + ' → ' + pc.cyan(`http://${opts.host}:${port}`));
        printInfo('Using pre-built standalone server');
        attachShutdown(spawn(process.execPath, [standalonePath], { env, stdio: 'inherit', cwd }));
        return;
      }

      // Fall back to `next start` if .next/ exists
      const nextDir = path.join(cwd, '.next');
      if (fs.existsSync(nextDir)) {
        console.log(pc.bold('CoreFirst') + ' → ' + pc.cyan(`http://${opts.host}:${port}`));
        printInfo('Using next start');
        const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        attachShutdown(spawn(npx, ['next', 'start', '--port', String(port), '--hostname', opts.host], {
          env,
          stdio: 'inherit',
          cwd,
        }));
        return;
      }

      printError('No built app found in current directory.');
      console.log();
      console.log('Run one of the following from your corefirst project directory:');
      console.log('  ' + pc.cyan('pnpm build') + '  (or npm run build)');
      console.log('Then retry: ' + pc.cyan(`corefirst serve --port ${port}`));
      process.exit(1);
    });
}
