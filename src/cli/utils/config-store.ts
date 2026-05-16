import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.corefirst');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface CoreFirstConfig {
  env?: Record<string, string>;   // all keys map 1:1 to a process.env var via KEY_TO_ENV
  skills?: Record<string, string>; // reserved: feature-slot prompt overrides (not yet used)
  /** @deprecated moved into env.dataDir — read for backwards compat only */
  dataDir?: string;
}

const KEY_TO_ENV: Record<string, string> = {
  provider:           'GLOBAL_PROVIDER',
  model:              'GLOBAL_MODEL',
  'text.provider':    'TEXT_PROVIDER',
  'text.model':       'TEXT_MODEL',
  'openai.key':       'OPENAI_API_KEY',
  'google.key':       'GOOGLE_GENERATIVE_AI_API_KEY',
  'anthropic.key':    'ANTHROPIC_API_KEY',
  'openrouter.key':   'OPENROUTER_API_KEY',
  'groq.key':         'GROQ_API_KEY',
  'deepseek.key':     'DEEPSEEK_API_KEY',
  'qwen.key':         'DASHSCOPE_API_KEY',
  'ollama.url':       'OLLAMA_BASE_URL',
  'tts.provider':     'TTS_PROVIDER',
  'tts.model':        'TTS_MODEL',
  'stt.provider':     'STT_PROVIDER',
  'image.provider':   'IMAGE_GEN_PROVIDER',
  'image.model':      'IMAGE_GEN_MODEL',
  dataDir:            'COREFIRST_DATA_DIR',
};

export const VALID_KEYS = Object.keys(KEY_TO_ENV);

export function load(): CoreFirstConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as CoreFirstConfig;
    // Migrate legacy top-level dataDir → env.dataDir
    if (raw.dataDir && !raw.env?.['dataDir']) {
      raw.env = { ...raw.env, dataDir: raw.dataDir };
      delete raw.dataDir;
      save(raw);
    }
    return raw;
  } catch (err) {
    process.stderr.write(
      `Warning: config file corrupted at ${CONFIG_FILE} — ${err instanceof Error ? err.message : String(err)}\n` +
      `Run "corefirst config init" to reconfigure.\n`,
    );
    return {};
  }
}

export function save(config: CoreFirstConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function get(key: string): string | undefined {
  const config = load();
  return config.env?.[key];
}

const URL_KEYS = new Set(['ollama.url', 'tts.provider', 'stt.provider']);

function validateValue(key: string, value: string): void {
  if (key.endsWith('.url')) {
    try {
      new URL(value);
    } catch {
      throw new Error(`"${value}" is not a valid URL for key "${key}"`);
    }
  }
}

export function set(key: string, value: string): void {
  if (!KEY_TO_ENV[key]) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${VALID_KEYS.join(', ')}`);
  }
  validateValue(key, value);
  const config = load();
  config.env = config.env ?? {};
  config.env[key] = value;
  save(config);
}

export function unset(key: string): void {
  const config = load();
  delete config.env?.[key];
  save(config);
}

export function applyToEnv(): void {
  const config = load();
  for (const [key, value] of Object.entries(config.env ?? {})) {
    const envVar = KEY_TO_ENV[key];
    if (envVar && !process.env[envVar]) {
      process.env[envVar] = value;
    }
  }
}

// Returns true when at least one AI provider credential is configured (via
// stored config OR pre-existing env vars). Used by commands to gate execution.
export function hasProvider(): boolean {
  applyToEnv();
  const apiKeyVars = [
    'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY',
    'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY',
    'DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY', 'GLOBAL_PROVIDER',
  ];
  return apiKeyVars.some((v) => !!process.env[v]);
}

export function listAll(): Array<{ key: string; value: string; envVar: string }> {
  const config = load();
  return Object.entries(config.env ?? {}).map(([key, value]) => ({
    key,
    value: maskKey(key, value),
    envVar: KEY_TO_ENV[key] ?? key,
  }));
}

function maskKey(key: string, value: string): string {
  if (key.endsWith('.key') && value.length > 8) {
    return value.slice(0, 4) + '****' + value.slice(-4);
  }
  return value;
}

export { CONFIG_FILE };
