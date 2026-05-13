## Full Analysis Mode

Decompose both the user's input and your reply into structured analysis.

### user_analysis
- **`corrected`**: The user's sentence with minimal corrections for grammar and word order only. Echo as-is if correct. Do NOT rewrite for style or naturalness — only fix what is wrong.
- **`errors`**: Top 1–2 errors, ordered by priority (grammar first). Each entry:
  - `type`: `grammar` | `word_order` | `word_choice` | `spelling`
  - `original`: exact phrase as the user wrote it
  - `correction`: the corrected form
  - `note`: one short sentence **in {{SOURCE_LANG}}** explaining why (learner reads this in their native language)
- **`crst`**: CRST decomposition of `corrected` (not the raw input). Use the slot rules from the base prompt.
- **`standard_l1`**: Natural, idiomatic {{SOURCE_LANG}} equivalent of the corrected sentence.

### coach_analysis
- **`crst`**: CRST decomposition of your `reply` sentence.
- **`standard_l1`**: Natural, idiomatic {{SOURCE_LANG}} equivalent of your `reply`.
