import { type ClientSession, type Db, MongoClient, MongoServerError, type ObjectId } from 'mongodb';
import type { ComplaintStatus, HumanTriage, LimitDays, ModelTriage } from '@playnt/shared';
import { COMPLAINT_STATUSES, SERIOUS_OUTCOMES, CHANNELS } from '@playnt/shared';

export interface DeviceDoc {
  _id: ObjectId;
  ref: string;
  name: string;
  riskClass: string;
  intendedUse: string;
  anticipatedHarms: string[];
  expectedSideEffects: string[];
}

export interface ModelSuggestionDoc {
  kind: 'model_suggestion';
  at: Date;
  provider: string;
  model: string;
  promptVersion: string;
  raw: string | null;
  triage: ModelTriage | null;
  error: string | null;
}

export interface HumanDecisionDoc {
  kind: 'human_decision';
  at: Date;
  action: 'confirm' | 'correct';
  by: string;
  triage: HumanTriage;
  reason: string | null;
}

// The complaint embeds its triage history: the complaint screen always reads them together.
// The device is a reference: shared by many complaints, read separately, changed independently.
export interface ComplaintDoc {
  _id: ObjectId;
  ref: string;
  deviceId: ObjectId;
  text: string;
  reporter: { role: string; country: string };
  channel: (typeof CHANNELS)[number];
  awarenessDate: string;
  receivedAt: Date;
  status: ComplaintStatus;
  triageHistory: (ModelSuggestionDoc | HumanDecisionDoc)[];
  // Denormalised from the latest history entry so the queue can filter, sort and index without unwinding.
  current: {
    isComplaint: boolean;
    possibleSeriousIncident: boolean;
    problem: string;
    limitDays: LimitDays | null;
    basis: 'suggested' | 'decided';
  } | null;
  deadline: { limitDays: LimitDays; dueDate: string; dueAt: Date } | null;
  // Set when the quality engineer records that the serious incident report was submitted. Stops the clock.
  report?: { submittedOn: string; recordedAt: Date; by: string } | null;
  // Sequence number and hash of the complaint's last audit event, written in the same transaction as the event.
  // The chain check compares against it, so a deleted last event is caught too.
  auditHead: { seq: number; hash: string } | null;
}

export interface AuditDoc {
  _id: ObjectId;
  complaintId: ObjectId;
  complaintRef: string;
  seq: number;
  type: 'complaint_logged' | 'model_suggestion_stored' | 'model_output_rejected' | 'triage_confirmed' | 'triage_corrected' | 'report_recorded';
  at: Date;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
  prevHash: string | null;
  hash: string;
}

export interface Collections {
  client: MongoClient;
  devices: import('mongodb').Collection<DeviceDoc>;
  complaints: import('mongodb').Collection<ComplaintDoc>;
  audit: import('mongodb').Collection<AuditDoc>;
  counters: import('mongodb').Collection<{ _id: string; seq: number }>;
}

export const collections = (db: Db): Collections => ({
  client: db.client,
  devices: db.collection<DeviceDoc>('devices'),
  complaints: db.collection<ComplaintDoc>('complaints'),
  audit: db.collection<AuditDoc>('auditEvents'),
  counters: db.collection<{ _id: string; seq: number }>('counters'),
});

const str = { bsonType: 'string' };
const nonEmpty = { bsonType: 'string', minLength: 1 };
const nullableStr = { bsonType: ['string', 'null'] };
const limit = { enum: [2, 10, 15, null] };

const triageSchema = (quoteNullable: boolean) => ({
  bsonType: 'object',
  required: ['isComplaint', 'possibleSeriousIncident', 'seriousOutcome', 'timeLimitDays', 'problemDescription', 'evidenceQuote', 'rationale'],
  additionalProperties: false,
  properties: {
    isComplaint: { bsonType: 'bool' },
    possibleSeriousIncident: { bsonType: 'bool' },
    seriousOutcome: { enum: [...SERIOUS_OUTCOMES] },
    timeLimitDays: limit,
    problemDescription: nonEmpty,
    evidenceQuote: quoteNullable ? nullableStr : nonEmpty,
    rationale: nonEmpty,
  },
});

