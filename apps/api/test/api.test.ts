import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoServerError, ObjectId } from 'mongodb';
import type { ComplaintDetail } from '@playnt/shared';
import { createApp } from '../src/app.js';
import { collections } from '../src/db.js';
import { complaintBody, startEnv, triage, type TestEnv } from './helpers.js';

const TEXT = complaintBody('x').text;
const QUOTE = 'The patient was moved to intensive care.';
let env: TestEnv;

beforeAll(async () => { env = await startEnv(); }, 180_000);
afterAll(async () => { await env?.stop(); });
beforeEach(async () => {
  const c = collections(env.db);
  await Promise.all([c.complaints.deleteMany({}), c.audit.deleteMany({}), c.counters.deleteMany({})]);
  env.provider.requests = [];
  env.provider.next = () => JSON.stringify(triage({ evidenceQuote: QUOTE, seriousOutcome: 'serious_deterioration_unanticipated', timeLimitDays: 10 }));
  env.now.value = new Date('2026-10-25T09:00:00.000Z');
});

const post = (body: object) => request(env.app).post('/api/complaints').send(body);
const decideOn = (id: string, body: object) => request(env.app).post(`/api/complaints/${id}/decisions`).send(body);

describe('intake validation (Zod at the API boundary)', () => {
  it('rejects a complaint with missing and invalid fields, listing each one', async () => {
    const res = await post({ deviceId: 'nope', text: 'short', channel: 'pigeon' });
    expect(res.status).toBe(422);
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['deviceId', 'text', 'channel', 'reporterRole', 'awarenessDate']));
  });
  it('rejects unknown fields instead of ignoring them', async () => {
    const res = await post({ ...complaintBody(env.devices['IV-220']!), status: 'confirmed' });
    expect(res.status).toBe(422);
  });
  it('rejects a device that does not exist', async () => {
    const res = await post(complaintBody(new ObjectId().toHexString()));
    expect(res.status).toBe(422);
    expect(res.body.issues[0].path).toBe('deviceId');
  });
  it('rejects an awareness date in the future (Vienna calendar day)', async () => {
    const res = await post(complaintBody(env.devices['IV-220']!, { awarenessDate: '2026-10-26' }));
    expect(res.status).toBe(422);
  });
  it('answers malformed JSON with 400', async () => {
    const res = await request(env.app).post('/api/complaints').set('content-type', 'application/json').send('{"text":');
    expect(res.status).toBe(400);
  });
  it('sends only the complaint text and device risk file to the model, never reporter details', async () => {
    await post(complaintBody(env.devices['IV-220']!, { reporterRole: 'Dr Unique Reporter Role' }));
    const sent = JSON.stringify(env.provider.requests);
    expect(sent).toContain('IV-220 volumetric infusion pump');
    expect(sent).not.toContain('Dr Unique Reporter Role');
    expect(sent).not.toContain('Austria');
  });
});

describe('model triage storage', () => {
  it('stores model name, prompt version, raw output and timestamp with the suggestion', async () => {
    const res = await post(complaintBody(env.devices['IV-220']!));
    expect(res.status).toBe(201);
    const d = res.body as ComplaintDetail;
    expect(d.status).toBe('suggested');
    expect(d.ref).toBe('PLT-2026-0001');
    const s = d.triageHistory[0]!;
    expect(s).toMatchObject({ kind: 'model_suggestion', provider: 'scripted', model: 'scripted-model', promptVersion: 'triage-v1', at: '2026-10-25T09:00:00.000Z', error: null });
    if (s.kind === 'model_suggestion') expect(JSON.parse(s.raw!)).toMatchObject({ timeLimitDays: 10 });
    expect(d.deadlineBasis).toBe('suggested');
    expect(d.audit.map((a) => a.type)).toEqual(['complaint_logged', 'model_suggestion_stored']);
  });

  it.each([
    ['prose', 'I think this is a serious incident with a 10 day limit.'],
    ['an inconsistent time limit', JSON.stringify(triage({ evidenceQuote: QUOTE, seriousOutcome: 'death', timeLimitDays: 15 }))],
    ['an invented quote', JSON.stringify(triage({ evidenceQuote: 'The patient died.' }))],
  ])('stores %s as needs manual triage with the raw output kept verbatim', async (_name, raw) => {
    env.provider.next = () => raw;
    const d = (await post(complaintBody(env.devices['IV-220']!))).body as ComplaintDetail;
    expect(d.status).toBe('needs_manual_triage');
    expect(d.deadline).toBeNull();
    expect(d.possibleSeriousIncident).toBeNull();
    const s = d.triageHistory[0]!;
    expect(s.kind === 'model_suggestion' && s.raw).toBe(raw);
    expect(s.kind === 'model_suggestion' && s.triage).toBeNull();
    expect(d.audit[1]!.type).toBe('model_output_rejected');
  });

  it('stores a provider failure as needs manual triage without raw output', async () => {
    env.provider.next = () => { throw new Error('Network down'); };
    const d = (await post(complaintBody(env.devices['IV-220']!))).body as ComplaintDetail;
    expect(d.status).toBe('needs_manual_triage');
    const s = d.triageHistory[0]!;
    expect(s).toMatchObject({ raw: null, triage: null, error: 'Network down' });
  });
});

