# Implementation Plan: Phonetic Bridge & Gamified Roleplay

> Features: Phonetic Migration, Gamified Core-First Sorting, Dynamic Roleplay
> Status: Phase 1 Completed
> Terminology: the canonical project name is **CFLT — Core-First Language Theory** (the previously distinguished "CFLM — Core-First Language Method" runtime layer is deprecated and folded into CFLT); see `docs/research/meta_language_logic_manifesto.md` §10 for why "Meta-Language Logic" was rejected. Component names below (e.g. `MLLBuilder`) still use the early scaffolding name `MLL*`; the code rename is tracked as a separate consolidated task.

## Task Sequence (TDD Approach)

### Phase 1: Phonetic Bridge (Knowledge Migration) (Completed)
- [x] **Task 1.1**: Define the Phonetic Mapping Schema.
- [x] **Task 1.2**: Update `/api/speech-eval` prompt with Pinyin reference logic.
- [x] **Task 1.3**: Update the manifesto with Section 8: Phonetic Migration.

### Phase 2: Gamified MLL Builder (Frontend) (Completed)
- [x] **Task 2.1**: Implement `MLLBuilder` component using `framer-motion` Reorder.
- [x] **Task 2.2**: Add "Verify Logic" functionality.
- [x] **Task 2.3**: Integrated the builder into the main Course result cards.

### Phase 3: Dynamic Roleplay (Conversational AI)
- [ ] **Task 3.1**: Create `/api/roleplay` endpoint for multi-turn MLL conversation.
- [ ] **Task 3.2**: Build the Chat UI for MLL roleplaying.
