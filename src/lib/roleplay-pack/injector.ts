import type { RoleplayPack, Scenario, Persona } from '@/src/types/roleplay-pack';

export interface InjectionResult {
  packSection: string;
  derivedContext: string;
  seed?: string;
}

function findScenario(pack: RoleplayPack, scenarioId?: string): Scenario | undefined {
  if (!scenarioId) return undefined;
  return pack.scenarios.find((s) => s.id === scenarioId);
}

function findPersona(pack: RoleplayPack, personaId?: string): Persona | undefined {
  if (!personaId) return undefined;
  return pack.personas.find((p) => p.id === personaId);
}

export function renderForRoleplay(
  pack: RoleplayPack,
  scenarioId?: string,
  personaId?: string,
): InjectionResult {
  const scenario = findScenario(pack, scenarioId);
  const persona = findPersona(pack, personaId);

  const lines: string[] = [];
  lines.push(`## Roleplay Pack: ${pack.name}`);
  lines.push(`Domain: ${pack.domain}. Target language: ${pack.targetLang}.`);

  if (persona) {
    lines.push('');
    lines.push(`### You are playing: ${persona.role}`);
    lines.push(`Speak with a ${persona.formality} register.`);
    if (persona.typical_phrases.length > 0) {
      lines.push(`You naturally use phrases like:`);
      for (const phrase of persona.typical_phrases) lines.push(`- "${phrase}"`);
    }
  }

  if (scenario) {
    lines.push('');
    lines.push(`### Scenario: ${scenario.title}`);
    lines.push(scenario.description);
    if (scenario.settings.length > 0) {
      lines.push(`Setting: ${scenario.settings.join(', ')}.`);
    }
    if (scenario.signature_terms.length > 0) {
      lines.push(`Signature vocabulary for this scenario: ${scenario.signature_terms.join(', ')}.`);
    }
  }

  const mustAppear = pack.vocabulary.filter((v) => v.priority === 'must_appear');
  const niceToHave = pack.vocabulary.filter((v) => v.priority === 'nice_to_have');

  if (mustAppear.length > 0) {
    lines.push('');
    lines.push('### Priority vocabulary — weave these naturally across the session');
    for (const v of mustAppear) {
      const collo = v.collocations.length > 0 ? ` (e.g., ${v.collocations.slice(0, 2).join('; ')})` : '';
      lines.push(`- **${v.term}** — ${v.gloss}${collo}`);
    }
  }

  if (niceToHave.length > 0) {
    lines.push('');
    lines.push('### Supplementary vocabulary — use when contextually appropriate');
    lines.push(niceToHave.map((v) => v.term).join(', '));
  }

  if (pack.avoidTerms.length > 0) {
    lines.push('');
    lines.push('### Avoid these terms');
    lines.push(pack.avoidTerms.map((t) => `"${t}"`).join(', '));
  }

  lines.push('');
  lines.push('### Density guidance');
  lines.push(
    `Aim for about ${pack.coverageTargets.suggested_terms_per_session} priority terms across the whole session — at most ${pack.coverageTargets.suggested_per_turn_max} per single reply. Natural conversation flow beats hitting every term.`,
  );

  const packSection = lines.join('\n');
  const derivedContext = scenario
    ? `${scenario.title} — ${scenario.description}`
    : `${pack.name} — ${pack.description}`;

  return {
    packSection,
    derivedContext,
    seed: scenario?.roleplay_seed || undefined,
  };
}

export function emptyPackSection(): string {
  return '';
}