describe('human decision', () => {
  it('confirms a suggestion and makes its deadline the decided one', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    const res = await decideOn(body.id, { action: 'confirm' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'confirmed', deadlineBasis: 'decided', limitDays: 10 });
    expect(res.body.audit.at(-1)).toMatchObject({ type: 'triage_confirmed', actor: 'Quality engineer (demo)' });
  });

  it('refuses to confirm twice or to confirm a rejected suggestion', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    await decideOn(body.id, { action: 'confirm' });
    expect((await decideOn(body.id, { action: 'confirm' })).status).toBe(409);
    env.provider.next = () => 'not json';
    const bad = (await post(complaintBody(env.devices['IV-220']!))).body;
    expect((await decideOn(bad.id, { action: 'confirm' })).status).toBe(409);
  });

  it('requires a reason for a correction', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    const corrected = { ...triage({ evidenceQuote: QUOTE }), evidenceQuote: null };
    expect((await decideOn(body.id, { action: 'correct', triage: corrected })).status).toBe(422);
    expect((await decideOn(body.id, { action: 'correct', triage: corrected, reason: '' })).status).toBe(422);
    const res = await decideOn(body.id, { action: 'correct', triage: corrected, reason: 'No deterioration occurred; might have led only.' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'corrected', limitDays: 15 });
    expect(res.body.audit.at(-1).summary).toContain('No deterioration occurred');
  });

  it('rejects an inconsistent correction and a correction quoting text that is not in the complaint', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    const reason = 'Testing the consistency rules here.';
    const inconsistent = { ...triage({ evidenceQuote: QUOTE }), timeLimitDays: 2 };
    expect((await decideOn(body.id, { action: 'correct', triage: inconsistent, reason })).status).toBe(422);
    const badQuote = triage({ evidenceQuote: 'Not in the text at all.' });
    expect((await decideOn(body.id, { action: 'correct', triage: badQuote, reason })).status).toBe(422);
  });

  it('lets a quality engineer triage by hand when the model output was rejected', async () => {
    env.provider.next = () => '';
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    const res = await decideOn(body.id, { action: 'correct', triage: { ...triage({ evidenceQuote: QUOTE }), evidenceQuote: null }, reason: 'Model output was empty; triaged by hand.' });
    expect(res.body.status).toBe('corrected');
    expect(res.body.triageHistory).toHaveLength(2);
  });
});

