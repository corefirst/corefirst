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
        ['google.key',         'GOOGLE_GENERATIVE_AI_API_KEY'],
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
        ['dataDir',            'COREFIRST_DATA_DIR — where data files are stored (default: ~/.corefirst/data)'],
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

      const INIT_PROVIDERS: Array<{ id: string; label: string; keyLabel: string; placeholder: string; signupUrl: string }> = [
        { id: 'openai',      label: 'OpenAI',      keyLabel: 'OpenAI API key',      placeholder: 'sk-…',     signupUrl: 'https://platform.openai.com/api-keys' },
        { id: 'google',      label: 'Google AI',   keyLabel: 'Google API key',      placeholder: 'AIza…',    signupUrl: 'https://aistudio.google.com/apikey' },
        { id: 'qwen',        label: 'Qwen',        keyLabel: 'DashScope API key',   placeholder: 'sk-…',     signupUrl: 'https://dashscope.console.aliyun.com/' },
        { id: 'openrouter',  label: 'OpenRouter',  keyLabel: 'OpenRouter API key',  placeholder: 'sk-or-…',  signupUrl: 'https://openrouter.ai/keys' },
      ];

      console.log(pc.bold('CoreFirst CLI Setup'));
      console.log(pc.dim('Choose a provider and enter your API key. Press Enter to skip optional fields.\n'));

      const providerList = INIT_PROVIDERS.map((p, i) => `${i + 1}) ${p.label}`).join('  ');
      console.log('Providers: ' + pc.cyan(providerList));

      try {
        const providerInput = await ask(`Provider [1-4 or name] (default: 1 · OpenAI): `);
        const input = providerInput.trim().toLowerCase();
        const byIdx = parseInt(input, 10);
        const def =
          (!input)                                             ? INIT_PROVIDERS[0] :
          (!isNaN(byIdx) && byIdx >= 1 && byIdx <= 4)         ? INIT_PROVIDERS[byIdx - 1] :
          INIT_PROVIDERS.find(p => p.id === input || p.label.toLowerCase() === input)
            ?? INIT_PROVIDERS[0];
        set('provider', def.id);
        console.log(`provider: ${pc.cyan(def.label)}  ${pc.dim(def.signupUrl)}`);

        const key = await ask(`${def.keyLabel} (${pc.dim(def.placeholder)}): `);
        if (key.trim()) {
          set(`${def.id}.key`, key.trim());
        } else {
          console.log(pc.yellow('  ⚠ No key entered — you can set it later with: ') + pc.cyan(`corefirst config set ${def.id}.key <key>`));
        }

        const dataDir = await ask('\nData directory (default: ~/.corefirst/data): ');
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
