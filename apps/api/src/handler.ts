import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createApp } from './app.js';
import { clockFrom, loadConfig } from './config.js';
import { collections, connect } from './db.js';
import { providerFrom } from './providers.js';

// Serverless entry (Vercel Function). An instance serves many invocations, so the app and its
// MongoDB client are built once and reused; a failed start is forgotten so the next request retries.
// Collections, validators and indexes are set up by the seed, not here: the app user may not change them.
let ready: Promise<Express> | null = null;

export function getApp(env: NodeJS.ProcessEnv = process.env): Promise<Express> {
  ready ??= (async () => {
    const config = loadConfig(env);
    const { db } = await connect(config.mongoUri, config.dbName);
    return createApp({ c: collections(db), provider: providerFrom(config), clock: clockFrom(config.fixedNow), mode: config.provider, corsOrigin: config.corsOrigin });
  })().catch((e: unknown) => {
    ready = null;
    throw e;
  });
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
}
