/**
 * CLI Tool to test real AI provider integrations.
 * Usage: npx tsx src/cli/test-ai.ts <capability> <provider> [prompt/text]
 * 
 * Examples:
 *   npx tsx src/cli/test-ai.ts text google "Hello, how are you?"
 *   npx tsx src/cli/test-ai.ts image ollama "A cute cat"
 *   npx tsx src/cli/test-ai.ts tts openai "Welcome to CoreFirst"
 */
import 'dotenv/config';
import { VisualFactory } from '../core/visuals/factory';
import { STTFactory } from '../core/stt/factory';
import { TTSFactory } from '../core/tts/factory';
import { buildTextModelFromSpec } from '../lib/ai/text/factory';
import { resolveFeature } from '../lib/ai/config';
import { getDefaultTextModel, getProviderDefault } from '../lib/ai/dynamic-config';
import { generateText } from 'ai';
import * as fs from 'fs';
import * as path from 'path';

function getDefaultImageModel(provider: string): string {
  return getProviderDefault(provider, 'text-to-image') || '';
}

async function main() {
  const [capability, provider, input, modelOverride] = process.argv.slice(2);

  if (!capability || !provider) {
    console.log('Usage: npx tsx src/cli/test-ai.ts <capability> <provider> [input] [model]');
    console.log('Capabilities: text, image, tts, stt');
    process.exit(1);
  }

  // FORCE ISOLATION: Clear feature-specific env vars if they don't match the requested provider.
  // This prevents "cross-talk" where a local Ollama URL/Model is used for a cloud provider.
  const featureKey = capability === 'image' ? 'IMAGE_GEN' : capability.toUpperCase();
  if (process.env[`${featureKey}_PROVIDER`] && process.env[`${featureKey}_PROVIDER`] !== provider) {
    delete process.env[`${featureKey}_PROVIDER`];
    delete process.env[`${featureKey}_MODEL`];
    delete process.env[`${featureKey}_BASE_URL`];
    delete process.env[`${featureKey}_API_KEY`];
  }

  // Force provider in env for resolveFeature to work consistently for the test
  const capabilityToEnv: Record<string, string> = {
    text: 'TEXT_PROVIDER',
    image: 'IMAGE_GEN_PROVIDER',
    tts: 'TTS_PROVIDER',
    stt: 'STT_PROVIDER'
  };
  if (capabilityToEnv[capability.toLowerCase()]) {
    process.env[capabilityToEnv[capability.toLowerCase()]] = provider;
  }

  console.log(`\n🚀 Testing [${capability}] via [${provider}]...`);

  try {
    switch (capability.toLowerCase()) {
      case 'text':
        await testText(provider, input || 'Say hello in 5 words.', modelOverride);
        break;
      case 'image':
        await testImage(provider, input || 'A simple educational illustration of a book.', modelOverride);
        break;
      case 'tts':
        await testTTS(provider, input || 'Hello, this is a test of the emergency broadcast system.', modelOverride);
        break;
      case 'stt':
        await testSTT(provider, input, modelOverride);
        break;
      default:
        console.error(`Unknown capability: ${capability}`);
    }
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error instanceof Error ? error.message : error);
    if ((error as any).cause) {
        console.error('Cause:', JSON.stringify((error as any).cause, null, 2));
    }
  }
}

async function testText(provider: string, prompt: string, modelName?: string) {
  let resolvedModel: string;
  let baseUrl: string | undefined;
  let apiKey: string | undefined;

  if (provider === 'ollama') {
    // For Ollama, prioritize .env
    resolvedModel = modelName || process.env.OLLAMA_MODEL || process.env.TEXT_MODEL || getDefaultTextModel('ollama');
    baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  } else {
    // For others, use static defaults directly unless manually overridden in CLI
    resolvedModel = modelName || getDefaultTextModel(provider);
    const keyName = `${provider.toUpperCase()}_API_KEY`;
    apiKey = process.env[keyName] || process.env.GLOBAL_API_KEY;
    baseUrl = undefined; // Force official cloud endpoint
  }
  
  const modelSpec = { 
    provider, 
    model: resolvedModel,
    baseUrl,
    apiKey
  };
  const model = buildTextModelFromSpec(modelSpec);
  
  console.log(`Provider: ${provider}`);
  console.log(`Model: ${resolvedModel}`);
  if (baseUrl) console.log(`Base URL: ${baseUrl}`);
  
  console.log(`Prompt: "${prompt}"`);
  const { text } = await generateText({
    model,
    prompt,
  });
  console.log(`\n✅ Response:\n${text}`);
}
async function testImage(provider: string, prompt: string, modelName?: string) {
  let resolvedModel: string;
  let baseUrl: string | undefined;
  let apiKey: string | undefined;

  if (provider === 'ollama') {
    // For Ollama, prioritize capability-specific model first, then provider-specific, then default
    resolvedModel = modelName || process.env.IMAGE_GEN_MODEL || process.env.OLLAMA_MODEL || getDefaultImageModel('ollama');
    baseUrl = process.env.IMAGE_GEN_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  } else {
    // For others, use static defaults and FORCE cloud endpoint by setting baseUrl to undefined
    resolvedModel = modelName || getDefaultImageModel(provider);
    const keyName = `${provider.toUpperCase()}_API_KEY`;
    apiKey = process.env[keyName] || process.env.GLOBAL_API_KEY;
    baseUrl = 'OFFICIAL_CLOUD'; // Marker to force official cloud endpoint
  }

  const visualProvider = VisualFactory.getProvider({ 
    provider, 
    apiKey: apiKey || '', 
    model: resolvedModel,
    baseUrl: baseUrl === 'OFFICIAL_CLOUD' ? undefined : baseUrl
  });
  
  console.log(`Provider: ${provider}`);
  console.log(`Model: ${resolvedModel}`);
  if (baseUrl) console.log(`Base URL: ${baseUrl}`);
  console.log(`Prompt: "${prompt}" (Size: 896x512)`);
  
  const startTime = Date.now();
  const dataUrl = await visualProvider.generateImage(prompt, { size: '896x512' });
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, 'base64');
  
  const tmpDir = path.join(process.cwd(), 'data', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const filename = `test-image-${provider}-${Date.now()}.webp`;
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, buffer);
  
  console.log(`\n✅ Success! (${duration}s)`);
  console.log(`Saved to: ${filePath}`);
}

async function testTTS(provider: string, text: string, modelName?: string) {
  const ttsProvider = TTSFactory.getProvider({ provider, model: modelName || '', apiKey: '' });
  console.log(`Text: "${text}"`);
  
  const audioBuffer = await ttsProvider.generateSpeech(text);
  
  const tmpDir = path.join(process.cwd(), 'data', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const filename = `test-tts-${provider}-${Date.now()}.mp3`;
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, Buffer.from(audioBuffer));
  
  console.log(`\n✅ Success!`);
  console.log(`Saved to: ${filePath}`);
}

async function testSTT(provider: string, filePath?: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Please provide a path to a valid audio file for STT testing.');
  }
  
  const sttProvider = STTFactory.getProvider({ provider, model: '', apiKey: '' });
  console.log(`File: ${filePath}`);
  
  const audioData = fs.readFileSync(filePath);
  const result = await sttProvider.transcribe(audioData);
  
  console.log(`\n✅ Transcript:\n${result.text}`);
}

main();
