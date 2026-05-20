# Skills — User-Customizable AI Prompt Templates

> Status: Shipped | Updated: 2026-05-13  
> Source: `src/lib/skills/`, `app/api/skills/`, `components/SkillsPanel.tsx`

---

## Overview

A **Skill** is a prompt template for one of the nine AI feature slots in CoreFirst. Users can edit the template for any slot through the Skills panel (⚡ icon in the header), save it to their personal library, and activate it so all subsequent LLM calls for that feature use their version instead of the system default.

This gives users full control over how the AI behaves for each feature — roleplay coaching style, speech evaluation strictness, sentence rendering tone — without touching any configuration files.

---

## Feature Slots

Nine slots are available, each mapping to a system default `.md` file:

| Slot ID | Display Name | Default File | Variables |
|---|---|---|---|
| `cflt-transformer` | CFLT Transformer | `src/core/system_prompt.md` | `SOURCE_LANG`, `TARGET_LANG`, `UI_LANG` |
| `courseware-gen` | Courseware Generator | `src/generator/courseware_prompt.md` | `SOURCE_LANG`, `TARGET_LANG` |
| `courseware-repair` | Courseware Repair | `src/generator/repair-instruction.md` | — |
| `roleplay-coach` | Roleplay Coach (Base) | `src/prompts/roleplay_base.md` | `SOURCE_LANG`, `TARGET_LANG`, `CONTEXT` |
| `roleplay-analysis` | Roleplay Coach (Analysis) | `src/prompts/roleplay_analysis.md` | — |
| `speech-eval` | Speech Evaluator (System) | `src/prompts/speech-eval.md` | `SOURCE_LANG`, `TARGET_LANG` |
| `speech-eval-user` | Speech Evaluator (User Prompt) | `src/prompts/speech-eval-user.md` | `EXPECTED_TEXT`, `TRANSCRIPTION` |
| `sentence-refine` | Sentence Refine (System) | `src/prompts/refine.md` | `SOURCE_LANG`, `TARGET_LANG` |
| `sentence-refine-user` | Sentence Refine (User Prompt) | `src/prompts/refine-user.md` | `SLOTS_TABLE` |

---

## Template Syntax

Skills use the **Claude Skills / Handlebars** `{{VARIABLE}}` convention:

```
You are a CFLT coach. Language pair: {{SOURCE_LANG}} → {{TARGET_LANG}}.
Context: {{CONTEXT}}.
```

Variables are auto-detected from the template content and listed below the editor. The validator (`validatePromptTemplate()`) catches:

| Issue | Behaviour |
|---|---|
| Unclosed `{{` or stray `}}` | Blocks save, highlights the offending line |
| Declared `{{VAR}}` with no value supplied at runtime | Template renders with `{{VAR}}` literal left in place |
| Key in `vars` metadata not found in template | Reported as `unused` (warning, does not block save) |

---

## Skill Resolution Order

When an LLM call is made, `loadSkill(slot, vars, userId)` resolves:

1. **User's active preference** — skill stored in user's personal PouchDB (`db_skills`), linked via `db_skill_prefs`
2. **System default file** — the `.md` file listed in the slot table above

If the DB is unavailable, it falls back silently to the system default.

---

## Data Model

```typescript
// Stored in user's PouchDB: collection "skills", _id = "skill:{uuid}"
interface SkillDoc {
  featureSlot: string;        // one of the 9 slot IDs
  name: string;               // display name (max 100 chars)
  description: string;        // purpose summary (max 500 chars)
  content: string;            // prompt template with {{VAR}} placeholders
  vars: SkillVar[];           // auto-detected from content
  tags: string[];             // max 10
  isSystem: boolean;          // true = official system skill
  authorId: string;
  visibility: 'private' | 'public';  // public = in community catalog
  forkOf: string | null;             // parent skill id if forked
  likes: number;
  forks: number;
  createdAt: string;
}

// User preference: collection "skill_prefs", _id = "active"
interface SkillPrefsDoc {
  prefs: Record<string, string>;  // featureSlot → skillId
}
```

