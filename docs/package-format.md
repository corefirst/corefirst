# Package Format Specification — CoreFirst

> Version: 1.0.0 | Status: Active | Last Updated: 2026-05-07  
> Companion documents: `docs/storage-design.md`, `docs/tech-design.md`

---

## 1. Overview

This document is the authoritative technical specification for the two CoreFirst file formats: `.corefirst` (course package) and `.cfrecord` (learning record). It covers the complete schema for every field, the internal structure of each format, the algorithms used to generate packages, and the procedures for loading and exporting them.

Readers of this document are expected to be working on the CoreFirst application code or tooling. For a higher-level conceptual description of the storage model, see `docs/storage-design.md`.

---

## 2. The `.corefirst` Package Format

### 2.1 Container Structure (V2)

A `.corefirst` file is a **ZIP archive**. In V2, media assets are stored in a flat `media/` directory named by their SHA-256 hash.

```
<slug>.corefirst  (ZIP archive)
├── manifest.json           # Required — full CoursewareManifest
└── media/
    ├── abc123_...mp3       # Script audio named by hash
    ├── def456_...webp      # Lesson image named by hash
    └── ...
```

Existing V1 packages using `audio/` and `images/` directories are supported for backward compatibility but should be migrated to V2 for CAS benefits.

---

## 3. `manifest.json` Schema (V2)

