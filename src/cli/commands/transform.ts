import { Command } from 'commander';
import ora from 'ora';
import { applyToEnv } from '../utils/config-store';
import { printCFLT, printError } from '../utils/output';

export function makeTransformCommand(): Command {
  return new Command('transform')
    .description('Transform a sentence into CFLT order')
    .argument('<text>', 'The sentence to transform')
    .option('--from <lang>', 'Source language', 'English')
    .option('--to <lang>', 'Target language', 'Chinese')
    .option('--ui <lang>', 'UI / explanation language (defaults to --from)')
    .option('--json', 'Output raw JSON instead of formatted text')
    .action(async (text: string, opts: { from: string; to: string; ui?: string; json?: boolean }) => {
      applyToEnv();

      const spinner = ora('Transforming…').start();
      try {
        const { CFLTTransformer } = await import('../../core/transformer');
        const transformer = new CFLTTransformer();
        const result = await transformer.transform(text, opts.from, opts.to, opts.ui ?? opts.from);
        spinner.stop();

        if ('error' in result) {
          printError(result.error);
          process.exit(1);
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printCFLT(result, text);
        }
      } catch (err) {
        spinner.stop();
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
