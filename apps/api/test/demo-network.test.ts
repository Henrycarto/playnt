import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { clockFrom, loadConfig } from '../src/config.js';
import { collections } from '../src/db.js';
import { providerFrom } from '../src/providers.js';
import { seedDatabase } from '../src/seed.js';
import { GeminiProvider } from '../src/triage/gemini.js';

// Demo mode must never call a real service. Every fetch and every socket is watched while the whole demo runs.
let server: MongoMemoryServer;
let client: MongoClient;
const fetches: string[] = [];
const sockets: string[] = [];
const realFetch = globalThis.fetch;
const realConnect = net.Socket.prototype.connect;

beforeAll(async () => {
  server = await MongoMemoryServer.create(); // may download the MongoDB binary once, so it starts before the watch
  client = new MongoClient(server.getUri());
  await client.connect();
  globalThis.fetch = (async (input: string | URL | Request) => {
    fetches.push(String(input instanceof Request ? input.url : input));
    throw new Error('Network access in demo mode');
  }) as typeof fetch;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const opts = args[0] as { host?: string; path?: string } | number | string;
    const host = typeof opts === 'object' && opts ? opts.host ?? opts.path ?? 'localhost' : typeof args[1] === 'string' ? args[1] : 'localhost';
    sockets.push(String(host));
    return (realConnect as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect;
}, 180_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  net.Socket.prototype.connect = realConnect;
  await client?.close();
  await server?.stop();
});

describe('demo mode', () => {
  it('seeds, serves and triages a new complaint without any request leaving the machine', async () => {
    const config = loadConfig({ TRIAGE_PROVIDER: 'demo' });
    expect(config.provider).toBe('demo');
    const provider = providerFrom(config);
    const clock = clockFrom(config.fixedNow);
    const db = client.db('playnt_demo_network');
    await seedDatabase(db, { provider, clock });
    const app = createApp({ c: collections(db), provider, clock, mode: 'demo' });
    const devices = (await request(app).get('/api/devices')).body;
    for (const path of ['/api/health', '/api/complaints?status=all', '/api/trends', '/api/audit', '/api/audit/verify']) {
      expect((await request(app).get(path)).status).toBe(200);
    }
    const res = await request(app).post('/api/complaints').send({
      deviceId: devices[0].id, text: 'A text that has no recording, so demo mode must not ask any model about it.',
      reporterRole: 'Test', reporterCountry: 'Austria', channel: 'email', awarenessDate: '2026-10-24',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('needs_manual_triage');
    expect(fetches).toEqual([]);
    expect(sockets.filter((h) => !['localhost', '127.0.0.1', '::1'].includes(h))).toEqual([]);
  });

  it('would catch a real provider: the watch is not vacuous', async () => {
    const before = fetches.length;
    await new GeminiProvider('gemini-3.8-flash', 'not-a-key').complete({ system: 's', user: 'u', complaintText: 'u' }).catch(() => undefined);
    expect(fetches.slice(before)).toEqual([expect.stringContaining('generativelanguage.googleapis.com')]);
  });
});