---

## Storage

| Data | Location |
|---|---|
| User's personal skills | `data/users/{userId}/records/db_skills/` |
| User's active slot preferences | `data/users/{userId}/records/db_skill_prefs/` |
| Community catalog (future) | `data/shared/skills/community/` |

---

## API Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/skills` | List current user's personal skills |
| `POST` | `/api/skills` | Create a new skill (body: `{ featureSlot, name, content, description?, tags? }`) |
| `GET` | `/api/skills/:id` | Fetch a skill by id |
| `PATCH` | `/api/skills/:id` | Update name / description / content / tags |
| `DELETE` | `/api/skills/:id` | Delete a personal skill |
| `GET` | `/api/skills/slots` | List all slots with labels, default files, and active skill ids |
| `PUT` | `/api/skills/slots` | Activate or deactivate a skill for a slot (body: `{ slot, skillId: string | null }`) |
| `GET` | `/api/skills/community` | Browse public community skills (`?slot=` to filter) |
| `POST` | `/api/skills/community` | Like a skill (body: `{ skillId }`) — auth required |
| `POST` | `/api/skills/:id/publish` | Publish a personal skill to the community catalog |
| `POST` | `/api/skills/:id/fork` | Fork a community skill into personal library |

> **Note:** Community endpoints (`/publish`, `/fork`, `/community`) are implemented and available but the community UI (Skills Hub tab) is not yet exposed in the product. It is reserved for the corefirst-world cloud platform. See `corefirs-world/docs/features/skills-community.md`.

---

## Module Layout

```
src/lib/skills/
  index.ts          public exports
  types.ts          SkillDoc, SkillWithId, SkillPrefsDoc, SkillVar
  feature-slots.ts  FEATURE_SLOTS map + SLOT_LABELS + isFeatureSlot()
  loader.ts         loadSkill(slot, vars, userId?) — resolution + substitution
  store.ts          CRUD (createSkill, updateSkill, deleteSkill, getUserSkills)
                    community (publishSkill, forkSkill, likeSkill, listCommunitySkills)
                    preferences (getSkillPreferences, setSkillPreference)
                    seeding (seedSystemSkill, systemSkillId)

components/
  SkillsPanel.tsx   Modal UI — My Skills tab with inline editor per slot

app/api/skills/
  route.ts                    GET list / POST create
  [id]/route.ts               GET / PATCH / DELETE
  [id]/publish/route.ts       POST publish to community
  [id]/fork/route.ts          POST fork from community
  community/route.ts          GET browse / POST like
  slots/route.ts              GET slot list / PUT activate
```

---

## UI

The Skills panel opens via the ⚡ icon in the header. Each feature slot shows its current status:

- **System default** — no custom skill active
- **Custom ✓ [skill name]** — user's skill is active for this slot

Expanding a slot reveals:
1. Skill name field
2. Template textarea with `{{VAR}}` syntax highlighting (variable tags shown below)
3. Malformed-syntax error line
4. **Validate** / **Save & Activate** / **Reset to default** buttons

---

## Adding a New Prompt File

When a new LLM call is introduced:

1. Create a `.md` template file in `src/prompts/` (or the appropriate module directory)
2. Add the slot to `FEATURE_SLOTS` in `src/lib/skills/feature-slots.ts`
3. Add a human-readable label to `SLOT_LABELS` in the same file
4. Use `loadSkill(slot, vars, userId)` in the route instead of `loadPrompt(path, vars)`
5. Add the file to `outputFileTracingIncludes` in `next.config.js`

---

## References

- `src/lib/prompts/loader.ts` — `loadPrompt()`, `validatePromptTemplate()`
- `src/lib/skills/loader.ts` — `loadSkill()` (wraps loadPrompt with DB override)
- `corefirs-world/docs/features/skills-community.md` — community channel spec (FEAT-005)
