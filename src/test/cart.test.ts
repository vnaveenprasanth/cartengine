/**
 * Cart validation tests
 */

import { setTestDbPath, cleanupTestDb, buildApp, createCart, getProducts, addItem } from './helpers';

const dbPath = setTestDbPath();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';

let agent: ReturnType<typeof request>;
// Use a product with abundant inventory so sequential tests don't deplete stock
let safeProduct: { id: string; name: string; priceCents: number; inventory: number };
let anotherSafeProduct: { id: string; name: string; priceCents: number; inventory: number };

beforeAll(async () => {
  agent = await buildApp();
  const products = await getProducts(agent);
  const abundant = products.filter((p) => p.inventory >= 50);
  safeProduct = abundant[0];
  anotherSafeProduct = abundant[1] ?? abundant[0];
  expect(safeProduct).toBeDefined();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Cart creation', () => {
  it('creates a cart with status=active', async () => {
    const res = await agent.post('/api/carts').expect(201);
    expect(res.body.cart.status).toBe('active');
    expect(res.body.cart.id).toBeDefined();
  });
});

describe('Cart item validation', () => {
  it('rejects a product that does not exist', async () => {
    const cart = await createCart(agent);
    const res = await agent
      .post(`/api/carts/${cart.id}/items`)
      .send({ productId: randomUUID(), quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('rejects quantity of zero', async () => {
    const cart = await createCart(agent);
    const res = await agent
      .post(`/api/carts/${cart.id}/items`)
      .send({ productId: safeProduct.id, quantity: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects negative quantity', async () => {
    const cart = await createCart(agent);
    const res = await agent
      .post(`/api/carts/${cart.id}/items`)
      .send({ productId: safeProduct.id, quantity: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects add-item on a non-existent cart', async () => {
    const res = await agent
      .post(`/api/carts/${randomUUID()}/items`)
      .send({ productId: safeProduct.id, quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CART_NOT_FOUND');
  });

  it('accumulates quantity when the same product is added twice', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, safeProduct.id, 2);
    await addItem(agent, cart.id, safeProduct.id, 3);

    const res = await agent.get(`/api/carts/${cart.id}`).expect(200);
    const item = res.body.cart.items.find((i: { productId: string }) => i.productId === safeProduct.id);
    expect(item.quantity).toBe(5);
  });
});

describe('Cart view and totals', () => {
  it('returns correct subtotalCents based on live product price', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, safeProduct.id, 3);

    const res = await agent.get(`/api/carts/${cart.id}`).expect(200);
    expect(res.body.cart.subtotalCents).toBe(safeProduct.priceCents * 3);
  });

  it('updates an item quantity', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, safeProduct.id, 2);

    await agent
      .put(`/api/carts/${cart.id}/items/${safeProduct.id}`)
      .send({ quantity: 7 })
      .expect(200);

    const res = await agent.get(`/api/carts/${cart.id}`).expect(200);
    const item = res.body.cart.items.find((i: { productId: string }) => i.productId === safeProduct.id);
    expect(item.quantity).toBe(7);
  });

  it('removes an item from the cart', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, safeProduct.id, 1);

    await agent
      .delete(`/api/carts/${cart.id}/items/${safeProduct.id}`)
      .expect(204);

    const res = await agent.get(`/api/carts/${cart.id}`).expect(200);
    expect(res.body.cart.items).toHaveLength(0);
  });

  it('shows items from multiple products in the cart', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, safeProduct.id, 1);
    await addItem(agent, cart.id, anotherSafeProduct.id, 2);

    const res = await agent.get(`/api/carts/${cart.id}`).expect(200);
    expect(res.body.cart.items).toHaveLength(2);

    const expectedSubtotal = safeProduct.priceCents * 1 + anotherSafeProduct.priceCents * 2;
    expect(res.body.cart.subtotalCents).toBe(expectedSubtotal);
  });
});
