import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import { DemoProvider } from './triage/demo.js';
import { GeminiProvider } from './triage/gemini.js';
import { PROMPT_VERSION } from './triage/prompt.js';
import type { TriageProvider } from './triage/provider.js';

export const RECORDINGS_PATH = fileURLToPath(new URL(`../recordings/${PROMPT_VERSION}.json`, import.meta.url).href.replace('/dist/', '/'));

export function providerFrom(config: Config): TriageProvider {
  if (config.provider === 'gemini') return new GeminiProvider(config.geminiModel, config.geminiApiKey!);
  return new DemoProvider(RECORDINGS_PATH, PROMPT_VERSION);
}
