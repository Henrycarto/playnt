import { MongoClient, ObjectId, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ModelTriage } from '@playnt/shared';
import { createApp } from '../src/app.js';
import { collections, setupCollections } from '../src/db.js';
import { loadDevices } from '../src/seed.js';
import type { TriageProvider, TriageRequest } from '../src/triage/provider.js';

// A provider whose answer the test decides. It records every request so tests can check what would be sent.
export class ScriptedProvider implements TriageProvider {
  readonly name = 'scripted';
  readonly model = 'scripted-model';
  requests: TriageRequest[] = [];
  next: (req: TriageRequest) => string | Promise<string> = () => {
    throw new Error('No scripted answer.');
  };
  async complete(req: TriageRequest) {
    this.requests.push(req);
    return { raw: await this.next(req), model: this.model };
  }
}

export const triage = (over: Partial<ModelTriage> & { evidenceQuote: string }): ModelTriage => ({
  isComplaint: true,
  possibleSeriousIncident: true,
  seriousOutcome: 'might_have_led',
  timeLimitDays: 15,
  problemDescription: 'Test problem',
  rationale: 'Test rationale.',
  ...over,
});

export interface TestEnv {
  server: MongoMemoryServer;
  client: MongoClient;
  db: Db;
  provider: ScriptedProvider;
  now: { value: Date };
  app: ReturnType<typeof createApp>;
  devices: Record<string, string>;
  stop: () => Promise<void>;
}

export async function startEnv(): Promise<TestEnv> {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  await client.connect();
  const db = client.db(`playnt_test_${new ObjectId().toHexString()}`);
  await setupCollections(db);
  const c = collections(db);
  const docs = loadDevices().map((d) => ({ _id: new ObjectId(), ...d }));
  await c.devices.insertMany(docs);
  const provider = new ScriptedProvider();
  const now = { value: new Date('2026-10-25T09:00:00.000Z') };
  const app = createApp({ c, provider, clock: () => now.value, mode: 'test' });
  return {
    server, client, db, provider, now, app,
    devices: Object.fromEntries(docs.map((d) => [d.ref, d._id.toHexString()])),
    stop: async () => { await client.close(); await server.stop(); },
  };
}

export const complaintBody = (deviceId: string, over: Record<string, unknown> = {}) => ({
  deviceId,
  text: 'The pump display froze and delivery stopped without any alarm. The patient was moved to intensive care.',
  reporterRole: 'Ward pharmacist',
  reporterCountry: 'Austria',
  channel: 'email',
  awarenessDate: '2026-10-23',
  ...over,
});
