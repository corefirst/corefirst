import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Command } from 'commander';
import { makeTransformCommand } from './commands/transform';
import { makeGenerateCommand } from './commands/generate';
import { makeServeCommand } from './commands/serve';
import { makeConfigCommand } from './commands/config';
import { makeAppCommand } from './commands/app';

// ---------------------------------------------------------------------------
// Bootstrap: set env vars before any command handler runs.
// All imports above are CJS requires after tsup compilation; env setup here
// runs before any lazy AI module loads (which only happen inside .action()).
// ---------------------------------------------------------------------------

if (!process.env.COREFIRST_ROOT) {
  // Built output: dist/cli/index.js  →  ../../  =  package root
  process.env.COREFIRST_ROOT = path.resolve(__dirname, '..', '..');
}

if (!process.env.COREFIRST_DATA_DIR) {
  process.env.COREFIRST_DATA_DIR = path.join(os.homedir(), '.corefirst', 'data');
}

// Load .env from cwd (user's project) with lower priority than existing env
const localEnv = path.join(process.cwd(), '.env');
if (fs.existsSync(localEnv)) {
  for (const line of fs.readFileSync(localEnv, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version, description } = require('../../package.json') as {
  version: string;
  description: string;
};

const program = new Command();

program
  .name('corefirst')
  .description(description)
  .version(version, '-v, --version');

program.addCommand(makeTransformCommand());
program.addCommand(makeGenerateCommand());
program.addCommand(makeServeCommand());
program.addCommand(makeConfigCommand());
program.addCommand(makeAppCommand());

program.parse(process.argv);
