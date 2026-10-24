import { createHash } from 'node:crypto';
import { MongoServerError, ObjectId } from 'mongodb';
import type { AuditDoc, Collections } from './db.js';

type NewEvent = Pick<AuditDoc, 'complaintId' | 'complaintRef' | 'type' | 'at' | 'actor' | 'summary' | 'payload'>;

// Stable JSON: keys sorted, dates as ISO strings, so the hash does not depend on insertion order.
function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value instanceof ObjectId) return JSON.stringify(value.toHexString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashEvent(e: Omit<AuditDoc, '_id' | 'hash'>): string {
  const { complaintId, complaintRef, seq, type, at, actor, summary, payload, prevHash } = e;
  return createHash('sha256').update(canonical({ complaintId, complaintRef, seq, type, at, actor, summary, payload, prevHash })).digest('hex');
}

// Append-only: this module offers append and read, nothing else. Each event links to the previous one by hash.
export async function appendAudit(c: Collections, event: NewEvent): Promise<AuditDoc> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await c.audit.find({ complaintId: event.complaintId }).sort({ seq: -1 }).limit(1).next();
    const body = { ...event, seq: (last?.seq ?? 0) + 1, prevHash: last?.hash ?? null };
    const doc: AuditDoc = { _id: new ObjectId(), ...body, hash: hashEvent(body) };
    try {
      await c.audit.insertOne(doc);
      return doc;
    } catch (e) {
      // Another writer took this sequence number: read the new tail and try again.
      if (e instanceof MongoServerError && e.code === 11000) continue;
      throw e;
    }
  }
  throw new Error('Could not append audit event after 5 attempts.');
}

export interface ChainCheck {
  complaints: number;
  events: number;
  broken: { complaintRef: string; seq: number; problem: string }[];
}

export async function verifyChains(c: Collections): Promise<ChainCheck> {
  const broken: ChainCheck['broken'] = [];
  let events = 0;
  const ids = await c.audit.distinct('complaintId');
  for (const id of ids) {
    let prev: AuditDoc | null = null;
    for await (const e of c.audit.find({ complaintId: id }).sort({ seq: 1 })) {
      events++;
      const expectedSeq = (prev?.seq ?? 0) + 1;
      if (e.seq !== expectedSeq) broken.push({ complaintRef: e.complaintRef, seq: e.seq, problem: `Expected sequence ${expectedSeq}.` });
      if (e.prevHash !== (prev?.hash ?? null)) broken.push({ complaintRef: e.complaintRef, seq: e.seq, problem: 'Link to the previous event does not match.' });
      const { _id, hash, ...body } = e;
      if (hashEvent(body) !== hash) broken.push({ complaintRef: e.complaintRef, seq: e.seq, problem: 'Content does not match its hash.' });
      prev = e;
    }
  }
  return { complaints: ids.length, events, broken };
}
