import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.corefirst');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface CoreFirstConfig {
  env?: Record<string, string>;
  dataDir?: string;
}

const KEY_TO_ENV: Record<string, string> = {
  provider:           'GLOBAL_PROVIDER',
  model:              'GLOBAL_MODEL',
  'text.provider':    'TEXT_PROVIDER',
  'text.model':       'TEXT_MODEL',
  'openai.key':       'OPENAI_API_KEY',
  'google.key':       'GOOGLE_API_KEY',
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
};

export const VALID_KEYS = Object.keys(KEY_TO_ENV);

export function load(): CoreFirstConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
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
  if (!KEY_TO_ENV[key] && key !== 'dataDir') {
    throw new Error(`Unknown config key "${key}". Valid keys: ${VALID_KEYS.join(', ')}, dataDir`);
  }
  validateValue(key, value);
  const config = load();
  if (key === 'dataDir') {
    config.dataDir = value;
  } else {
    config.env = config.env ?? {};
    config.env[key] = value;
  }
  save(config);
}

export function unset(key: string): void {
  const config = load();
  if (key === 'dataDir') {
    delete config.dataDir;
  } else {
    delete config.env?.[key];
  }
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
  if (config.dataDir && !process.env.COREFIRST_DATA_DIR) {
    process.env.COREFIRST_DATA_DIR = config.dataDir;
  }
}

export function listAll(): Array<{ key: string; value: string; envVar: string }> {
  const config = load();
  const result: Array<{ key: string; value: string; envVar: string }> = [];
  for (const [key, value] of Object.entries(config.env ?? {})) {
    const envVar = KEY_TO_ENV[key] ?? key;
    result.push({ key, value: maskKey(key, value), envVar });
  }
  if (config.dataDir) {
    result.push({ key: 'dataDir', value: config.dataDir, envVar: 'COREFIRST_DATA_DIR' });
  }
  return result;
}

function maskKey(key: string, value: string): string {
  if (key.endsWith('.key') && value.length > 8) {
    return value.slice(0, 4) + '****' + value.slice(-4);
  }
  return value;
}

export { CONFIG_FILE };
