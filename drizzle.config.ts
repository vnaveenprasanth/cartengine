import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.DB_PATH ? `file:${process.env.DB_PATH}` : 'file:./cartengine.db',
  },
} satisfies Config;
