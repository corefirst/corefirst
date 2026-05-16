import { Command } from 'commander';
import * as readline from 'readline';
import pc from 'picocolors';
import {
  get,
  set,
  unset,
  listAll,
  VALID_KEYS,
  CONFIG_FILE,
} from '../utils/config-store';
import { printError, printSuccess } from '../utils/output';

export function makeConfigCommand(): Command {
  const cmd = new Command('config').description('Manage CoreFirst CLI configuration');

  cmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      try {
        set(key, value);
        printSuccess(`Set ${pc.bold(key)}`);
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  cmd
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const value = get(key);
      if (value === undefined) {
        console.log(pc.dim(`(not set)`));
      } else {
        console.log(value);
      }
    });

  cmd
    .command('unset <key>')
    .description('Remove a configuration value')
    .action((key: string) => {
      unset(key);
      printSuccess(`Unset ${pc.bold(key)}`);
    });

  cmd
    .command('list')
    .alias('ls')
    .description('List all configured values')
    .action(() => {
      const entries = listAll();
      if (entries.length === 0) {
        console.log(pc.dim('No configuration set.'));
        console.log(pc.dim(`Config file: ${CONFIG_FILE}`));
        console.log();
        console.log('Run ' + pc.cyan('corefirst config init') + ' to set up interactively.');
        return;
      }
      console.log(pc.bold(`Config (${CONFIG_FILE}):`));
      console.log();
      for (const { key, value, envVar } of entries) {
        console.log(`  ${pc.cyan(key.padEnd(20))} ${value}  ${pc.dim(`(${envVar})`)}`);
      }
    });

  cmd
    .command('keys')
    .description('Show all available config keys')
    .action(() => {
      console.log(pc.bold('Available config keys:'));
      console.log();
      const rows: Array<[string, string]> = [
        ['provider',           'GLOBAL_PROVIDER — default AI provider (openai, google, anthropic, ollama…)'],
        ['model',              'GLOBAL_MODEL — default model name'],
        ['text.provider',      'TEXT_PROVIDER — override for text generation'],
        ['text.model',         'TEXT_MODEL — override for text model'],
        ['openai.key',         'OPENAI_API_KEY'],
        ['google.key',         'GOOGLE_API_KEY'],
        ['anthropic.key',      'ANTHROPIC_API_KEY'],
        ['openrouter.key',     'OPENROUTER_API_KEY'],
        ['groq.key',           'GROQ_API_KEY'],
        ['deepseek.key',       'DEEPSEEK_API_KEY'],
        ['qwen.key',           'DASHSCOPE_API_KEY'],
        ['ollama.url',         'OLLAMA_BASE_URL'],
        ['tts.provider',       'TTS_PROVIDER'],
        ['tts.model',          'TTS_MODEL'],
        ['stt.provider',       'STT_PROVIDER'],
        ['image.provider',     'IMAGE_GEN_PROVIDER'],
        ['image.model',        'IMAGE_GEN_MODEL'],
        ['dataDir',            'COREFIRST_DATA_DIR — where data files are stored'],
      ];
      for (const [key, desc] of rows) {
        console.log(`  ${pc.cyan(key.padEnd(20))} ${pc.dim(desc)}`);
      }
    });

  cmd
    .command('init')
    .description('Interactive setup wizard')
    .action(async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      // Ensure readline is always closed, even on Ctrl+C
      process.once('SIGINT', () => { rl.close(); process.exit(0); });

      console.log(pc.bold('CoreFirst CLI Setup'));
      console.log(pc.dim('Press Enter to skip any field.\n'));

      try {
        const providerInput = await ask(`AI provider [openai/google/anthropic/ollama] (default: openai): `);
        const provider = providerInput.trim() || 'openai';
        set('provider', provider);

        if (provider === 'openai') {
          const key = await ask('OpenAI API key: ');
          if (key.trim()) set('openai.key', key.trim());
        } else if (provider === 'google') {
          const key = await ask('Google API key: ');
          if (key.trim()) set('google.key', key.trim());
        } else if (provider === 'anthropic') {
          const key = await ask('Anthropic API key: ');
          if (key.trim()) set('anthropic.key', key.trim());
        } else if (provider === 'ollama') {
          const url = await ask('Ollama base URL (default: http://localhost:11434): ');
          set('ollama.url', url.trim() || 'http://localhost:11434');
        }

        const dataDir = await ask('Data directory (default: ~/.corefirst/data): ');
        if (dataDir.trim()) set('dataDir', dataDir.trim());

        console.log();
        printSuccess('Configuration saved! Run ' + pc.cyan('corefirst config list') + ' to review.');
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      } finally {
        rl.close();
      }
    });

  return cmd;
}
