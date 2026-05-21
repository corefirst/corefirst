import pc from 'picocolors';
import type { CFLTResponse } from '../../types/cflt';
import type { CoursewareManifest } from '../../types/courseware';

const SLOT_LABELS: Record<string, string> = {
  core:   'Core',
  reason: 'Reason',
  space:  'Space',
  time:   'Time',
};

export function printCFLT(result: CFLTResponse, input: string): void {
  console.log();
  console.log(pc.bold('─── CFLT Transform ───────────────────────'));
  console.log(pc.dim('Input:   ') + input);
  console.log();

  const compliant = result.is_cflt_compliant;
  const badge = compliant ? pc.green('✓ CFLT-compliant') : pc.yellow('⚠ not fully compliant');
  console.log(badge);
  console.log();

  console.log(pc.bold('Standard'));
  console.log('  L1: ' + result.standard_l1);
  console.log('  L2: ' + result.standard_l2);
  console.log();

  console.log(pc.bold('CFLT Order'));
  console.log('  L1: ' + pc.cyan(result.cflt_l1));
  console.log('  L2: ' + pc.cyan(result.cflt_l2));
  console.log();

  if (result.slots && result.slots.length > 0) {
    console.log(pc.bold('Slots'));
    for (const slot of result.slots) {
      const label = SLOT_LABELS[slot.type] ?? slot.type;
      const inferred = slot.is_inferred ? pc.dim(' (inferred)') : '';
      console.log(`  [${label}]${inferred}`);
      console.log(`    L1: ${slot.content_l1}`);
      console.log(`    L2: ${slot.content_l2}`);
    }
    console.log();
  }

  if (result.corrections.length > 0) {
    console.log(pc.bold('Corrections'));
    for (const c of result.corrections) {
      console.log(`  ${pc.yellow(c.original)} → ${pc.green(c.replacement)}`);
      console.log(`  ${pc.dim(c.reason)}`);
    }
    console.log();
  }

  console.log(pc.dim('─────────────────────────────────────────'));
}

export function printCourse(manifest: CoursewareManifest): void {
  console.log();
  console.log(pc.bold('─── Course Generated ─────────────────────'));
  console.log(pc.bold('Topic:      ') + manifest.topic);
  console.log(pc.bold('Age Group:  ') + manifest.age_group);
  console.log(pc.bold('Category:   ') + manifest.category_context);
  console.log(pc.bold('Lessons:    ') + manifest.lessons.length);
  console.log();

  for (let i = 0; i < manifest.lessons.length; i++) {
    const lesson = manifest.lessons[i];
    console.log(pc.cyan(`Lesson ${i + 1}: ${lesson.title}`));
    console.log(`  Scripts: ${lesson.cflt_scripts.length}`);
    if (lesson.vocabulary_focus?.length) {
      const tokens = lesson.vocabulary_focus.slice(0, 5).map(v => v.token);
      console.log(`  Vocab:   ${tokens.join(', ')}${lesson.vocabulary_focus.length > 5 ? '...' : ''}`);
    }
  }
  console.log();
  console.log(pc.dim('─────────────────────────────────────────'));
}

export function printError(message: string): void {
  console.error(pc.red('Error: ') + message);
}

export function printSuccess(message: string): void {
  console.log(pc.green('✓ ') + message);
}

export function printInfo(message: string): void {
  console.log(pc.dim('→ ') + message);
}
