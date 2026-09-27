/**
 * Checkout happy path + idempotency + double-checkout prevention
 */

import { setTestDbPath, cleanupTestDb, buildApp, createCart, getProducts, addItem, doCheckout } from './helpers';

const dbPath = setTestDbPath();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';

let agent: ReturnType<typeof request>;
// Use products with abundant inventory (>= 50) to avoid depletion across tests
let abundantProduct: { id: string; name: string; priceCents: number; inventory: number };
let anotherProduct: { id: string; name: string; priceCents: number; inventory: number };

beforeAll(async () => {
  agent = await buildApp();
  const products = await getProducts(agent);
  // Pick products with large inventory so sequential tests don't deplete them
  const abundant = products.filter((p) => p.inventory >= 50);
  expect(abundant.length).toBeGreaterThanOrEqual(2);
  abundantProduct = abundant[0];
  anotherProduct = abundant[1] ?? abundant[0];
});

afterAll(() => cleanupTestDb(dbPath));

describe('Checkout — happy path', () => {
  it('creates an order with correct subtotal and zero discount', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, abundantProduct.id, 2);

    const res = await doCheckout(agent, cart.id);
    expect(res.status).toBe(201);

    const order = res.body.order;
    expect(order.subtotalCents).toBe(abundantProduct.priceCents * 2);
    expect(order.discountCents).toBe(0);
    expect(order.totalCents).toBe(abundantProduct.priceCents * 2);
  });

  it('snapshots product name and price at time of checkout', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, abundantProduct.id, 1);

    const res = await doCheckout(agent, cart.id);
    expect(res.status).toBe(201);

    const lineItem = res.body.order.items[0];
    expect(lineItem.productName).toBe(abundantProduct.name);
    expect(lineItem.unitPriceCents).toBe(abundantProduct.priceCents);
    expect(lineItem.lineTotalCents).toBe(abundantProduct.priceCents);
  });

  it('rejects checkout of an empty cart with EMPTY_CART', async () => {
    const cart = await createCart(agent);
    const res = await doCheckout(agent, cart.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('EMPTY_CART');
  });

  it('marks the cart as checked_out after successful checkout', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, abundantProduct.id, 1);

    const checkoutRes = await doCheckout(agent, cart.id);
    expect(checkoutRes.status).toBe(201);

    const cartRes = await agent.get(`/api/carts/${cart.id}`).expect(200);
    expect(cartRes.body.cart.status).toBe('checked_out');
  });

  it('deducts inventory after checkout', async () => {
    const inventoryBefore = (await agent.get(`/api/products/${abundantProduct.id}`).expect(200)).body.product.inventory;

    const cart = await createCart(agent);
    await addItem(agent, cart.id, abundantProduct.id, 2);
    const res = await doCheckout(agent, cart.id);
    expect(res.status).toBe(201);

    const productRes = await agent.get(`/api/products/${abundantProduct.id}`).expect(200);
    expect(productRes.body.product.inventory).toBe(inventoryBefore - 2);
  });

  it('retrieves the order via GET /api/orders/:id', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, abundantProduct.id, 1);
    const checkoutRes = await doCheckout(agent, cart.id);
    expect(checkoutRes.status).toBe(201);

    const orderId = checkoutRes.body.order.id;
    const orderRes = await agent.get(`/api/orders/${orderId}`).expect(200);
    expect(orderRes.body.order.id).toBe(orderId);
    expect(orderRes.body.order.items).toHaveLength(1);
  });
});

describe('Checkout — idempotency (retry safety)', () => {
  it('returns the same order on retry with the same idempotencyKey', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, abundantProduct.id, 1);

    const key = randomUUID();
    const first = await doCheckout(agent, cart.id, { idempotencyKey: key });
    expect(first.status).toBe(201);

    const retry = await doCheckout(agent, cart.id, { idempotencyKey: key });
    expect(retry.status).toBe(200); // 200 = idempotent replay
    expect(retry.body.order.id).toBe(first.body.order.id);
  });

  it('does NOT deduct inventory twice on retry', async () => {
    const inventoryBefore = (await agent.get(`/api/products/${abundantProduct.id}`).expect(200)).body.product.inventory;

    const cart = await createCart(agent);
    await addItem(agent, cart.id, abundantProduct.id, 1);

    const key = randomUUID();
    const first = await doCheckout(agent, cart.id, { idempotencyKey: key });
    expect(first.status).toBe(201);

    await doCheckout(agent, cart.id, { idempotencyKey: key }); // retry

    const productRes = await agent.get(`/api/products/${abundantProduct.id}`).expect(200);
    // inventory should have decreased by exactly 1, not 2
    expect(productRes.body.product.inventory).toBe(inventoryBefore - 1);
  });
});

describe('Checkout — double checkout prevention', () => {
  it('rejects a second checkout of the same cart with a different idempotency key', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, abundantProduct.id, 1);

    const first = await doCheckout(agent, cart.id);
    expect(first.status).toBe(201);

    // New key — this must be rejected because the cart is now checked_out
    const second = await doCheckout(agent, cart.id, { idempotencyKey: randomUUID() });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CART_ALREADY_CHECKED_OUT');
  });
});
