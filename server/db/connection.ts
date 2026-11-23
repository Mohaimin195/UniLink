import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let singletonDb: Database.Database | null = null;

export function createDatabase(dbPath?: string): Database.Database {
  const targetPath = dbPath || process.env.SQLITE_DB_PATH || './data/unilink.db';
  if (targetPath !== ':memory:') {
    const resolved = path.resolve(process.cwd(), targetPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const db = new Database(resolved);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    return db;
  }
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

export function getDb(): Database.Database {
  if (!singletonDb) {
    singletonDb = createDatabase();
  }
  return singletonDb;
}

export function setDbForTesting(db: Database.Database | null) {
  singletonDb = db;
}
