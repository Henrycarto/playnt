// Self-contained demo: in-memory MongoDB, seeded story, API on PORT. Used for browser tests and CI; no Docker needed.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { clockFrom, loadConfig } from '../src/config.js';
import { collections, connect } from '../src/db.js';
import { providerFrom } from '../src/providers.js';
import { seedDatabase } from '../src/seed.js';

const config = loadConfig();
const mongo = await MongoMemoryServer.create();
const { db } = await connect(mongo.getUri(), config.dbName);
const provider = providerFrom(config);
const clock = clockFrom(config.fixedNow);
const log = await seedDatabase(db, { provider, clock });
console.log(`Seeded ${log.length} complaints (${log.filter((l) => l.includes('needs_manual')).length} without a usable suggestion).`);
const app = createApp({ c: collections(db), provider, clock, mode: config.provider, corsOrigin: config.corsOrigin });
const server = app.listen(config.port, () => console.log(`Playnt demo API on http://localhost:${config.port}`));
const stop = async () => { server.close(); await mongo.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