// MongoDB JSON Schema validators: the database refuses documents the API layer should never produce.
export const validators = {
  devices: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['ref', 'name', 'riskClass', 'intendedUse', 'anticipatedHarms', 'expectedSideEffects'],
      properties: {
        ref: nonEmpty, name: nonEmpty, riskClass: { enum: ['I', 'IIa', 'IIb', 'III'] }, intendedUse: str,
        anticipatedHarms: { bsonType: 'array', items: str }, expectedSideEffects: { bsonType: 'array', items: str },
      },
    },
  },
  complaints: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['ref', 'deviceId', 'text', 'reporter', 'channel', 'awarenessDate', 'receivedAt', 'status', 'triageHistory', 'current', 'deadline', 'auditHead'],
      properties: {
        ref: { bsonType: 'string', pattern: '^PLT-\\d{4}-\\d{4}$' },
        deviceId: { bsonType: 'objectId' },
        text: { bsonType: 'string', minLength: 20, maxLength: 4000 },
        reporter: { bsonType: 'object', required: ['role', 'country'], properties: { role: nonEmpty, country: nonEmpty } },
        channel: { enum: [...CHANNELS] },
        awarenessDate: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        receivedAt: { bsonType: 'date' },
        status: { enum: [...COMPLAINT_STATUSES] },
        triageHistory: {
          bsonType: 'array',
          minItems: 1,
          items: {
            oneOf: [
              {
                bsonType: 'object',
                required: ['kind', 'at', 'provider', 'model', 'promptVersion', 'raw', 'triage', 'error'],
                additionalProperties: false,
                properties: {
                  kind: { enum: ['model_suggestion'] }, at: { bsonType: 'date' }, provider: nonEmpty, model: nonEmpty, promptVersion: nonEmpty,
                  raw: nullableStr, triage: { oneOf: [{ bsonType: 'null' }, triageSchema(false)] }, error: nullableStr,
                },
              },
              {
                bsonType: 'object',
                required: ['kind', 'at', 'action', 'by', 'triage', 'reason'],
                additionalProperties: false,
                properties: {
                  kind: { enum: ['human_decision'] }, at: { bsonType: 'date' }, action: { enum: ['confirm', 'correct'] }, by: nonEmpty,
                  triage: triageSchema(true), reason: nullableStr,
                },
              },
            ],
          },
        },
        current: {
          oneOf: [
            { bsonType: 'null' },
            {
              bsonType: 'object',
              required: ['isComplaint', 'possibleSeriousIncident', 'problem', 'limitDays', 'basis'],
              properties: { isComplaint: { bsonType: 'bool' }, possibleSeriousIncident: { bsonType: 'bool' }, problem: str, limitDays: limit, basis: { enum: ['suggested', 'decided'] } },
            },
          ],
        },
        report: {
          oneOf: [
            { bsonType: 'null' },
            { bsonType: 'object', required: ['submittedOn', 'recordedAt', 'by'], additionalProperties: false, properties: { submittedOn: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, recordedAt: { bsonType: 'date' }, by: nonEmpty } },
          ],
        },
        auditHead: {
          oneOf: [
            { bsonType: 'null' },
            { bsonType: 'object', required: ['seq', 'hash'], additionalProperties: false, properties: { seq: { bsonType: 'int', minimum: 1 }, hash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' } } },
          ],
        },
        deadline: {
          oneOf: [
            { bsonType: 'null' },
            {
              bsonType: 'object',
              required: ['limitDays', 'dueDate', 'dueAt'],
              properties: { limitDays: { enum: [2, 10, 15] }, dueDate: str, dueAt: { bsonType: 'date' } },
            },
          ],
        },
      },
    },
  },
  auditEvents: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['complaintId', 'complaintRef', 'seq', 'type', 'at', 'actor', 'summary', 'payload', 'prevHash', 'hash'],
      additionalProperties: false,
      properties: {
        _id: { bsonType: 'objectId' },
        complaintId: { bsonType: 'objectId' },
        complaintRef: nonEmpty,
        seq: { bsonType: 'int', minimum: 1 },
        type: { enum: ['complaint_logged', 'model_suggestion_stored', 'model_output_rejected', 'triage_confirmed', 'triage_corrected', 'report_recorded'] },
        at: { bsonType: 'date' },
        actor: nonEmpty,
        summary: nonEmpty,
        payload: { bsonType: 'object' },
        prevHash: { bsonType: ['string', 'null'] },
        hash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    },
  },
} as const;

// A complaint change and its audit events commit together or not at all. Transactions need a replica set:
// MongoDB Atlas is one, the tests and the local demo start a one-member set, and docker-compose.yml runs one.
export async function inTransaction<T>(c: Collections, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = c.client.startSession();
  try {
    return await session.withTransaction(fn);
  } finally {
    await session.endSession();
  }
}

// Creates collections with validators and the indexes the queries rely on. Safe to run repeatedly.
export async function setupCollections(db: Db): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, validator] of Object.entries(validators)) {
    if (existing.has(name)) await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
    else await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
  }
  const c = collections(db);
  await c.devices.createIndex({ ref: 1 }, { unique: true });
  await c.complaints.createIndex({ ref: 1 }, { unique: true });
  // Queue: filter by status, sort by deadline.
  await c.complaints.createIndex({ status: 1, 'deadline.dueAt': 1 });
  // Trends and device filter: one device over time.
  await c.complaints.createIndex({ deviceId: 1, awarenessDate: -1 });
  // Audit chain: one sequence per complaint, no gaps or duplicates.
  await c.audit.createIndex({ complaintId: 1, seq: 1 }, { unique: true });
  await c.audit.createIndex({ at: -1 });
}

// Role for the application user: it may append to the audit trail but never change or remove an event.
export async function setupAppRole(admin: Db, dbName: string, user?: { name: string; password: string }): Promise<void> {
  const role = 'playntApp';
  const privileges = [
    { resource: { db: dbName, collection: 'devices' }, actions: ['find', 'insert', 'update'] },
    { resource: { db: dbName, collection: 'complaints' }, actions: ['find', 'insert', 'update'] },
    { resource: { db: dbName, collection: 'counters' }, actions: ['find', 'insert', 'update'] },
    { resource: { db: dbName, collection: 'auditEvents' }, actions: ['find', 'insert'] },
  ];
  try {
    await admin.command({ createRole: role, privileges, roles: [] });
  } catch (e) {
    if (!(e instanceof MongoServerError && e.code === 51002)) throw e;
    await admin.command({ updateRole: role, privileges, roles: [] });
  }
  if (user) {
    try {
      await admin.command({ createUser: user.name, pwd: user.password, roles: [{ role, db: 'admin' }] });
    } catch (e) {
      if (!(e instanceof MongoServerError && e.code === 51003)) throw e;
    }
  }
}

export async function connect(uri: string, dbName: string) {
  const client = new MongoClient(uri);
  await client.connect();
  return { client, db: client.db(dbName) };
}
