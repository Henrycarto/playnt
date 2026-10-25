import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

// The serverless entry keeps one app and one MongoDB client per function instance.
let mongo: MongoMemoryServer;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); });
afterAll(async () => { await mongo.stop(); });

// A fresh module per test, so the cached app of one test never leaks into the next.
beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const env = () => ({ TRIAGE_PROVIDER: 'demo', MONGODB_URI: mongo.getUri(), MONGODB_DB: 'handler' });

describe('serverless handler', () => {
  it('builds the app and connects to MongoDB once across invocations', async () => {
    const connect = vi.spyOn(MongoClient.prototype, 'connect');
    const { getApp } = await import('../src/handler.js');
    const [a, b] = await Promise.all([getApp(env()), getApp(env())]);
    expect(await getApp(env())).toBe(a);
    expect(b).toBe(a);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('serves the API through the default export, in demo mode with the frozen clock', async () => {
    for (const [k, v] of Object.entries(env())) vi.stubEnv(k, v);
    const { default: handler } = await import('../src/handler.js');
    const res = await request(handler).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, mode: 'demo', now: '2026-10-25T09:00:00.000Z' });
  });

  it('forgets a failed start, so the next invocation tries again', async () => {
    const { getApp } = await import('../src/handler.js');
    await expect(getApp({ ...env(), MONGODB_URI: 'not-a-mongodb-uri' })).rejects.toThrow();
    await expect(getApp(env())).resolves.toBeTypeOf('function');
  });
});
