import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { ComplaintInputSchema, DecisionInputSchema, ListQuerySchema, ReportInputSchema, type ApiError } from '@playnt/shared';
import { verifyChains } from './audit.js';
import { loadSeed } from './seed.js';
import {
  decide, getComplaint, HttpError, listAudit, listComplaints, listDevices, logComplaint, recordReport, retryTriage, trends, type Deps,
} from './service.js';

const issuesOf = (e: z.ZodError) => e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(422, 'Some fields need attention.', issuesOf(r.error));
  return r.data;
}

const TrendQuerySchema = z.strictObject({
  from: z.iso.date().default('2026-01-01'),
  to: z.iso.date().default('2026-12-31'),
});

type Handler = (req: Request, res: Response) => Promise<unknown>;
const route = (h: Handler) => (req: Request, res: Response, next: NextFunction) => h(req, res).then((body) => res.json(body), next);

export function createApp(deps: Deps & { mode: string; corsOrigin?: string | undefined }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  if (deps.corsOrigin) {
    app.use((req, res, next) => {
      res.setHeader('access-control-allow-origin', deps.corsOrigin!);
      res.setHeader('access-control-allow-headers', 'content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST');
      if (req.method === 'OPTIONS') return void res.sendStatus(204);
      next();
    });
  }

  app.get('/api/health', route(async () => ({ ok: true, mode: deps.mode, provider: deps.provider.name, model: deps.provider.model, now: deps.clock().toISOString() })));
  app.get('/api/devices', route(async () => listDevices(deps)));
  // Sample texts for the intake form. In demo mode these are the only new texts with a recorded model response.
  const samples = loadSeed().samples.map(({ device, reporterRole, channel, text }) => ({ device, reporterRole, channel, text }));
  app.get('/api/samples', route(async () => samples));
  app.get('/api/complaints', route(async (req) => listComplaints(deps, parse(ListQuerySchema, req.query))));
  app.post('/api/complaints', async (req, res, next) => {
    try {
      const doc = await logComplaint(deps, parse(ComplaintInputSchema, req.body));
      res.status(201).json(await getComplaint(deps, doc._id.toHexString()));
    } catch (e) { next(e); }
  });
  app.get('/api/complaints/:id', route(async (req) => getComplaint(deps, String(req.params.id))));
  app.post('/api/complaints/:id/decisions', route(async (req) => {
    const doc = await decide(deps, String(req.params.id), parse(DecisionInputSchema, req.body));
    return getComplaint(deps, doc._id.toHexString());
  }));
  app.post('/api/complaints/:id/report', route(async (req) => {
    const doc = await recordReport(deps, String(req.params.id), parse(ReportInputSchema, req.body));
    return getComplaint(deps, doc._id.toHexString());
  }));
  app.post('/api/complaints/:id/retry', route(async (req) => {
    const doc = await retryTriage(deps, String(req.params.id));
    return getComplaint(deps, doc._id.toHexString());
  }));
  app.get('/api/trends', route(async (req) => {
    const q = parse(TrendQuerySchema, req.query);
    return trends(deps, q.from, q.to);
  }));
  // The audit trail is read-only over HTTP. There is deliberately no PUT, PATCH or DELETE anywhere in the API.
  app.get('/api/audit', route(async () => listAudit(deps)));
  app.get('/api/audit/verify', route(async () => verifyChains(deps.c)));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' } satisfies ApiError));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, issues: err.issues } satisfies ApiError);
    if (err instanceof SyntaxError && 'body' in err) return void res.status(400).json({ error: 'Request body is not valid JSON.' } satisfies ApiError);
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. The request was not saved.' } satisfies ApiError);
  });
  return app;
}
