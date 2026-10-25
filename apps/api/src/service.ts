import { type ClientSession, ObjectId, type Document } from 'mongodb';
import {
  computeDeadline, DeadlineRangeError, parseModelOutput, triageConsistency, viennaDate,
  type AuditEventView, type ComplaintDetail, type ComplaintInput, type ComplaintStatus, type ComplaintSummary,
  type DecisionInput, type DeviceView, type ReportInput, type HumanTriage, type LimitDays, type ModelTriage, type TrendRow,
} from '@playnt/shared';
import { appendAudit } from './audit.js';
import type { Clock } from './config.js';
import { inTransaction, type AuditDoc, type Collections, type ComplaintDoc, type DeviceDoc, type HumanDecisionDoc, type ModelSuggestionDoc } from './db.js';
import { buildTriageRequest, PROMPT_VERSION } from './triage/prompt.js';
import type { TriageProvider } from './triage/provider.js';

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: { path: string; message: string }[]) {
    super(message);
  }
}

export interface Deps {
  c: Collections;
  provider: TriageProvider;
  clock: Clock;
}

// The simulation has one signed-in role and no accounts. Decisions record the role, not a person.
export const ACTOR = 'Quality engineer (demo)';
const INTAKE_ACTOR = 'Complaint intake';

const toView = (d: DeviceDoc): DeviceView => ({
  id: d._id.toHexString(), ref: d.ref, name: d.name, riskClass: d.riskClass,
  intendedUse: d.intendedUse, anticipatedHarms: d.anticipatedHarms, expectedSideEffects: d.expectedSideEffects,
});

function deadlineFor(awarenessDate: string, limitDays: LimitDays | null): ComplaintDoc['deadline'] {
  if (!limitDays) return null;
  try {
    const d = computeDeadline(awarenessDate, limitDays);
    return { limitDays, dueDate: d.dueDate, dueAt: new Date(d.dueAt) };
  } catch (e) {
    if (e instanceof DeadlineRangeError) return null;
    throw e;
  }
}

// Status, current triage and deadline always follow from the latest history entry.
function derive(awarenessDate: string, history: ComplaintDoc['triageHistory']): Pick<ComplaintDoc, 'status' | 'current' | 'deadline'> {
  const lastDecision = [...history].reverse().find((h): h is HumanDecisionDoc => h.kind === 'human_decision');
  const lastSuggestion = [...history].reverse().find((h): h is ModelSuggestionDoc => h.kind === 'model_suggestion');
  const triage: HumanTriage | ModelTriage | null = lastDecision?.triage ?? lastSuggestion?.triage ?? null;
  const status: ComplaintStatus = lastDecision
    ? (lastDecision.action === 'confirm' ? 'confirmed' : 'corrected')
    : lastSuggestion?.triage ? 'suggested' : 'needs_manual_triage';
  if (!triage) return { status, current: null, deadline: null };
  return {
    status,
    current: {
      isComplaint: triage.isComplaint,
      possibleSeriousIncident: triage.possibleSeriousIncident,
      problem: triage.problemDescription,
      limitDays: triage.timeLimitDays,
      basis: lastDecision ? 'decided' : 'suggested',
    },
    deadline: deadlineFor(awarenessDate, triage.timeLimitDays),
  };
}

