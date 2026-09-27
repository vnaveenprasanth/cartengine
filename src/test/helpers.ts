/**
 * Test helpers — sets up an isolated SQLite DB for each test file.
 *
 * USAGE PATTERN for each test file:
 *   1. At the very top of the file, before any other imports, call setTestDbPath()
 *   2. Use buildApp() in beforeAll to get a supertest agent
 *   3. Call cleanupTestDb(dbPath) in afterAll
 *
 * We use real SQLite files because @libsql/client does not
 * support in-memory URLs in the same way as better-sqlite3. Each test FILE
 * runs in its own forked process (vitest forks pool), so each gets its own
 * module registry — meaning DB_PATH set here is read fresh when connection.ts
 * is imported for the first time in that process.
 */

import { randomUUID } from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import request from 'supertest';

export function setTestDbPath(): string {
  const dbPath = path.join(os.tmpdir(), `cartengine-test-${randomUUID()}.db`);
  process.env.DB_PATH = dbPath;
  return dbPath;
}

export function cleanupTestDb(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
}

/**
 * Bootstraps the app (run migrations + seed) and returns a supertest agent.
 * MUST be called after setTestDbPath(), inside beforeAll().
 */
export async function buildApp() {
  const { app, bootstrap } = await import('../app');
  await bootstrap();
  return request(app);
}

// ---------------------------------------------------------------------------
// Domain-level helpers to reduce boilerplate in tests
// ---------------------------------------------------------------------------

export type Agent = ReturnType<typeof request>;

export async function createCart(agent: ReturnType<typeof request>) {
  const res = await agent.post('/api/carts').expect(201);
  return res.body.cart as { id: string; status: string };
}

export async function getProducts(agent: ReturnType<typeof request>) {
  const res = await agent.get('/api/products').expect(200);
  return res.body.products as Array<{
    id: string;
    name: string;
    priceCents: number;
    inventory: number;
  }>;
}

export async function addItem(
  agent: ReturnType<typeof request>,
  cartId: string,
  productId: string,
  quantity: number,
) {
  return agent
    .post(`/api/carts/${cartId}/items`)
    .send({ productId, quantity });
}

export async function doCheckout(
  agent: ReturnType<typeof request>,
  cartId: string,
  opts: { idempotencyKey?: string; couponCode?: string } = {},
) {
  return agent.post('/api/checkout').send({
    cartId,
    idempotencyKey: opts.idempotencyKey ?? randomUUID(),
    ...(opts.couponCode ? { couponCode: opts.couponCode } : {}),
  });
}

export async function generateCoupon(agent: ReturnType<typeof request>) {
  const res = await agent.post('/api/admin/coupons/generate').expect(201);
  return res.body.coupon as { id: string; code: string; discountPercent: number };
}

/**
 * Creates n successfully placed orders using a fresh cart each time.
 */
export async function placeNOrders(
  agent: ReturnType<typeof request>,
  n: number,
  productId: string,
) {
  for (let i = 0; i < n; i++) {
    const cart = await createCart(agent);
    const addRes = await addItem(agent, cart.id, productId, 1);
    if (addRes.status !== 201) throw new Error(`addItem failed: ${JSON.stringify(addRes.body)}`);
    const res = await doCheckout(agent, cart.id);
    if (res.status !== 201) {
      throw new Error(`Order ${i + 1} failed: ${JSON.stringify(res.body)}`);
    }
  }
}
