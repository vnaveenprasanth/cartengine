import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import path from 'path';

const DB_URL = process.env.DB_PATH
  ? `file:${process.env.DB_PATH}`
  : `file:${path.join(process.cwd(), 'cartengine.db')}`;

const client = createClient({ url: DB_URL });

export const db = drizzle(client);

export async function initDB() {
  // WAL mode: concurrent reads alongside write transactions
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA foreign_keys = ON');
  console.log('Database connected (WAL mode)');
}