describe('deadline clock through the API', () => {
  it('sets the 2-day deadline across a weekend and the Austrian National Day to Wed 28 Oct 23:59:59 Vienna', async () => {
    env.provider.next = () => JSON.stringify(triage({ evidenceQuote: QUOTE, seriousOutcome: 'public_health_threat', timeLimitDays: 2 }));
    const d = (await post(complaintBody(env.devices['IV-220']!, { awarenessDate: '2026-10-23' }))).body as ComplaintDetail;
    expect(d.dueAt).toBe('2026-10-28T22:59:59.000Z');
    expect(d.deadline!.dueDate).toBe('2026-10-28');
    expect(d.deadline!.days.filter((x) => x.rest).map((x) => x.rest)).toEqual(['Saturday', 'Sunday', 'National Day']);
  });

  it('sorts the queue: untriaged first, then nearest deadline, then complaints without a limit', async () => {
    env.provider.next = () => JSON.stringify(triage({ evidenceQuote: QUOTE, seriousOutcome: 'none', possibleSeriousIncident: false, timeLimitDays: null }));
    await post(complaintBody(env.devices['PX-40']!, { awarenessDate: '2026-10-24' }));
    env.provider.next = () => JSON.stringify(triage({ evidenceQuote: QUOTE }));
    await post(complaintBody(env.devices['HB-7']!, { awarenessDate: '2026-10-20' })); // 15 days
    env.provider.next = () => JSON.stringify(triage({ evidenceQuote: QUOTE, seriousOutcome: 'death', timeLimitDays: 10 }));
    await post(complaintBody(env.devices['NB-3']!, { awarenessDate: '2026-10-20' })); // 10 days
    env.provider.next = () => 'garbage';
    await post(complaintBody(env.devices['WD-12']!, { awarenessDate: '2026-10-25' }));
    const list = (await request(env.app).get('/api/complaints')).body as { device: { ref: string } }[];
    expect(list.map((r) => r.device.ref)).toEqual(['WD-12', 'NB-3', 'HB-7', 'PX-40']);
    const serious = (await request(env.app).get('/api/complaints?serious=true')).body as unknown[];
    expect(serious).toHaveLength(2);
  });
});

describe('audit trail', () => {
  it('exposes no route that changes or deletes audit events', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    const eventId = body.audit[0].id;
    for (const method of ['put', 'patch', 'delete'] as const) {
      for (const path of ['/api/audit', `/api/audit/${eventId}`, `/api/complaints/${body.id}/audit`]) {
        expect((await request(env.app)[method](path).send({})).status).toBe(404);
      }
    }
    expect((await request(env.app).get('/api/audit/verify')).body.broken).toEqual([]);
  });

  it('detects an event edited directly in the database', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    await decideOn(body.id, { action: 'confirm' });
    await collections(env.db).audit.updateOne({ complaintId: new ObjectId(body.id), seq: 2 }, { $set: { summary: 'Model suggested nothing serious.' } });
    const check = (await request(env.app).get('/api/audit/verify')).body;
    expect(check.broken).toEqual([expect.objectContaining({ complaintRef: body.ref, seq: 2, problem: 'Content does not match its hash.' })]);
  });

  it('detects a deleted event as a broken link', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    await decideOn(body.id, { action: 'confirm' });
    await collections(env.db).audit.deleteOne({ complaintId: new ObjectId(body.id), seq: 2 });
    const problems = (await request(env.app).get('/api/audit/verify')).body.broken.map((b: { problem: string }) => b.problem);
    expect(problems).toEqual(expect.arrayContaining(['Expected sequence 2.', 'Link to the previous event does not match.']));
  });
});