### 3.1 `ScriptSchema` Extension

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audioHash` | string (hex) | Yes (V2) | SHA-256 hash of the `ssml` string. Used to resolve the file in `media/[hash].mp3`. |

### 3.2 `LessonSchema` Extension

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `imageHash` | string (hex) | No | SHA-256 hash of the first visual prompt. Used to resolve the file in `media/[hash].webp`. |

### 2.2 `manifest.json` Schema

`manifest.json` contains the serialized `CoursewareManifest` object. The complete schema follows.

#### 2.2.1 Top-Level Object

```json
{
  "packageId": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "it-english-adult",
  "topic": "Business Networking",
  "ageGroup": "adult",
  "industry": "IT",
  "sourceLang": "Chinese",
  "targetLang": "English",
  "createdAt": "2026-05-07T10:00:00.000Z",
  "version": "1",
  "lessons": [ ... ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `packageId` | string (UUID v4) | Yes | Canonical unique identifier for this package. Immutable after generation. Used to match against `.cfrecord` files. |
| `slug` | string | Yes | Human-readable filename base. Derived from `industry + targetLang + ageGroup`, lowercased and hyphenated. |
| `topic` | string | Yes | Course topic as requested by the learner. |
| `ageGroup` | string | Yes | Age group persona used during generation. Allowed values: `"adult"`, `"teen"`, `"child"`. |
| `industry` | string | Yes | Industry context injected into the generation prompt. |
| `sourceLang` | string | Yes | Learner's native language (full name, e.g., `"Chinese"`, `"Spanish"`). |
| `targetLang` | string | Yes | Target language being learned (full name, e.g., `"English"`, `"Japanese"`). |
| `createdAt` | string (ISO 8601) | Yes | UTC timestamp of package creation. |
| `version` | string | Yes | Package format version. Current value: `"1"`. Readers must reject packages with an unrecognized version. |
| `lessons` | array of `LessonSchema` | Yes | Ordered array of lesson objects. Minimum one lesson. |

#### 2.2.2 `LessonSchema` Object

Each element of `lessons[]` conforms to this schema.

```json
{
  "lessonIndex": 0,
  "title": "Breaking the Ice at a Tech Conference",
  "scenario_desc": "You are attending a tech conference and want to start a conversation with a fellow attendee.",
  "vocabulary_focus": [
    { "token": "leverage", "meaning": "to use something to its maximum advantage" }
  ],
  "visual_generation_prompts": [
    "A bustling tech conference hall with attendees networking, modern setting, professional atmosphere"
  ],
  "scripts": [ ... ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lessonIndex` | number (integer, 0-based) | Yes | Position of this lesson within the course. Determines file naming for audio and images. |
| `title` | string | Yes | Lesson title as generated. |
| `scenario_desc` | string | Yes | Scenario description providing situational context for the learner. |
| `vocabulary_focus` | array of `{ token: string, meaning: string }` | Yes | Key vocabulary items introduced in this lesson. |
| `visual_generation_prompts` | array of string | Yes | Image generation prompts. The first prompt (`[0]`) is used to generate `images/l{lessonIndex}.webp`. |
| `scripts` | array of `ScriptSchema` | Yes | Ordered dialogue lines within this lesson. |

#### 2.2.3 `ScriptSchema` Object

Each element of `lessons[].scripts[]` conforms to this schema.

```json
{
  "scriptIndex": 0,
  "speaker": "User",
  "cfltL1": "[核心动作: 很高兴认识你] [条件: 在这次会议上] [空间: 在技术展台旁边]",
  "cfltL2": "[Core Action: Nice to meet you] [Condition: at this conference] [Space: near the tech booth]",
  "standardL2": "It's great meeting you here at the tech booth.",
  "ssml": "<speak>It's great meeting you here at the <emphasis level=\"strong\">tech booth</emphasis>.</speak>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scriptIndex` | number (integer, 0-based) | Yes | Position of this script within the lesson. Used to derive the audio filename `l{lessonIndex}s{scriptIndex}.mp3`. |
| `speaker` | string | Yes | Speaker label. Typically `"User"` or `"AI Coach"`. |
| `cfltL1` | string | Yes | Script line restructured into the CFLT four-element sequence in the learner's native language. |
| `cfltL2` | string | Yes | Token-swapped CFLT output in the target language. Used for the CFLT block arrangement puzzle. |
| `standardL2` | string | Yes | Polished idiomatic target-language sentence. Shown after the puzzle is completed. |
| `ssml` | string | Yes | SSML markup of `standardL2` with prosody tags on the `[Core Action]` block. Consumed by the TTS provider at generation time to produce the audio file. |

### 2.3 Audio File Naming

Audio files are stored under `audio/` using the pattern `l{lessonIndex}s{scriptIndex}.mp3`:

- Both indices are **0-based integers**.
- The audio file for lesson `i`, script `j` is `audio/l{i}s{j}.mp3`.
- Audio files are **pre-rendered at package creation time** from `ScriptSchema.ssml` via the TTS provider.
- The total number of audio files equals the sum of `scripts.length` across all lessons.

Examples:

| Lesson Index | Script Index | Audio File Path |
|-------------|-------------|-----------------|
| 0 | 0 | `audio/l0s0.mp3` |
| 0 | 4 | `audio/l0s4.mp3` |
| 2 | 1 | `audio/l2s1.mp3` |

### 2.4 Image File Naming

Images are stored under `images/` using the pattern `l{lessonIndex}.webp`:

- One image per lesson, derived from `LessonSchema.visual_generation_prompts[0]`.
- The image for lesson `i` is `images/l{i}.webp`.
- Images are **optional**. A `.corefirst` package is valid even if the `images/` directory is absent or partially populated.
- Format is WebP to balance quality and file size.

---

## 3. The `.cfrecord` Learning Record Format

### 3.1 Container Structure

A `.cfrecord` file is a **plain UTF-8 JSON file**. It is human-readable and can be opened in any text editor.

```json
{
  "packageId": "550e8400-e29b-41d4-a716-446655440000",
  "packageSlug": "it-english-adult",
  "lastStudiedAt": "2026-05-07T14:30:00.000Z",
  "lessons": [ ... ],
  "vocabulary": [ ... ],
  "transforms": [ ... ],
  "roleplaySessions": [ ... ]
}
```

### 3.2 Top-Level Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `packageId` | string (UUID v4) | Yes | The `packageId` of the associated `.corefirst` package. Primary key for matching. |
| `packageSlug` | string | Yes | Slug of the associated package. Used as the filename base and as a human-readable reference. |
| `lastStudiedAt` | string (ISO 8601) | Yes | Timestamp of the most recent study session. Updated on every write. |
| `lessons` | array of lesson progress objects | Yes | Per-lesson progress. Indexed to match `LessonSchema.lessonIndex`. |
| `vocabulary` | array of `VocabularyRecord` | Yes | Vocabulary mastery records. May be empty array. |
| `transforms` | array of `TransformRecord` | Yes | Transform Mode history. May be empty array. |
| `roleplaySessions` | array of `RoleplaySessionRecord` | Yes | Roleplay sessions. May be empty array. |

### 3.3 Lesson Progress Object

Each entry in `lessons[]` corresponds to one lesson in the `.corefirst` package.

```json
{
  "lessonIndex": 0,
  "scripts": [
    {
      "scriptIndex": 0,
      "puzzleCompleted": true,
      "attempts": [ ... ]
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `lessonIndex` | number (integer, 0-based) | Corresponds to `LessonSchema.lessonIndex`. |
| `scripts` | array of script progress objects | Per-script progress. |
| `scripts[].scriptIndex` | number (integer, 0-based) | Corresponds to `ScriptSchema.scriptIndex`. |
| `scripts[].puzzleCompleted` | boolean | Whether the learner has successfully completed the CFLT block arrangement puzzle for this script. Default `false`. |
| `scripts[].attempts` | array of `AttemptRecord` | Voice attempt records for this script. May be empty array. |

### 3.4 `AttemptRecord` Schema

Each element of `scripts[].attempts[]` records one voice attempt by the learner.

```json
{
  "createdAt": "2026-05-07T14:31:00.000Z",
  "transcription": "It's great meeting you here at the tech booth.",
  "overallScore": 87,
  "pronunciation": 91,
  "logicStress": 83,
  "feedback": "Good emphasis on 'meeting'. Try to stress 'tech booth' more firmly.",
  "scoreCoreAction": null,
  "scoreCondition": null,
  "scoreSpaceContext": null,
  "scoreTime": null
}
```

| Field | Type | Nullable | Phase | Description |
|-------|------|----------|-------|-------------|
| `createdAt` | string (ISO 8601) | No | 1 | Timestamp of the attempt. |
| `transcription` | string | No | 1 | STT-transcribed text of the learner's actual utterance. |
| `overallScore` | number (0–100) | No | 1 | Composite score. |
| `pronunciation` | number (0–100) | No | 1 | Phonetic accuracy score. |
| `logicStress` | number (0–100) | No | 1 | Prosodic emphasis score for the `[Core Action]` block. A CoreFirst-specific signal: correct stress on the Core Action element is the primary CFLT prosody marker. |
| `feedback` | string | No | 1 | Natural-language coaching feedback generated by the LLM evaluator. |
| `scoreCoreAction` | number (0–100) | Yes | 2 | Per-block CFLT accuracy for the `[Core Action/Result]` element. Null in Phase 1. |
| `scoreCondition` | number (0–100) | Yes | 2 | Per-block CFLT accuracy for the `[Condition/Reason]` element. Null in Phase 1. |
| `scoreSpaceContext` | number (0–100) | Yes | 2 | Per-block CFLT accuracy for the `[Space/Context]` element. Null in Phase 1. |
| `scoreTime` | number (0–100) | Yes | 2 | Per-block CFLT accuracy for the `[Time]` element. Null in Phase 1. |

Phase 2 fields are present in Phase 1 records as `null`. No record migration is required when Phase 2 scoring is activated.

### 3.5 `VocabularyRecord` Schema

Each entry in `vocabulary[]` tracks the learner's mastery of a single vocabulary token using the SM-2 spaced repetition algorithm.

```json
{
  "token": "leverage",
  "meaning": "to use something to its maximum advantage",
  "mastery": 60,
  "interval": 4,
  "easeFactor": 2.5,
  "nextReviewAt": "2026-05-11T00:00:00.000Z",
  "reviewCount": 3,
  "lapseCount": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `token` | string | Vocabulary token (word or phrase). |
| `meaning` | string | Definition or translation in the learner's native language. |
| `mastery` | number (0–100) | Presentation-layer mastery score. Derived from `interval` and `reviewCount` for UI display; not used by the SM-2 scheduler directly. |
| `interval` | number (integer, days) | Current SM-2 review interval. Starts at `1`. Grows multiplicatively with each successful review. |
| `easeFactor` | number (float) | SM-2 ease factor. Starts at `2.5`. Decreases on lapses; floor is `1.3`. |
| `nextReviewAt` | string (ISO 8601) | Scheduled next review timestamp, computed as `now + interval days`. |
| `reviewCount` | number (integer) | Total number of review events, successful or not. |
| `lapseCount` | number (integer) | Number of times the item has regressed (a previously-mastered item was answered incorrectly). |

**Uniqueness:** One `VocabularyRecord` per `token`. If the same token appears in multiple lessons, mastery is tracked once and applies across all occurrences.

### 3.6 `TransformRecord` Schema

Each entry in `transforms[]` records one invocation of Transform Mode that was associated with this course package.

```json
{
  "inputText": "我想在会议上认识新朋友",
  "sourceLang": "Chinese",
  "targetLang": "English",
  "cfltL1": "[核心动作: 认识新朋友] [条件: 想要] [空间: 在会议上]",
  "cfltL2": "[Core Action: make new friends] [Condition: I want to] [Space: at the conference]",
  "standardL2": "I'd love to make new connections at the conference.",
  "createdAt": "2026-05-07T09:15:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `inputText` | string | Raw user input before transformation. |
| `sourceLang` | string | Learner's native language at time of transform. |
| `targetLang` | string | Target language at time of transform. |
| `cfltL1` | string | Input restructured into CFLT four-element sequence in native language. |
| `cfltL2` | string | Token-swapped CFLT output in target language. |
| `standardL2` | string | Polished idiomatic target-language output. |
| `createdAt` | string (ISO 8601) | Timestamp of the transform invocation. |

### 3.7 `RoleplaySessionRecord` Schema

Each entry in `roleplaySessions[]` records one Roleplay Mode conversation thread.

```json
{
  "sessionId": "11111111-2222-4333-8444-555555555555",
  "context": "Job interview for a senior software engineer role at a startup",
  "sourceLang": "Chinese",
  "targetLang": "English",
  "createdAt": "2026-05-07T11:00:00.000Z",
  "messages": [
    {
      "role": "assistant",
      "content": "Welcome! Please tell me about yourself.",
      "createdAt": "2026-05-07T11:00:05.000Z"
    },
    {
      "role": "user",
      "content": "I have five years of experience in backend development.",
      "createdAt": "2026-05-07T11:00:45.000Z"
    }
  ]
}
```

**Top-level fields:**

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string (UUID v4) | Stable session identifier minted by the client on the first turn. Subsequent `/api/roleplay` POSTs with the same `sessionId` append to this entry; new IDs create new entries. Required. |
| `context` | string | Scenario/persona description injected into the system prompt for this session. |
| `sourceLang` | string | Learner's native language. |
| `targetLang` | string | Target language. |
| `createdAt` | string (ISO 8601) | Session creation timestamp. |
| `messages` | array of `MessageRecord` | Ordered conversation turns. |

**`MessageRecord` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `"user"` or `"assistant"`. |
| `content` | string | Raw message text. |
| `createdAt` | string (ISO 8601) | Message timestamp. Used to reconstruct turn order. |

---

## 4. Package Generation Flow

When the Courseware Generator creates a new course, it produces a `.corefirst` package in four sequential stages.

### Stage 1 — Generate CoursewareManifest

The orchestrator calls the LLM with a structured courseware prompt. The LLM returns a `CoursewareManifest` object conforming to `CoursewareManifestSchema` (see `src/types/courseware.ts`). The manifest includes all lesson titles, scenario descriptions, vocabulary focus items, visual prompts, and all script fields including CFLT representations and SSML. A `packageId` UUID is generated at this point and written into the manifest.

**Input:** `{ topic, ageGroup, industry, sourceLang, targetLang }`  
**Output:** `CoursewareManifest` (all fields except audio/image paths, which are determined by index)

### Stage 2 — Render Audio

For each script in each lesson, the orchestrator calls the TTS provider with `script.ssml`:

```
for each lesson[i]:
  for each lesson[i].scripts[j]:
    audioBuffer = TTS.synthesize(scripts[j].ssml)
    save audioBuffer → audio/l{i}s{j}.mp3
```

Audio files are generated in lesson order, then script order within each lesson. All audio files must be present before bundling.

**TTS provider:** Configured via `TTS_PROVIDER` environment variable. See `src/core/tts/`.

### Stage 3 — Render Images (Optional)

For each lesson, the orchestrator calls the image generation provider with `lesson.visual_generation_prompts[0]`:

```
for each lesson[i]:
  imageBuffer = ImageGen.generate(lesson[i].visual_generation_prompts[0])
  save imageBuffer → images/l{i}.webp
```

Image generation is optional. If the image provider is unavailable or the generation fails, the package is still written without the `images/` directory. The application handles absent images gracefully.

**Image provider:** The `imageGen` feature picks provider + model via the standard precedence — `IMAGE_GEN_PROVIDER` / `IMAGE_GEN_MODEL` (per-feature) > `TEXT_TO_IMAGE_PROVIDER` (capability default) > baked-in `google` / `imagen-4.0-generate-001`. Implementation: `src/lib/ai/text-to-image/`.

### Stage 4 — Bundle into ZIP

The orchestrator assembles the final archive:

```
zip = ZipWriter()
zip.add("manifest.json", JSON.stringify(manifest, null, 2))
for each audio file:
  zip.add("audio/l{i}s{j}.mp3", audioBuffer)
for each image file (if generated):
  zip.add("images/l{i}.webp", imageBuffer)
zip.write("data/packages/{slug}.corefirst")
```

The slug is derived from the manifest fields: `{industry}-{targetLang}-{ageGroup}`, lowercased and hyphenated. The `data/packages/` directory is created if it does not exist.

After writing the package file, the orchestrator creates an empty `.cfrecord` stub in `data/records/{slug}.cfrecord` to establish the record file for this package.

---

## 5. Package Import Flow

To load a `.corefirst` package for study, the application follows these steps.

### Step 1 — Read and Validate the Archive

```
archive = ZipReader.open("data/packages/{slug}.corefirst")
manifestJson = archive.readEntry("manifest.json")
manifest = JSON.parse(manifestJson)

if manifest.version !== SUPPORTED_VERSION:
  throw PackageVersionError(manifest.version)
```

Validation checks: `packageId` is a valid UUID, `version` is a recognized value, `lessons` is a non-empty array, all `lessonIndex` and `scriptIndex` values are sequential non-negative integers.

### Step 2 — Resolve the Learning Record

```
candidatePath = "data/records/" + manifest.slug + ".cfrecord"

if fileExists(candidatePath):
  record = JSON.parse(readFile(candidatePath))
  if record.packageId === manifest.packageId:
    // Progress matched by packageId — restore
  else:
    // Slug collision, different package — create new record
    record = createEmptyRecord(manifest)
else:
  record = createEmptyRecord(manifest)
  writeFile(candidatePath, JSON.stringify(record))
```

Matching is always performed by `packageId`, not by slug. A slug collision (two different packages producing the same slug) results in a new record file.

### Step 3 — Load Audio on Demand

Audio files are loaded lazily from the archive as the learner progresses through scripts:

```
function getAudio(lessonIndex, scriptIndex):
  path = "audio/l" + lessonIndex + "s" + scriptIndex + ".mp3"
  return archive.readEntry(path)  // returns ArrayBuffer
```

The archive is kept open for the duration of the study session and closed when the learner exits the course. Audio buffers are not cached in memory; each playback request reads from the archive.

---

## 6. Learning Record Export Flow

A `.cfrecord` file can be exported at any time. Because it is a plain JSON file, no serialization step is required beyond reading the file from disk.

### Programmatic Export

```
sourcePath = "data/records/" + slug + ".cfrecord"
destinationPath = userChosenDestination + "/" + slug + ".cfrecord"
copyFile(sourcePath, destinationPath)
```

### Import on Another Device

```
copyFile(userProvidedPath, "data/records/" + slug + ".cfrecord")
// The application will match it to the package on next launch via packageId
```

If a `.cfrecord` file is placed in `data/records/` and no matching `.corefirst` package is present in `data/packages/`, the record is loaded but the course content is unavailable. The application displays a prompt asking the learner to import the corresponding package.

---

## 7. Version Field and Format Evolution

The `version` field in `manifest.json` is a string representing the package format version. The current value is `"1"`.

| Version | Description |
|---------|-------------|
| `"1"` | Initial format. This specification. |

**Forward-compatibility rules:**

- The application must reject packages with a `version` value it does not recognize.
- New required fields added in a future version must not share names with existing fields unless they replace them with backward-compatible semantics.
- New optional fields added to `manifest.json` must be ignored by older readers (tolerant reader principle).
- The `.cfrecord` format does not carry an explicit version field in v1. If the format evolves, a `version` field will be added to the top-level object.

---

## 8. Related Documents

- `docs/storage-design.md` — High-level storage architecture, directory layout, naming conventions, and sync model
- `docs/tech-design.md` — System architecture, module breakdown, and API route design
- `docs/prd.md` — Product requirements and feature priorities
- `docs/features/courseware-generator.md` — Courseware Generator feature spec
- `src/types/courseware.ts` — Zod schema for `CoursewareManifestSchema`
- `src/core/tts/` — TTS provider interface and implementations
- `src/core/visuals/` — Image generation provider interface and implementations
