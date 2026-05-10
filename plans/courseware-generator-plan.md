# Implementation Plan: CFLT Courseware Generator (TypeScript Architecture)

> Feature: [Courseware Generator](../features/courseware-generator.md)
> Goal: Build an AI-driven engine in TypeScript (Node.js) to generate scenario-based educational content following the CFLT protocol (four-element Core-First sequence) with SSML audio tagging, ensuring seamless integration with future Next.js/React Native frontends.
> Terminology: the canonical project name is **CFLT — Core-First Language Theory** (the previously distinguished "CFLM — Core-First Language Method" runtime layer is deprecated and folded into CFLT); see `docs/research/meta_language_logic_manifesto.md` §10 for why "Meta-Language Logic" was rejected. Class names (e.g. `MLLTransformer`) and schema fields below still use the early scaffolding name `MLL*`; the code rename is tracked as a separate consolidated task.

## Component Breakdown

1. **Courseware Schema (`src/types/schema.ts`)**: Zod or TypeScript interfaces defining the `CoursewareManifest` output.
2. **Pedagogical Prompt Engine (`src/generator/prompts.ts`)**: System prompts designed to generate scenarios tailored to specific age groups and industries, ensuring the narrative fits MLL constraints.
3. **SSML & Prosody Annotator**: A specialized module that injects SSML tags (e.g., `<prosody pitch="+10%">`) around the identified `[Core Action]` blocks.
4. **Generator Service (`src/generator/courseware_gen.ts`)**: The orchestrator that takes user parameters, calls the LLM (via Google Gen AI SDK for Node), validates against the schema, and interfaces with the `MLLTransformer` for strict compliance auditing.

## Task Sequence (TDD Approach)

### Phase 1: Setup & Schema Design
- [x] **Task 1.1**: Initialize TypeScript project (`package.json`, `tsconfig.json`, install `@google/genai`, `zod`).
- [x] **Task 1.2**: Implement the core `MLLTransformer` in TypeScript (`src/core/transformer.ts`) to ensure a unified stack.
- [x] **Task 1.3**: Define the Zod Schema for `Courseware Manifest`.

### Phase 2: Prompt & Generator Implementation
- [x] **Task 2.1**: Design the base System Prompt for the Courseware LLM, including persona adaptation instructions.
- [x] **Task 2.2**: Implement `src/generator/client.ts` to handle scenario generation using the Gemini API.
- [x] **Task 2.3**: Implement `src/generator/orchestrator.ts` to tie together the prompt, LLM call, schema validation, and SSML injection.

### Phase 3: Testing & Refinement
- [ ] **Task 3.1**: Create `tests/generator.test.ts` using Vitest or Jest with mock LLM responses.
- [ ] **Task 3.2**: Test persona generation: e.g., "Hospital for 8-year-old" vs "Hospital for Medical Student".
- [ ] **Task 3.3**: Validate SSML tag syntax in the output.
- [x] **Task 3.4**: Create a CLI script (`src/cli/generate_course.ts`) to demonstrate end-to-end generation.
