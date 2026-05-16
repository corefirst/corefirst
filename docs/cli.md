# CoreFirst CLI

`corefirst` is the command-line interface for CoreFirst — it lets you run transforms, generate courses, start the web server, and launch the desktop app, all without touching a browser.

---

## Installation

### Global (npm)

```bash
npm install -g corefirst
# or
pnpm add -g corefirst
```

After install, the `corefirst` binary is available anywhere.

### From source (dev mode)

```bash
git clone https://github.com/corefirst/corefirst.git
cd corefirst
pnpm install

# Run directly from TypeScript source (no build step needed):
npx tsx src/cli/index.ts --help

# Or build once and use the compiled binary:
pnpm build:cli
node dist/cli/index.js --help
```

---

## Configuration

The CLI reads settings from `~/.corefirst/config.json`. Set them once, use them everywhere.

### Interactive setup wizard

```bash
corefirst config init
```

### Manual key-value

```bash
# Pick an AI provider
corefirst config set provider openai

# Set API keys
corefirst config set openai.key      sk-...
corefirst config set google.key      AIza...
corefirst config set anthropic.key   sk-ant-...

# Override per-feature provider
corefirst config set text.provider   anthropic
corefirst config set text.model      claude-sonnet-4-6

# Local Ollama
corefirst config set provider        ollama
corefirst config set ollama.url      http://localhost:11434

# Where to store CLI-generated data (default: ~/.corefirst/data)
corefirst config set dataDir         /path/to/my/data
```

### View current config

```bash
corefirst config list          # all saved values (keys are masked)
corefirst config get openai.key
corefirst config keys          # show all available keys + env var names
```

### Remove a value

```bash
corefirst config unset text.provider
```

### All config keys

| Key | Maps to env var | Description |
|-----|----------------|-------------|
| `provider` | `GLOBAL_PROVIDER` | Default AI provider |
| `model` | `GLOBAL_MODEL` | Default model |
| `text.provider` | `TEXT_PROVIDER` | Override for text generation |
| `text.model` | `TEXT_MODEL` | Override for text model |
| `openai.key` | `OPENAI_API_KEY` | |
| `google.key` | `GOOGLE_API_KEY` | |
| `anthropic.key` | `ANTHROPIC_API_KEY` | |
| `openrouter.key` | `OPENROUTER_API_KEY` | |
| `groq.key` | `GROQ_API_KEY` | |
| `deepseek.key` | `DEEPSEEK_API_KEY` | |
| `qwen.key` | `DASHSCOPE_API_KEY` | |
| `ollama.url` | `OLLAMA_BASE_URL` | |
| `tts.provider` | `TTS_PROVIDER` | |
| `tts.model` | `TTS_MODEL` | |
| `stt.provider` | `STT_PROVIDER` | |
| `image.provider` | `IMAGE_GEN_PROVIDER` | |
| `image.model` | `IMAGE_GEN_MODEL` | |
| `dataDir` | `COREFIRST_DATA_DIR` | |

**Priority order:** existing `process.env` > `.env` in cwd > `~/.corefirst/config.json`.

---

## Commands

### `transform`

Transform any sentence into CFLT order.

```bash
corefirst transform <text> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--from <lang>` | `English` | Source / L1 language |
| `--to <lang>` | `Chinese` | Target / L2 language |
| `--ui <lang>` | same as `--from` | Language for explanations |
| `--json` | — | Output raw JSON |

**Examples:**

```bash
corefirst transform "I didn't go out because it rained"
corefirst transform "我没出去，因为下雨" --from Chinese --to English
corefirst transform "Je suis allé à l'école hier" --from French --to English --ui French
corefirst transform "Hello world" --json
```

### `generate-course` (alias: `gen`)

Generate a multi-lesson bilingual course package.

```bash
corefirst generate-course [options]
corefirst gen [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--topic <topic>` | `At the Zoo` | Course topic |
| `--from <lang>` | `English` | Source / L1 language |
| `--to <lang>` | `Chinese` | Target / L2 language |
| `--age <group>` | `Young Learner (Age 12+)` | Age group |
| `--domain <domain>` | `General / Life` | Domain context |
| `--json` | — | Output raw JSON manifest |

**Valid age groups:**
- `Young Child (Under 12)`
- `Young Learner (Age 12+)`
- `Teenager`
- `Adult / Professional`

**Valid domains:** `General / Life`, `Stories / Fairy Tales`, `Animals / Nature`, `Arts & Crafts`, `Music / Songs`, `School / Academic`, `Hobbies / Interests`, `Sports / Recreation`, `Social / Daily Life`, `IT / Software Engineering`, `Medical / Healthcare`, `Business / Finance`, `Legal / Law`, `Education / Teaching`, `Design / Creative`, `Sales / Marketing`, `Travel / Hospitality`, `Logistics / Operations`

**Examples:**

