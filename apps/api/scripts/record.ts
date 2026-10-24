// Records real model responses for the demo seed and intake samples, so demo mode and CI never need a key.
// Usage: npm run record            (records only texts without a recording)
//        npm run record -- --all   (re-records everything for the current prompt version)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseModelOutput } from '@playnt/shared';
import { loadConfig } from '../src/config.js';
import { RECORDINGS_PATH } from '../src/providers.js';
import { loadDevices, loadSeed } from '../src/seed.js';
import { recordingKey, type RecordingFile } from '../src/triage/demo.js';
import { GeminiProvider } from '../src/triage/gemini.js';
import { buildTriageRequest, PROMPT_VERSION } from '../src/triage/prompt.js';

const config = loadConfig({ ...process.env, TRIAGE_PROVIDER: 'gemini' });
const provider = new GeminiProvider(config.geminiModel, config.geminiApiKey!);
const all = process.argv.includes('--all');
const recordings: RecordingFile = existsSync(RECORDINGS_PATH) && !all ? JSON.parse(readFileSync(RECORDINGS_PATH, 'utf8')) : {};
const devices = new Map(loadDevices().map((d) => [d.ref, d]));
const seed = loadSeed();
const items = [...seed.history, ...seed.queue, ...seed.samples].filter((i) => ('record' in i ? i.record !== false : true));

let made = 0;
for (const item of items) {
  const request = buildTriageRequest(item.text, devices.get(item.device)!);
  const key = recordingKey(PROMPT_VERSION, request);
  if (recordings[key]) continue;
  const { raw, model } = await provider.complete(request);
  recordings[key] = { model, promptVersion: PROMPT_VERSION, recordedAt: new Date().toISOString(), raw };
  const parsed = parseModelOutput(raw, item.text);
  console.log(`${item.device}  ${parsed.ok ? `${parsed.triage.seriousOutcome.padEnd(36)} ${parsed.triage.isComplaint ? 'complaint' : 'not complaint'}` : `REJECTED: ${parsed.error}`}  ${item.text.slice(0, 60)}`);
  made++;
  writeFileSync(RECORDINGS_PATH, JSON.stringify(recordings, null, 2) + '\n');
}
console.log(`Recorded ${made} new responses with ${config.geminiModel}, prompt ${PROMPT_VERSION}. ${Object.keys(recordings).length} in ${RECORDINGS_PATH}.`);