async function nextRef(c: Collections, year: number, session: ClientSession): Promise<string> {
  const counter = await c.counters.findOneAndUpdate({ _id: `complaint-${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', session });
  return `PLT-${year}-${String(counter!.seq).padStart(4, '0')}`;
}

export async function suggest(deps: Deps, text: string, device: DeviceDoc, at: Date): Promise<ModelSuggestionDoc> {
  const request = buildTriageRequest(text, device);
  try {
    const { raw, model } = await deps.provider.complete(request);
    const parsed = parseModelOutput(raw, text);
    return {
      kind: 'model_suggestion', at, provider: deps.provider.name, model, promptVersion: PROMPT_VERSION, raw,
      triage: parsed.ok ? parsed.triage : null, error: parsed.ok ? null : parsed.error,
    };
  } catch (e) {
    return {
      kind: 'model_suggestion', at, provider: deps.provider.name, model: deps.provider.model, promptVersion: PROMPT_VERSION,
      raw: null, triage: null, error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function logComplaint(deps: Deps, input: ComplaintInput, at: Date = deps.clock()): Promise<ComplaintDoc> {
  const device = await deps.c.devices.findOne({ _id: new ObjectId(input.deviceId) });
  if (!device) throw new HttpError(422, 'Unknown device.', [{ path: 'deviceId', message: 'Choose a device from the list.' }]);
  if (input.awarenessDate > viennaDate(at)) {
    throw new HttpError(422, 'The awareness date cannot be in the future.', [{ path: 'awarenessDate', message: 'The awareness date cannot be in the future.' }]);
  }
  // The model is asked before the transaction: a slow call must not hold it open, and a retried transaction must not ask twice.
  const suggestion = await suggest(deps, input.text, device, at);
  const history = [suggestion];
  // The complaint, its reference number and its first two audit events commit together or not at all.
  const id = await inTransaction(deps.c, async (session) => {
    const doc: ComplaintDoc = {
      _id: new ObjectId(),
      ref: await nextRef(deps.c, Number(input.awarenessDate.slice(0, 4)), session),
      deviceId: device._id,
      text: input.text,
      reporter: { role: input.reporterRole, country: input.reporterCountry },
      channel: input.channel,
      awarenessDate: input.awarenessDate,
      receivedAt: at,
      triageHistory: history,
      ...derive(input.awarenessDate, history),
      report: null,
      auditHead: null,
    };
    await deps.c.complaints.insertOne(doc, { session });
    await appendAudit(deps.c, {
      complaintId: doc._id, complaintRef: doc.ref, type: 'complaint_logged', at, actor: INTAKE_ACTOR,
      summary: `Complaint logged for ${device.ref}, awareness date ${input.awarenessDate}.`,
      payload: { text: input.text, deviceId: device._id.toHexString(), channel: input.channel, reporterRole: input.reporterRole, awarenessDate: input.awarenessDate },
    }, session);
    await appendAudit(deps.c, {
      complaintId: doc._id, complaintRef: doc.ref, at, actor: `${suggestion.provider}: ${suggestion.model}`,
      type: suggestion.triage ? 'model_suggestion_stored' : 'model_output_rejected',
      summary: suggestion.triage
        ? `Model suggested: ${suggestion.triage.possibleSeriousIncident ? `possible serious incident, ${suggestion.triage.timeLimitDays}-day limit` : suggestion.triage.isComplaint ? 'complaint, not a possible serious incident' : 'not a complaint'}.`
        : suggestion.raw === null ? `No model output, needs manual triage: ${suggestion.error}` : `Model output rejected, needs manual triage: ${suggestion.error}`,
      payload: { promptVersion: suggestion.promptVersion, model: suggestion.model, raw: suggestion.raw, triage: suggestion.triage, error: suggestion.error },
    }, session);
    return doc._id;
  });
  return (await deps.c.complaints.findOne({ _id: id }))!;
}

export async function decide(deps: Deps, id: string, input: DecisionInput, at: Date = deps.clock()): Promise<ComplaintDoc> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'Complaint not found.');
  const doc = await deps.c.complaints.findOne({ _id: new ObjectId(id) });
  if (!doc) throw new HttpError(404, 'Complaint not found.');

  let triage: HumanTriage;
  let reason: string | null = null;
  if (input.action === 'confirm') {
    const last = doc.triageHistory.at(-1);
    if (doc.status !== 'suggested' || last?.kind !== 'model_suggestion' || !last.triage) {
      throw new HttpError(409, 'Only a model suggestion that is waiting for a decision can be confirmed.');
    }
    triage = last.triage;
  } else {
    const issues = triageConsistency(input.triage);
    if (issues.length) throw new HttpError(422, 'The triage is inconsistent.', issues.map((i) => ({ path: `triage.${i.path}`, message: i.message })));
    if (input.triage.evidenceQuote && !doc.text.includes(input.triage.evidenceQuote)) {
      throw new HttpError(422, 'The evidence quote must be an exact passage of the complaint.', [{ path: 'triage.evidenceQuote', message: 'Copy the passage exactly from the complaint.' }]);
    }
    triage = input.triage;
    reason = input.reason;
  }

  const entry: HumanDecisionDoc = { kind: 'human_decision', at, action: input.action, by: ACTOR, triage, reason };
  const history = [...doc.triageHistory, entry];
  // The size condition makes the write fail if someone else decided in the meantime.
  const limit = triage.possibleSeriousIncident ? `possible serious incident, ${triage.timeLimitDays}-day limit` : triage.isComplaint ? 'complaint, not a possible serious incident' : 'not a complaint';
  await inTransaction(deps.c, async (session) => {
    const res = await deps.c.complaints.updateOne(
      { _id: doc._id, triageHistory: { $size: doc.triageHistory.length } },
      { $push: { triageHistory: entry }, $set: derive(doc.awarenessDate, history) },
      { session },
    );
    if (res.modifiedCount !== 1) throw new HttpError(409, 'This complaint changed while you were deciding. Reload and try again.');
    await appendAudit(deps.c, {
      complaintId: doc._id, complaintRef: doc.ref, at, actor: ACTOR,
      type: input.action === 'confirm' ? 'triage_confirmed' : 'triage_corrected',
      summary: input.action === 'confirm' ? `Confirmed the model suggestion: ${limit}.` : `Corrected the triage to ${limit}. Reason: ${reason}`,
      payload: { triage, reason },
    }, session);
  });
  return (await deps.c.complaints.findOne({ _id: doc._id }))!;
}

// Ask the model again after a failure. Only for complaints that have no usable suggestion and no decision yet.
export async function retryTriage(deps: Deps, id: string, at: Date = deps.clock()): Promise<ComplaintDoc> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'Complaint not found.');
  const doc = await deps.c.complaints.findOne({ _id: new ObjectId(id) });
  if (!doc) throw new HttpError(404, 'Complaint not found.');
  if (doc.status !== 'needs_manual_triage') throw new HttpError(409, 'Only a complaint that needs manual triage can be sent to the model again.');
  const device = await deps.c.devices.findOne({ _id: doc.deviceId });
  const suggestion = await suggest(deps, doc.text, device!, at);
  const history = [...doc.triageHistory, suggestion];
  await inTransaction(deps.c, async (session) => {
    const res = await deps.c.complaints.updateOne(
      { _id: doc._id, triageHistory: { $size: doc.triageHistory.length } },
      { $push: { triageHistory: suggestion }, $set: derive(doc.awarenessDate, history) },
      { session },
    );
    if (res.modifiedCount !== 1) throw new HttpError(409, 'This complaint changed in the meantime. Reload and try again.');
    await appendAudit(deps.c, {
      complaintId: doc._id, complaintRef: doc.ref, at, actor: `${suggestion.provider}: ${suggestion.model}`,
      type: suggestion.triage ? 'model_suggestion_stored' : 'model_output_rejected',
      summary: suggestion.triage ? 'Retry: model suggestion stored.' : `Retry failed, still needs manual triage: ${suggestion.error}`,
      payload: { promptVersion: suggestion.promptVersion, model: suggestion.model, raw: suggestion.raw, triage: suggestion.triage, error: suggestion.error, retry: true },
    }, session);
  });
  return (await deps.c.complaints.findOne({ _id: doc._id }))!;
}

// Records that the serious incident report went to the competent authority. Playnt does not submit reports itself.
export async function recordReport(deps: Deps, id: string, input: ReportInput, at: Date = deps.clock()): Promise<ComplaintDoc> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'Complaint not found.');
  const doc = await deps.c.complaints.findOne({ _id: new ObjectId(id) });
  if (!doc) throw new HttpError(404, 'Complaint not found.');
  if (doc.current?.basis !== 'decided' || !doc.current.possibleSeriousIncident) {
    throw new HttpError(409, 'A report can only be recorded for a confirmed or corrected possible serious incident.');
  }
  if (doc.report) throw new HttpError(409, `A report submitted on ${doc.report.submittedOn} is already recorded.`);
  const issue = (m: string) => new HttpError(422, m, [{ path: 'submittedOn', message: m }]);
  if (input.submittedOn < doc.awarenessDate) throw issue('The report cannot be submitted before the awareness date.');
  if (input.submittedOn > viennaDate(at)) throw issue('The submission date cannot be in the future.');
  const report = { submittedOn: input.submittedOn, recordedAt: at, by: ACTOR };
  const late = doc.deadline && input.submittedOn > doc.deadline.dueDate;
  await inTransaction(deps.c, async (session) => {
    const res = await deps.c.complaints.updateOne({ _id: doc._id, report: null }, { $set: { report } }, { session });
    if (res.modifiedCount !== 1) throw new HttpError(409, 'This complaint changed in the meantime. Reload and try again.');
    await appendAudit(deps.c, {
      complaintId: doc._id, complaintRef: doc.ref, at, actor: ACTOR, type: 'report_recorded',
      summary: `Serious incident report submitted on ${input.submittedOn}${doc.deadline ? (late ? `, after the deadline of ${doc.deadline.dueDate}` : `, within the deadline of ${doc.deadline.dueDate}`) : ''}.`,
      payload: { submittedOn: input.submittedOn, dueDate: doc.deadline?.dueDate ?? null },
    }, session);
  });
  return (await deps.c.complaints.findOne({ _id: doc._id }))!;
}

const summaryProjection = {
  ref: 1, report: 1, text: 1, awarenessDate: 1, receivedAt: 1, status: 1, current: 1, deadline: 1,
  device: { _id: '$device._id', ref: '$device.ref', name: '$device.name' },
};

type SummaryRow = Pick<ComplaintDoc, '_id' | 'ref' | 'text' | 'awarenessDate' | 'receivedAt' | 'status' | 'current' | 'deadline' | 'report'> & { device: { _id: ObjectId; ref: string; name: string } };

const toSummary = (r: SummaryRow): ComplaintSummary => ({
  id: r._id.toHexString(), ref: r.ref, text: r.text, awarenessDate: r.awarenessDate, receivedAt: r.receivedAt.toISOString(), status: r.status,
  device: { id: r.device._id.toHexString(), ref: r.device.ref, name: r.device.name },
  isComplaint: r.current?.isComplaint ?? null,
  possibleSeriousIncident: r.current?.possibleSeriousIncident ?? null,
  limitDays: r.current?.limitDays ?? null,
  deadlineBasis: r.current ? r.current.basis : null,
  dueAt: r.deadline ? r.deadline.dueAt.toISOString() : null,
  reportedOn: r.report?.submittedOn ?? null,
});

export async function listComplaints(deps: Deps, q: { status: string; deviceId?: string | undefined; serious?: 'true' | 'false' | undefined }): Promise<ComplaintSummary[]> {
  const match: Document = {};
  // Needs action: a triage decision is missing, or a possible serious incident has not been reported yet.
  if (q.status === 'action') match.$or = [{ status: { $in: ['suggested', 'needs_manual_triage'] } }, { 'current.possibleSeriousIncident': true, report: { $in: [null] } }];
  else if (q.status === 'waiting') match.status = { $in: ['suggested', 'needs_manual_triage'] };
  else if (q.status === 'decided') match.status = { $in: ['confirmed', 'corrected'] };
  else if (q.status !== 'all') match.status = q.status;
  if (q.deviceId) match.deviceId = new ObjectId(q.deviceId);
  if (q.serious) match['current.possibleSeriousIncident'] = q.serious === 'true';
  const rows = await deps.c.complaints.aggregate<SummaryRow>([
    { $match: match },
    // Untriaged first (risk unknown), then open deadlines, nearest first, then reported or no limit, newest first.
    { $addFields: { _rank: { $switch: { branches: [
      { case: { $eq: ['$status', 'needs_manual_triage'] }, then: 0 },
      { case: { $and: [{ $ne: ['$deadline', null] }, { $not: [{ $ifNull: ['$report', false] }] }] }, then: 1 },
    ], default: 2 } } } },
    { $sort: { _rank: 1, 'deadline.dueAt': 1, awarenessDate: -1, ref: -1 } },
    { $lookup: { from: 'devices', localField: 'deviceId', foreignField: '_id', as: 'device' } },
    { $unwind: '$device' },
    { $project: summaryProjection },
  ]).toArray();
  return rows.map(toSummary);
}

const auditView = (e: AuditDoc): AuditEventView => ({
  id: e._id.toHexString(), complaintId: e.complaintId.toHexString(), complaintRef: e.complaintRef, seq: e.seq, type: e.type,
  at: e.at.toISOString(), actor: e.actor, summary: e.summary, hash: e.hash, prevHash: e.prevHash,
});

export async function getComplaint(deps: Deps, id: string): Promise<ComplaintDetail> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'Complaint not found.');
  const doc = await deps.c.complaints.findOne({ _id: new ObjectId(id) });
  if (!doc) throw new HttpError(404, 'Complaint not found.');
  const device = await deps.c.devices.findOne({ _id: doc.deviceId });
  const audit = await deps.c.audit.find({ complaintId: doc._id }).sort({ seq: 1 }).toArray();
  let deadline: ComplaintDetail['deadline'] = null;
  if (doc.current?.limitDays) {
    try { deadline = computeDeadline(doc.awarenessDate, doc.current.limitDays); } catch (e) { if (!(e instanceof DeadlineRangeError)) throw e; }
  }
  return {
    ...toSummary({ ...doc, device: { _id: device!._id, ref: device!.ref, name: device!.name } }),
    reporter: doc.reporter,
    channel: doc.channel,
    deviceDetail: toView(device!),
    triageHistory: doc.triageHistory.map((h) => ({ ...h, at: h.at.toISOString() })),
    deadline,
    audit: audit.map(auditView),
  };
}

export async function listAudit(deps: Deps, limit = 200): Promise<AuditEventView[]> {
  return (await deps.c.audit.find().sort({ at: -1, seq: -1 }).limit(limit).toArray()).map(auditView);
}

export async function listDevices(deps: Deps): Promise<DeviceView[]> {
  return (await deps.c.devices.find().sort({ ref: 1 }).toArray()).map(toView);
}

// Trends: one aggregation pipeline over decided triage. Counts only; an Art. 88 trend report needs a manufacturer-defined method.
export async function trends(deps: Deps, from: string, to: string): Promise<{ rows: TrendRow[]; perMonth: { month: string; deviceRef: string; count: number; possibleSerious: number }[]; awaitingDecision: number }> {
  const [result] = await deps.c.complaints.aggregate<{ rows: TrendRow[]; perMonth: { month: string; deviceRef: string; count: number; possibleSerious: number }[]; awaiting: { n: number }[] }>([
    { $match: { awarenessDate: { $gte: from, $lte: to } } },
    {
      $addFields: {
        month: { $dateToString: { format: '%Y-%m', date: { $dateTrunc: { date: { $dateFromString: { dateString: '$awarenessDate', timezone: 'Europe/Vienna' } }, unit: 'month', timezone: 'Europe/Vienna' } }, timezone: 'Europe/Vienna' } },
      },
    },
    {
      $facet: {
        rows: [
          { $match: { 'current.basis': 'decided', 'current.isComplaint': true } },
          {
            $group: {
              _id: { month: '$month', deviceId: '$deviceId', problem: { $toLower: { $trim: { input: '$current.problem' } } } },
              // Grouped case-insensitively; shown with the wording of the first complaint in the group.
              label: { $first: { $trim: { input: '$current.problem' } } },
              count: { $sum: 1 },
              possibleSerious: { $sum: { $cond: ['$current.possibleSeriousIncident', 1, 0] } },
            },
          },
          { $lookup: { from: 'devices', localField: '_id.deviceId', foreignField: '_id', as: 'device' } },
          { $unwind: '$device' },
          { $project: { _id: 0, month: '$_id.month', deviceRef: '$device.ref', deviceName: '$device.name', problem: '$label', count: 1, possibleSerious: 1 } },
          { $sort: { month: -1, count: -1, deviceRef: 1, problem: 1 } },
        ],
        perMonth: [
          { $match: { 'current.basis': 'decided', 'current.isComplaint': true } },
          { $lookup: { from: 'devices', localField: 'deviceId', foreignField: '_id', as: 'device' } },
          { $unwind: '$device' },
          { $group: { _id: { month: '$month', deviceRef: '$device.ref' }, count: { $sum: 1 }, possibleSerious: { $sum: { $cond: ['$current.possibleSeriousIncident', 1, 0] } } } },
          { $project: { _id: 0, month: '$_id.month', deviceRef: '$_id.deviceRef', count: 1, possibleSerious: 1 } },
          { $sort: { month: 1, deviceRef: 1 } },
        ],
        awaiting: [{ $match: { 'current.basis': { $ne: 'decided' } } }, { $count: 'n' }],
      },
    },
  ]).toArray();
  return { rows: result?.rows ?? [], perMonth: result?.perMonth ?? [], awaitingDecision: result?.awaiting[0]?.n ?? 0 };
}
