import { migrate } from 'drizzle-orm/libsql/migrator';
import { db, initDB } from './connection';
import path from 'path';

async function runMigrations() {
  await initDB();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  console.log('Migrations applied successfully');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
