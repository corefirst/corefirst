## CRITICAL — JSON Output Discipline
Your previous attempt produced output that was either invalid JSON or did not
match the expected schema. Re-emit the manifest with strict adherence:
- Output a SINGLE JSON object — no prose, no markdown fences, no commentary.
- Every string value must be a valid JSON string. If you include SSML, escape
  every double-quote inside it as \".
- If you cannot reliably embed SSML markup, omit the `ssml` field entirely
  (it has a safe default).
- Do not truncate. If a field would push you over budget, shorten its prose;
  do not leave the JSON object incomplete.
