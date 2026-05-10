# Implementation Plan: Logic Transformer Engine (TypeScript)

> Feature: [Logic Transformer](../features/logic-transformer.md)
> Status: COMPLETED
> Terminology: the canonical project name is **CFLT — Core-First Language Theory** (the previously distinguished "CFLM — Core-First Language Method" runtime layer is deprecated and folded into CFLT); see `docs/research/meta_language_logic_manifesto.md` §10 for why "Meta-Language Logic" was rejected. Code identifiers below still use the early scaffolding name `MLL*` / `mll_*`; the code rename is tracked as a separate consolidated task.

## Component Breakdown

1. **MLL Prompt Engine**: Specialized system prompt enforcing MLL rules (`src/core/system_prompt.md`).
2. **Transformer Service**: Next.js API and TypeScript core logic interacting with Gemini.
3. **Validation Layer**: Zod-based validation to ensure JSON output integrity (`src/types/mll.ts`).
4. **Correction Extractor**: Logic to extract "Grammar Overlay" diffs from the LLM response.

## Task Sequence (Completed)

### Phase 1: Core Prompt & Schema
- [x] **Task 1.1**: Define the MLL JSON Output Schema using Zod.
- [x] **Task 1.2**: Design the MLL System Prompt (v2.0 language-agnostic).
- [x] **Task 1.3**: Create manual test vectors (Input -> Expected MLL Structure).

### Phase 2: Implementation
- [x] **Task 2.1**: Set up TypeScript environment and install `@google/generative-ai`.
- [x] **Task 2.2**: Implement `src/core/client.ts` - unified LLM wrapper.
- [x] **Task 2.3**: Implement `src/core/transformer.ts` - the main transformation logic.
- [x] **Task 2.4**: Implement `app/api/transform/route.ts` - API endpoint.

### Phase 3: Testing & Refinement
- [x] **Task 3.1**: Create `tests/generator.test.ts` (covering cross-logic validation).
- [x] **Task 3.2**: Refine System Prompt for Any-to-Any language support.
- [x] **Task 3.3**: Verify "Grammar Overlay" and MLL Block rendering in UI.
