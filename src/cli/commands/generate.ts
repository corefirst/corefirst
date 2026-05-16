import { Command } from 'commander';
import ora from 'ora';
import { applyToEnv } from '../utils/config-store';
import { printCourse, printError, printInfo } from '../utils/output';
import { AGE_GROUPS, DOMAINS } from '../../generator/orchestrator';

export function makeGenerateCommand(): Command {
  return new Command('generate-course')
    .alias('gen')
    .description('Generate a bilingual CFLT course package')
    .option('--topic <topic>', 'Course topic', 'At the Zoo')
    .option('--from <lang>', 'Source / L1 language', 'English')
    .option('--to <lang>', 'Target / L2 language', 'Chinese')
    .option(`--age <group>`, `Age group (${AGE_GROUPS.join(' | ')})`, 'Young Learner (Age 12+)')
    .option(`--domain <domain>`, `Domain context (${DOMAINS.slice(0, 3).join(' | ')} …)`, 'General / Life')
    .option('--json', 'Output raw JSON instead of formatted summary')
    .option('--list-ages', 'Print valid age groups and exit')
    .option('--list-domains', 'Print valid domains and exit')
    .action(async (opts: {
      topic: string;
      from: string;
      to: string;
      age: string;
      domain: string;
      json?: boolean;
      listAges?: boolean;
      listDomains?: boolean;
    }) => {
      if (opts.listAges) {
        AGE_GROUPS.forEach((g) => console.log(g));
        return;
      }
      if (opts.listDomains) {
        DOMAINS.forEach((d) => console.log(d));
        return;
      }

      if (!AGE_GROUPS.includes(opts.age)) {
        printError(`Invalid --age "${opts.age}"\nValid values:\n${AGE_GROUPS.map((g) => `  ${g}`).join('\n')}`);
        process.exit(1);
      }
      if (!DOMAINS.includes(opts.domain)) {
        printError(`Invalid --domain "${opts.domain}"\nValid values:\n${DOMAINS.map((d) => `  ${d}`).join('\n')}`);
        process.exit(1);
      }

      applyToEnv();

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
          domain_context: opts.domain,
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
