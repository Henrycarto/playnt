import { createApp } from './app.js';
import { clockFrom, loadConfig } from './config.js';
import { collections, connect, setupCollections } from './db.js';
import { providerFrom } from './providers.js';

const config = loadConfig();
const { db } = await connect(config.mongoUri, config.dbName);
try {
  await setupCollections(db);
} catch (e) {
  // The least-privilege app user cannot change validators; npm run db:setup does that as admin.
  console.warn(`Collection setup skipped: ${(e as Error).message}`);
}
const provider = providerFrom(config);
const app = createApp({ c: collections(db), provider, clock: clockFrom(config.fixedNow), mode: config.provider, corsOrigin: config.corsOrigin });
app.listen(config.port, () => {
  console.log(`Playnt API on http://localhost:${config.port} (${config.provider} mode, model ${provider.model}${config.fixedNow ? `, clock fixed at ${config.fixedNow}` : ''})`);
});
