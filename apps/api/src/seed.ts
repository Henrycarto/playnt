import { readFileSync } from 'node:fs';
import { ObjectId, type Db } from 'mongodb';
import { HumanTriageSchema, type HumanTriage, type SeriousOutcome } from '@playnt/shared';
import { collections, setupCollections, type DeviceDoc } from './db.js';
import { decide, logComplaint, recordReport, type Deps } from './service.js';

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const root = import.meta.url.includes('/dist/') ? '../../../../' : '../../../';

export interface SeedItem {
  device: string;
  awarenessDate: string;
  receivedAt?: string;
  reporterRole: string;
  channel: 'phone' | 'email' | 'web form' | 'letter' | 'field service';
  text: string;
  record?: boolean;
  expected?: 'complaint' | 'might_have_led' | 'not_complaint';
  basis?: string;
  decision?: { action: 'confirm'; at: string } | { action: 'correct'; at: string; triage: HumanTriage; reason: string } | null;
  // Date the seeded engineer submitted the serious incident report, if any.
  reportedOn?: string;
}

export interface SeedFile { history: SeedItem[]; queue: SeedItem[]; samples: Omit<SeedItem, 'awarenessDate'>[] }

export const loadSeed = (): SeedFile => read(`${root}apps/api/data/seed.json`);
export const loadDevices = (): Omit<DeviceDoc, '_id'>[] => read(`${root}eval/devices.json`).devices;

const EXPECTED: Record<NonNullable<SeedItem['expected']>, { isComplaint: boolean; outcome: SeriousOutcome }> = {
  complaint: { isComplaint: true, outcome: 'none' },
  might_have_led: { isComplaint: true, outcome: 'might_have_led' },
  not_complaint: { isComplaint: false, outcome: 'none' },
};

export async function seedDatabase(db: Db, deps: Omit<Deps, 'c'>) {
  await db.dropDatabase();
  await setupCollections(db);
  const c = collections(db);
  const devices = loadDevices().map((d) => ({ _id: new ObjectId(), ...d }));
  await c.devices.insertMany(devices);
  const byRef = new Map(devices.map((d) => [d.ref, d]));
  const full: Deps = { ...deps, c };
  const seed = loadSeed();
  const log: string[] = [];

  for (const item of [...seed.history, ...seed.queue]) {
    const device = byRef.get(item.device)!;
    const receivedAt = new Date(item.receivedAt ?? `${item.awarenessDate}T09:00:00Z`);
    const doc = await logComplaint(full, {
      deviceId: device._id.toHexString(), text: item.text, reporterRole: item.reporterRole, reporterCountry: 'Austria',
      channel: item.channel, awarenessDate: item.awarenessDate,
    }, receivedAt);
    const suggestion = doc.triageHistory[0]!;
    const got = suggestion.kind === 'model_suggestion' ? suggestion.triage : null;

    if (item.decision) {
      const at = new Date(item.decision.at);
      if (item.decision.action === 'confirm' && !got) {
        log.push(`${doc.ref}: wanted to confirm, but there is no valid suggestion; left for manual triage.`);
        continue;
      }
      const decided = await decide(full, doc._id.toHexString(), item.decision, at);
      log.push(`${doc.ref}: ${item.decision.action}`);
      if (item.reportedOn && decided.current?.possibleSeriousIncident) {
        await recordReport(full, doc._id.toHexString(), { submittedOn: item.reportedOn }, new Date(`${item.reportedOn}T15:00:00Z`));
      }
    } else if (item.expected) {
      // History: confirm when the suggestion agrees with the seeded engineer, otherwise correct with the seeded reason.
      const want = EXPECTED[item.expected];
      const at = new Date(receivedAt.getTime() + 2 * 3_600_000);
      const agrees = got && got.isComplaint === want.isComplaint && got.seriousOutcome === want.outcome;
      let decided;
      if (agrees) {
        decided = await decide(full, doc._id.toHexString(), { action: 'confirm' }, at);
        log.push(`${doc.ref}: confirm`);
      } else {
        const triage = HumanTriageSchema.parse({
          isComplaint: want.isComplaint,
          possibleSeriousIncident: want.outcome !== 'none',
          seriousOutcome: want.outcome,
          timeLimitDays: want.outcome === 'might_have_led' ? 15 : null,
          problemDescription: got?.problemDescription ?? item.text.split('.')[0]!.slice(0, 200),
          evidenceQuote: null,
          rationale: item.basis!,
        });
        decided = await decide(full, doc._id.toHexString(), { action: 'correct', triage, reason: item.basis! }, at);
        log.push(`${doc.ref}: correct (model said ${got ? `${got.seriousOutcome}, complaint ${got.isComplaint}` : 'nothing valid'})`);
      }
      // History: every possible serious incident was reported within its limit, three days after awareness.
      if (decided.current?.possibleSeriousIncident) {
        const on = new Date(Date.parse(`${item.awarenessDate}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
        await recordReport(full, doc._id.toHexString(), { submittedOn: on }, new Date(`${on}T15:00:00Z`));
      }
    } else {
      log.push(`${doc.ref}: ${doc.status}`);
    }
  }
  return log;
}
