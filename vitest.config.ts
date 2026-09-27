import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Each test FILE runs in its own forked process with a fresh module registry.
    // This is critical: connection.ts creates the libsql client as a module-level
    // singleton. By forking per file, each file's setTestDbPath() call sets
    // process.env.DB_PATH before the singleton is initialized, giving each file
    // a completely isolated database. Tests within the same file share one DB.
    pool: 'forks',
    testTimeout: 30000,
    include: ['src/test/**/*.test.ts'],
  },
});
