import 'dotenv/config';
import { getDb } from './connection.ts';
import { runMigrations } from './migrations.ts';
import { seedDatabase } from './seed.ts';

const db = getDb();
runMigrations(db);
seedDatabase(db, { includeDemoData: true, forceDemo: true });
console.log('UniLink database migrated and seeded successfully.');
process.exit(0);