describe('transactions and the audit head', () => {
  // An app whose second audit insert fails, as a lost connection or a full disk would make it.
  function appFailingOnAuditInsert(n: number) {
    const c = collections(env.db);
    const insert = c.audit.insertOne.bind(c.audit);
    let calls = 0;
    vi.spyOn(c.audit, 'insertOne').mockImplementation(((...args: Parameters<typeof insert>) => {
      if (++calls === n) throw new Error('Simulated failure while storing an audit event.');
      return insert(...args);
    }) as typeof insert);
    return createApp({ c, provider: env.provider, clock: () => env.now.value, mode: 'test' });
  }

  it('writes nothing at intake when an audit event cannot be stored: no complaint, no event, no used reference', async () => {
    const res = await request(appFailingOnAuditInsert(2)).post('/api/complaints').send(complaintBody(env.devices['IV-220']!));
    expect(res.status).toBe(500);
    const c = collections(env.db);
    expect(await c.complaints.countDocuments()).toBe(0);
    expect(await c.audit.countDocuments()).toBe(0);
    expect((await post(complaintBody(env.devices['IV-220']!))).body.ref).toBe('PLT-2026-0001');
  });

  it('rolls back a decision when its audit event cannot be stored', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    const res = await request(appFailingOnAuditInsert(1)).post(`/api/complaints/${body.id}/decisions`).send({ action: 'confirm' });
    expect(res.status).toBe(500);
    const after = (await request(env.app).get(`/api/complaints/${body.id}`)).body as ComplaintDetail;
    expect(after.status).toBe('suggested');
    expect(after.triageHistory).toHaveLength(1);
    expect(after.audit).toHaveLength(2);
    expect((await request(env.app).get('/api/audit/verify')).body.broken).toEqual([]);
  });

  it("keeps the complaint's audit head on its last event", async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    await decideOn(body.id, { action: 'confirm' });
    const doc = await collections(env.db).complaints.findOne({ _id: new ObjectId(body.id) });
    const last = await collections(env.db).audit.findOne({ complaintId: new ObjectId(body.id) }, { sort: { seq: -1 } });
    expect(doc!.auditHead).toEqual({ seq: 3, hash: last!.hash });
  });

  it('detects a deleted last event, which still leaves a chain that links', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    await decideOn(body.id, { action: 'confirm' });
    await collections(env.db).audit.deleteOne({ complaintId: new ObjectId(body.id), seq: 3 });
    const check = (await request(env.app).get('/api/audit/verify')).body;
    expect(check.broken).toEqual([{ complaintRef: body.ref, seq: 3, problem: 'The chain ends at event 2, but the complaint records event 3 as the last.' }]);
  });

  it('detects a complaint whose whole chain was deleted', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    await collections(env.db).audit.deleteMany({ complaintId: new ObjectId(body.id) });
    const check = (await request(env.app).get('/api/audit/verify')).body;
    expect(check.broken).toEqual([{ complaintRef: body.ref, seq: 2, problem: 'The complaint records 2 events, but none are stored.' }]);
  });
});