```bash
corefirst gen --topic "Coffee Shop" --from English --to Spanish
corefirst gen --topic "At the Hospital" --age "Adult / Professional" --domain "Medical / Healthcare"
corefirst gen --topic "Zoo Visit" --age "Young Child (Under 12)" --json > course.json
```

### `serve`

Start the CoreFirst web server.

```bash
corefirst serve [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <port>` | `3000` | Port to listen on |
| `--host <host>` | `localhost` | Host to bind |

Looks for a pre-built app in this order:
1. `.next/standalone/server.js` in cwd — fastest, used in production
2. `next start` in cwd — if `.next/` exists but no standalone

```bash
# From the project directory after building:
pnpm build
corefirst serve

# Custom port / public host:
corefirst serve --port 8080 --host 0.0.0.0
```

### `app`

Launch the CoreFirst desktop app (Electron).

```bash
corefirst app
```

Requires Electron to be installed and `electron/main.js` to exist in cwd. Run from the project root after `pnpm install`.

```bash
# From project directory:
corefirst app
# Equivalent to: pnpm electron:dev
```

### `config`

Manage `~/.corefirst/config.json`. See [Configuration](#configuration) above.

```
corefirst config set <key> <value>
corefirst config get <key>
corefirst config unset <key>
corefirst config list
corefirst config keys
corefirst config init
```

---

## Dev mode (from source)

When working on CoreFirst itself, run CLI commands directly from TypeScript without a build step:

```bash
# One-off command
npx tsx src/cli/index.ts transform "Hello" --from English --to Chinese

# Or set a shell alias for the session:
alias cf="npx tsx src/cli/index.ts"
cf transform "Hello"
cf gen --topic "Coffee Shop"
cf config list
```

Environment variables from `.env` in the project root are automatically loaded.

---

## Build

### Build the CLI binary

```bash
pnpm build:cli
# Output: dist/cli/index.js  (1.2 MB, self-contained CJS bundle)
```

The build uses [tsup](https://tsup.egoist.dev) (esbuild) and takes < 1 second. `next`, `electron`, and native addons are externalized — only the AI SDK, Commander, and utilities are bundled.

### Verify the build

```bash
node dist/cli/index.js --version
node dist/cli/index.js --help
node dist/cli/index.js config keys
```

### Publish to npm

```bash
# Dry run first:
npm publish --dry-run

# When ready:
npm publish
# prepublishOnly runs pnpm build:cli automatically
```

---

## Build the desktop app

### Prerequisites

| Platform | What you need |
|----------|--------------|
| **Mac** | macOS + Xcode Command Line Tools (`xcode-select --install`) |
| **Windows** | Windows 10+ or cross-compile from Mac/Linux (electron-builder handles it) |
| **Linux** | Any x64 Linux with `fuse` for AppImage (or Docker) |

### Step 1 — build Next.js

```bash
pnpm build          # produces .next/standalone/ used by Electron
```

### Step 2 — build Electron JS

```bash
pnpm build:cli      # also compiles electron/main.ts → electron/main.js
```

### Step 3 — package for your platform

```bash
# Mac (.dmg, universal arm64 + x64)
pnpm electron:build

# Or target a specific platform explicitly:
npx electron-builder --mac
npx electron-builder --win
npx electron-builder --linux

# Cross-compile from Mac → Windows (requires Wine or Docker):
npx electron-builder --win --x64
```

Output goes to `release/`:

| Platform | Output |
|----------|--------|
| Mac | `release/CoreFirst-<version>-arm64.dmg`, `CoreFirst-<version>.dmg` |
| Windows | `release/CoreFirst Setup <version>.exe` |
| Linux | `release/CoreFirst-<version>.AppImage` |

### Dev mode (Electron without packaging)

```bash
# 1. Build Next.js first (required — Electron loads standalone server)
pnpm build

# 2. Start Electron pointing at the built app
pnpm electron:dev
# Equivalent to: electron electron/main.js
```

Or combine:

```bash
pnpm build && pnpm electron:dev
```

The Electron window connects to a locally spawned Next.js server on a free port. The server URL is logged to stdout.

---

## Web app (PWA)

The web app is automatically installable as a PWA on any browser that supports it (Chrome, Safari, Edge):

1. Visit the hosted URL (or `http://localhost:3000` when running locally)
2. Browser shows an "Add to Home Screen" / install prompt
3. The app installs as a standalone window — works on desktop and mobile

PWA assets:
- `public/manifest.json` — app metadata
- `public/sw.js` — service worker (cache-first for static assets, network-only for API calls)
- `public/icons/icon-192.png`, `icon-512.png` — home screen icons

---

## Environment variables

The CLI applies configuration in this priority order:

1. Existing `process.env` (shell environment / CI)
2. `.env` file in the current working directory
3. `~/.corefirst/config.json` (set via `corefirst config set …`)

This means you can override any saved config for a single command:

```bash
GOOGLE_API_KEY=AIza... corefirst transform "Hello"
TEXT_PROVIDER=ollama corefirst gen --topic "Zoo"
```
