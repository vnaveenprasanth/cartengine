/**
 * Oversell prevention tests — concurrent checkouts competing for limited inventory
 *
 * This file specifically exercises the core concurrency invariant:
 * "The system must not sell more inventory than is available."
 *
 * We fire multiple checkouts simultaneously using Promise.all() and assert
 * that exactly N succeed (where N = available inventory) and the rest fail
 * with INSUFFICIENT_INVENTORY.
 */

import { setTestDbPath, cleanupTestDb, buildApp, createCart, getProducts, addItem, doCheckout } from './helpers';

const dbPath = setTestDbPath();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

let agent: ReturnType<typeof request>;
let limitedProduct: { id: string; name: string; priceCents: number; inventory: number };
let abundantProduct: { id: string; name: string; priceCents: number; inventory: number };

beforeAll(async () => {
  agent = await buildApp();
  const products = await getProducts(agent);
  // "Limited Edition Smart Watch" — seeded with inventory: 3
  limitedProduct = products.find((p) => p.inventory <= 3)!;
  abundantProduct = products.find((p) => p.inventory >= 20)!;
  expect(limitedProduct).toBeDefined();
  expect(abundantProduct).toBeDefined();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Oversell prevention — single checkout request', () => {
  it('rejects checkout when requested quantity exceeds available inventory', async () => {
    const inventoryNow = (await agent.get(`/api/products/${limitedProduct.id}`).expect(200)).body.product.inventory;
    const cart = await createCart(agent);
    await addItem(agent, cart.id, limitedProduct.id, inventoryNow + 5);

    const res = await doCheckout(agent, cart.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');
  });

  it('does NOT alter inventory when checkout is rejected', async () => {
    const inventoryBefore = (await agent.get(`/api/products/${limitedProduct.id}`).expect(200)).body.product.inventory;
    const cart = await createCart(agent);
    await addItem(agent, cart.id, limitedProduct.id, inventoryBefore + 10);
    await doCheckout(agent, cart.id); // should fail

    const productRes = await agent.get(`/api/products/${limitedProduct.id}`).expect(200);
    expect(productRes.body.product.inventory).toBe(inventoryBefore);
  });
});

describe('Oversell prevention — concurrent checkouts (CRITICAL invariant)', () => {
  it('only allows as many checkouts as available inventory, no overselling', async () => {
    // Get the real current inventory (may have changed if previous tests ran)
    const productRes = await agent.get(`/api/products/${limitedProduct.id}`).expect(200);
    const INVENTORY = productRes.body.product.inventory as number;

    // Create INVENTORY + 2 carts, all wanting 1 unit
    const carts = await Promise.all(
      Array.from({ length: INVENTORY + 2 }, () => createCart(agent)),
    );

    // Add the limited product to all carts
    await Promise.all(carts.map((cart) => addItem(agent, cart.id, limitedProduct.id, 1)));

    // Fire ALL checkouts concurrently — this is the critical race condition test
    const results = await Promise.all(carts.map((cart) => doCheckout(agent, cart.id)));

    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status === 422);

    // Exactly INVENTORY should succeed, the remaining 2 must fail
    expect(successes).toHaveLength(INVENTORY);
    expect(failures).toHaveLength(2);
    failures.forEach((f) => {
      expect(f.body.error.code).toBe('INSUFFICIENT_INVENTORY');
    });

    // The inventory must land exactly at 0 — never negative
    const finalProductRes = await agent.get(`/api/products/${limitedProduct.id}`).expect(200);
    expect(finalProductRes.body.product.inventory).toBe(0);
  });

  it('allows concurrent checkouts for an abundant product without issues', async () => {
    const inventoryBefore = (await agent.get(`/api/products/${abundantProduct.id}`).expect(200)).body.product.inventory;
    const CONCURRENT = 5;

    const carts = await Promise.all(Array.from({ length: CONCURRENT }, () => createCart(agent)));
    await Promise.all(carts.map((cart) => addItem(agent, cart.id, abundantProduct.id, 1)));

    const results = await Promise.all(carts.map((cart) => doCheckout(agent, cart.id)));

    const successes = results.filter((r) => r.status === 201);
    expect(successes).toHaveLength(CONCURRENT);

    const inventoryAfter = (await agent.get(`/api/products/${abundantProduct.id}`).expect(200)).body.product.inventory;
    expect(inventoryAfter).toBe(inventoryBefore - CONCURRENT);
  });
});
