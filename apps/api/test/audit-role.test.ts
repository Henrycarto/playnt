import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, MongoServerError, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { appendAudit } from '../src/audit.js';
import { collections, inTransaction, setupAppRole, setupCollections, type ComplaintDoc } from '../src/db.js';

// MongoDB itself enforces the append-only rule: the application user has find and insert on auditEvents, nothing else.
let server: MongoMemoryReplSet;
let admin: MongoClient;
let app: MongoClient;

beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ replSet: { count: 1, auth: { enable: true, customRootName: 'root', customRootPwd: 'root-test-password' } } });
  admin = new MongoClient(server.getUri(), { auth: { username: 'root', password: 'root-test-password' }, authSource: 'admin' });
  await admin.connect();
  await setupCollections(admin.db('playnt'));
  await setupAppRole(admin.db('admin'), 'playnt', { name: 'playnt_app', password: 'app-test-password' });
  app = new MongoClient(server.getUri(), { auth: { username: 'playnt_app', password: 'app-test-password' }, authSource: 'admin' });
  await app.connect();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await admin?.close();
  await server?.stop();
});

describe('least-privilege application user', () => {
  it("can append and read audit events, in a transaction that moves the complaint's audit head", async () => {
    const c = collections(app.db('playnt'));
    const complaint: ComplaintDoc = {
      _id: new ObjectId(), ref: 'PLT-2026-0001', deviceId: new ObjectId(), text: 'The display froze during an infusion.', reporter: { role: 'Nurse', country: 'Austria' },
      channel: 'phone', awarenessDate: '2026-10-23', receivedAt: new Date(), status: 'needs_manual_triage', triageHistory: [
        { kind: 'model_suggestion', at: new Date(), provider: 'test', model: 'test', promptVersion: 'triage-v1', raw: null, triage: null, error: 'none' },
      ], current: null, deadline: null, report: null, auditHead: null,
    };
    const e = await inTransaction(c, async (session) => {
      await c.complaints.insertOne(complaint, { session });
      return appendAudit(c, { complaintId: complaint._id, complaintRef: complaint.ref, type: 'complaint_logged', at: new Date(), actor: 'Complaint intake', summary: 'Logged.', payload: {} }, session);
    });
    expect(await c.audit.countDocuments({ _id: e._id })).toBe(1);
    expect((await c.complaints.findOne({ _id: complaint._id }))!.auditHead).toEqual({ seq: 1, hash: e.hash });
  });

  it.each([
    ['update', (c: ReturnType<typeof collections>) => c.audit.updateOne({}, { $set: { summary: 'Changed.' } })],
    ['replace', (c: ReturnType<typeof collections>) => c.audit.replaceOne({}, { summary: 'Changed.' } as never)],
    ['delete', (c: ReturnType<typeof collections>) => c.audit.deleteMany({})],
    ['drop', (c: ReturnType<typeof collections>) => c.audit.drop()],
  ])('is refused by MongoDB when it tries to %s audit events', async (_name, op) => {
    const err = await op(collections(app.db('playnt'))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MongoServerError);
    expect((err as MongoServerError).code).toBe(13); // Unauthorized
  });

  it('can still update complaints, which hold the working state', async () => {
    const c = collections(app.db('playnt'));
    const res = await c.counters.updateOne({ _id: 'complaint-2026' }, { $inc: { seq: 1 } }, { upsert: true });
    expect(res.acknowledged).toBe(true);
  });
});