describe('MongoDB JSON Schema validation', () => {
  it('refuses a complaint document with an unknown status, even when written around the API', async () => {
    const err = await collections(env.db).complaints.insertOne({
      _id: new ObjectId(), ref: 'PLT-2026-9999', deviceId: new ObjectId(), text: TEXT, reporter: { role: 'x', country: 'y' }, channel: 'email',
      awarenessDate: '2026-10-23', receivedAt: new Date(), status: 'closed' as never, triageHistory: [], current: null, deadline: null, auditHead: null,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(MongoServerError);
    expect((err as MongoServerError).code).toBe(121);
  });
  it('refuses an audit event with extra fields', async () => {
    const err = await collections(env.db).audit.insertOne({ complaintId: new ObjectId(), complaintRef: 'PLT-2026-0001', seq: 1, type: 'complaint_logged', at: new Date(), actor: 'x', summary: 'x', payload: {}, prevHash: null, hash: 'a'.repeat(64), note: 'extra' } as never).catch((e) => e);
    expect((err as MongoServerError).code).toBe(121);
  });
});

describe('trends aggregation', () => {
  it('counts decided complaints per month, device and problem, and leaves undecided ones out', async () => {
    const mk = async (device: string, date: string, problem: string, serious: boolean, decideIt = true) => {
      env.provider.next = () => JSON.stringify(serious
        ? triage({ evidenceQuote: QUOTE, problemDescription: problem })
        : triage({ evidenceQuote: QUOTE, problemDescription: problem, possibleSeriousIncident: false, seriousOutcome: 'none', timeLimitDays: null }));
      const { body } = await post(complaintBody(env.devices[device]!, { awarenessDate: date }));
      if (decideIt) await decideOn(body.id, { action: 'confirm' });
    };
    await mk('IV-220', '2026-08-03', 'False occlusion alarm', false);
    await mk('IV-220', '2026-08-20', 'false occlusion alarm ', false);
    await mk('IV-220', '2026-08-21', 'Sticking key', true);
    await mk('IV-220', '2026-09-02', 'False occlusion alarm', false);
    await mk('PX-40', '2026-09-30', 'Scratched display', false);
    await mk('PX-40', '2026-09-30', 'Scratched display', false, false);
    const res = await request(env.app).get('/api/trends?from=2026-08-01&to=2026-09-30');
    expect(res.status).toBe(200);
    expect(res.body.awaitingDecision).toBe(1);
    expect(res.body.rows).toEqual([
      { month: '2026-09', deviceRef: 'IV-220', deviceName: 'IV-220 volumetric infusion pump', problem: 'False occlusion alarm', count: 1, possibleSerious: 0 },
      { month: '2026-09', deviceRef: 'PX-40', deviceName: 'PX-40 fingertip pulse oximeter', problem: 'Scratched display', count: 1, possibleSerious: 0 },
      { month: '2026-08', deviceRef: 'IV-220', deviceName: 'IV-220 volumetric infusion pump', problem: 'False occlusion alarm', count: 2, possibleSerious: 0 },
      { month: '2026-08', deviceRef: 'IV-220', deviceName: 'IV-220 volumetric infusion pump', problem: 'Sticking key', count: 1, possibleSerious: 1 },
    ]);
    expect(res.body.perMonth).toEqual([
      { month: '2026-08', deviceRef: 'IV-220', count: 3, possibleSerious: 1 },
      { month: '2026-09', deviceRef: 'IV-220', count: 1, possibleSerious: 0 },
      { month: '2026-09', deviceRef: 'PX-40', count: 1, possibleSerious: 0 },
    ]);
  });
});

describe('retry after a model failure', () => {
  it('keeps the complaint, then stores the new suggestion and audits the retry', async () => {
    env.provider.next = () => { throw new Error('Gemini unavailable after retries (HTTP 503).'); };
    const { body } = await post(complaintBody(env.devices['IV-220']!));
    expect(body.status).toBe('needs_manual_triage');
    env.provider.next = () => JSON.stringify(triage({ evidenceQuote: QUOTE }));
    const res = await request(env.app).post(`/api/complaints/${body.id}/retry`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('suggested');
    expect(res.body.triageHistory).toHaveLength(2);
    expect(res.body.audit.map((a: { type: string }) => a.type)).toEqual(['complaint_logged', 'model_output_rejected', 'model_suggestion_stored']);
    expect((await request(env.app).post(`/api/complaints/${body.id}/retry`)).status).toBe(409);
  });

  it('filters the queue by waiting and decided', async () => {
    const a = (await post(complaintBody(env.devices['IV-220']!))).body;
    await post(complaintBody(env.devices['PX-40']!));
    await decideOn(a.id, { action: 'confirm' });
    expect((await request(env.app).get('/api/complaints?status=waiting')).body).toHaveLength(1);
    expect((await request(env.app).get('/api/complaints?status=decided')).body).toHaveLength(1);
  });

  it('keeps an unreported possible serious incident under needs action until the report is recorded', async () => {
    const a = (await post(complaintBody(env.devices['IV-220']!, { awarenessDate: '2026-10-20' }))).body;
    await decideOn(a.id, { action: 'confirm' });
    const action = async () => (await request(env.app).get('/api/complaints?status=action')).body.map((c: { id: string }) => c.id);
    expect(await action()).toContain(a.id);
    await request(env.app).post(`/api/complaints/${a.id}/report`).send({ submittedOn: '2026-10-22' });
    expect(await action()).not.toContain(a.id);
  });
});

describe('recording the serious incident report', () => {
  it('stops the clock, says whether it was on time, and refuses a second record', async () => {
    const { body } = await post(complaintBody(env.devices['IV-220']!, { awarenessDate: '2026-10-20' }));
    expect((await request(env.app).post(`/api/complaints/${body.id}/report`).send({ submittedOn: '2026-10-22' })).status).toBe(409); // not decided yet
    await decideOn(body.id, { action: 'confirm' });
    expect((await request(env.app).post(`/api/complaints/${body.id}/report`).send({ submittedOn: '2026-10-19' })).status).toBe(422);
    expect((await request(env.app).post(`/api/complaints/${body.id}/report`).send({ submittedOn: '2026-10-26' })).status).toBe(422);
    const res = await request(env.app).post(`/api/complaints/${body.id}/report`).send({ submittedOn: '2026-10-22' });
    expect(res.status).toBe(200);
    expect(res.body.reportedOn).toBe('2026-10-22');
    expect(res.body.audit.at(-1)).toMatchObject({ type: 'report_recorded' });
    expect(res.body.audit.at(-1).summary).toContain('within the deadline of 2026-10-30');
    expect((await request(env.app).post(`/api/complaints/${body.id}/report`).send({ submittedOn: '2026-10-23' })).status).toBe(409);
  });
});
