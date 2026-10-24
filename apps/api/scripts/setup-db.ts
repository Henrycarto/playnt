// Creates collections, validators, indexes and the least-privilege application user. Needs MONGODB_ADMIN_URI.
import { connect, setupAppRole, setupCollections } from '../src/db.js';

const adminUri = process.env.MONGODB_ADMIN_URI;
const dbName = process.env.MONGODB_DB ?? 'playnt';
const appUser = process.env.MONGODB_APP_USER ?? 'playnt_app';
const appPassword = process.env.MONGODB_APP_PASSWORD;
if (!adminUri || !appPassword) {
  console.error('Set MONGODB_ADMIN_URI and MONGODB_APP_PASSWORD in .env (see .env.example).');
  process.exit(1);
}
const { client, db } = await connect(adminUri, dbName);
try {
  await setupCollections(db);
  await setupAppRole(client.db('admin'), dbName, { name: appUser, password: appPassword });
  console.log(`Collections, validators and indexes ready in "${dbName}". User "${appUser}" may append to auditEvents but not change or delete events.`);
} finally {
  await client.close();
}
