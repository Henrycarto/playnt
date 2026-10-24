// Runs the model over the frozen labelled set and reports agreement with the labels.
// Usage: npm run eval                (frozen evaluation set, refuses if its hash changed)
//        npm run eval -- --set dev   (development set, for prompt work)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseModelOutput, type ModelTriage } from '@playnt/shared';
import { loadConfig } from '../src/config.js';
import { GeminiProvider } from '../src/triage/gemini.js';
import { buildTriageRequest, PROMPT_VERSION } from '../src/triage/prompt.js';

const root = new URL('../../../', import.meta.url);
const file = (rel: string) => new URL(rel, root);
const sha = (rel: string) => createHash('sha256').update(readFileSync(file(rel))).digest('hex');

const set = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : 'eval';
const setPath = set === 'dev' ? 'eval/dev-complaints.json' : 'eval/labelled-complaints.json';

if (set !== 'dev') {
  const frozen = readFileSync(file('eval/FROZEN.md'), 'utf8');
  for (const rel of ['eval/labelled-complaints.json', 'eval/devices.json']) {
    if (!frozen.includes(sha(rel))) {
      console.error(`${rel} does not match the hash in eval/FROZEN.md. The evaluation set is frozen; refusing to run.`);
      process.exit(1);
    }
  }
}

interface Item {
  id: string;
  device: string;
  text: string;
  label: { isComplaint: boolean; possibleSeriousIncident: boolean; timeLimitDays: 2 | 10 | 15 | null; difficulty?: 'clear' | 'ambiguous' };
}

const config = loadConfig({ ...process.env, TRIAGE_PROVIDER: 'gemini' });
const provider = new GeminiProvider(config.geminiModel, config.geminiApiKey!);
const devices = new Map((JSON.parse(readFileSync(file('eval/devices.json'), 'utf8')).devices as { ref: string }[]).map((d) => [d.ref, d]));
const items = (JSON.parse(readFileSync(file(setPath), 'utf8')).items as Item[]);

const outputs: { id: string; difficulty: string; label: Item['label']; raw: string | null; triage: ModelTriage | null; error: string | null }[] = [];
for (const item of items) {
  const request = buildTriageRequest(item.text, devices.get(item.device) as never);
  let raw: string | null = null;
  let error: string | null = null;
  let triage: ModelTriage | null = null;
  try {
    raw = (await provider.complete(request)).raw;
    const p = parseModelOutput(raw, item.text);
    if (p.ok) triage = p.triage; else error = p.error;
  } catch (e) {
    error = (e as Error).message;
  }
  outputs.push({ id: item.id, difficulty: item.label.difficulty ?? 'dev', label: item.label, raw, triage, error });
  const got = triage ? `${triage.possibleSeriousIncident ? `SI ${triage.timeLimitDays}d` : triage.isComplaint ? 'complaint' : 'not complaint'}` : 'INVALID';
  const want = item.label.possibleSeriousIncident ? `SI ${item.label.timeLimitDays}d` : item.label.isComplaint ? 'complaint' : 'not complaint';
  console.log(`${item.id.padEnd(7)} want ${want.padEnd(14)} got ${got.padEnd(14)} ${got === want ? '' : '<'}`);
}

function metrics(rows: typeof outputs) {
  const flagged = (r: (typeof rows)[number]) => r.triage?.possibleSeriousIncident === true; // invalid output counts as not flagged
  const tp = rows.filter((r) => r.label.possibleSeriousIncident && flagged(r)).length;
  const fp = rows.filter((r) => !r.label.possibleSeriousIncident && flagged(r)).length;
  const fn = rows.filter((r) => r.label.possibleSeriousIncident && !flagged(r)).length;
  const labelledSerious = rows.filter((r) => r.label.possibleSeriousIncident);
  const bothSerious = labelledSerious.filter(flagged);
  const limitAgree = bothSerious.filter((r) => r.triage!.timeLimitDays === r.label.timeLimitDays).length;
  const tooLate = bothSerious.filter((r) => (r.triage!.timeLimitDays ?? 99) > (r.label.timeLimitDays ?? 99)).length;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    n: rows.length,
    invalidOutputs: rows.filter((r) => !r.triage).length,
    seriousIncidentFlag: { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision: tp + fp ? round(tp / (tp + fp)) : null, recall: tp + fn ? round(tp / (tp + fn)) : null },
    complaintAgreement: round(rows.filter((r) => r.triage && r.triage.isComplaint === r.label.isComplaint).length / rows.length),
    timeLimit: {
      agreementWhereBothFlagged: bothSerious.length ? round(limitAgree / bothSerious.length) : null,
      agreementOverLabelledSerious: labelledSerious.length ? round(limitAgree / labelledSerious.length) : null,
      bothFlagged: bothSerious.length,
      modelLimitLongerThanLabel: tooLate,
    },
  };
}

const date = new Date().toISOString().slice(0, 10);
const result = {
  set,
  model: config.geminiModel,
  promptVersion: PROMPT_VERSION,
  runDate: new Date().toISOString(),
  labelsSha256: sha(setPath),
  devicesSha256: sha('eval/devices.json'),
  note: 'Invalid model output counts as not flagged. Labels are one reviewer\'s reading of MDR Art. 87 and MDCG 2023-3, not ground truth.',
  metrics: { all: metrics(outputs), clear: set === 'dev' ? null : metrics(outputs.filter((o) => o.difficulty === 'clear')), ambiguous: set === 'dev' ? null : metrics(outputs.filter((o) => o.difficulty === 'ambiguous')) },
  items: outputs,
};
mkdirSync(file('eval/results/'), { recursive: true });
const out = `eval/results/${set}-${config.geminiModel}-${PROMPT_VERSION}-${date}.json`;
writeFileSync(file(out), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.metrics, null, 2));
console.log(`Wrote ${out}`);
