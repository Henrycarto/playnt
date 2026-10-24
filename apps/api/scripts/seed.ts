// Resets the database and loads the demo story. Run with an admin connection: it drops the database.
import { clockFrom, loadConfig } from '../src/config.js';
import { connect } from '../src/db.js';
import { providerFrom } from '../src/providers.js';
import { seedDatabase } from '../src/seed.js';

const config = loadConfig();
const uri = process.env.MONGODB_ADMIN_URI ?? config.mongoUri;
const { client, db } = await connect(uri, config.dbName);
try {
  const log = await seedDatabase(db, { provider: providerFrom(config), clock: clockFrom(config.fixedNow) });
  console.log(log.join('\n'));
  console.log(`Seeded ${log.length} complaints into "${config.dbName}" using the ${config.provider} provider.`);
} finally {
  await client.close();
}
