import { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { applyToEnv, hasProvider } from '../utils/config-store';
import { printCourse, printError, printInfo } from '../utils/output';
import { AGE_GROUPS, CATEGORIES } from '../../generator/orchestrator';

export function makeGenerateCommand(): Command {
  return new Command('generate-course')
    .alias('gen')
    .description('Generate a bilingual CFLT course package')
    .option('--topic <topic>', 'Course topic', 'At the Zoo')
    .option('--from <lang>', 'Source / L1 language', 'English')
    .option('--to <lang>', 'Target / L2 language', 'Chinese')
    .option(`--age <group>`, `Age group (${AGE_GROUPS.join(' | ')})`, 'Young Learner (Age 12+)')
    .option(`--category <category>`, `Category context (${CATEGORIES.slice(0, 3).join(' | ')} …)`, 'General / Life')
    .option('--json', 'Output raw JSON instead of formatted summary')
    .option('--list-ages', 'Print valid age groups and exit')
    .option('--list-categories', 'Print valid categories and exit')
    .action(async (opts: {
      topic: string;
      from: string;
      to: string;
      age: string;
      category: string;
      json?: boolean;
      listAges?: boolean;
      listCategories?: boolean;
    }) => {
      if (opts.listAges) {
        AGE_GROUPS.forEach((g) => console.log(g));
        return;
      }
      if (opts.listCategories) {
        CATEGORIES.forEach((c) => console.log(c));
        return;
      }

      if (!AGE_GROUPS.includes(opts.age)) {
        printError(`Invalid --age "${opts.age}"\nValid values:\n${AGE_GROUPS.map((g) => `  ${g}`).join('\n')}`);
        process.exit(1);
      }
      if (!CATEGORIES.includes(opts.category)) {
        printError(`Invalid --category "${opts.category}"\nValid values:\n${CATEGORIES.map((c) => `  ${c}`).join('\n')}`);
        process.exit(1);
      }

      applyToEnv();

      if (!hasProvider()) {
        printError('No AI provider configured.');
        console.log();
        console.log('Run ' + pc.cyan('corefirst config init') + ' to set up your provider and API key.');
        console.log('Or set an environment variable directly, e.g. ' + pc.dim('OPENAI_API_KEY=sk-...'));
        process.exit(1);
      }

      const spinner = ora(`Generating course: "${opts.topic}"…`).start();
      try {
        const { CoursewareOrchestrator } = await import('../../generator/orchestrator');
        const orchestrator = new CoursewareOrchestrator(undefined, (event) => {
          if (event.type === 'progress') {
            spinner.text = String(event.message);
          }
        });

        const result = await orchestrator.generate({
          age_group: opts.age,
          category_context: opts.category,
          topic: opts.topic,
          sourceLang: opts.from,
          targetLang: opts.to,
        });

        spinner.stop();

        if ('error' in result) {
          printError(result.error);
          process.exit(1);
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printCourse(result);
          printInfo('Use --json to get the full structured output.');
        }
      } catch (err) {
        spinner.stop();
        printError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
