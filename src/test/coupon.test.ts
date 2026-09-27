/**
 * Coupon tests — lifecycle, rollback safety, concurrent redemption
 *
 * Tests:
 *  - Coupon generation: milestone gating (before/at/after threshold)
 *  - Idempotent generation: can't generate twice for same milestone
 *  - Coupon application: correct discount, order total
 *  - Coupon single-use: second checkout with same code rejected
 *  - Coupon rollback: survives a failed checkout (transaction rollback)
 *  - Concurrent redemption: two checkouts race for same coupon → exactly one wins
 */

import {
  setTestDbPath,
  cleanupTestDb,
  buildApp,
  createCart,
  getProducts,
  addItem,
  doCheckout,
  generateCoupon,
  placeNOrders,
} from './helpers';

const dbPath = setTestDbPath();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

let agent: ReturnType<typeof request>;
let cheapProduct: { id: string; priceCents: number; inventory: number };
let limitedProduct: { id: string; priceCents: number; inventory: number };

beforeAll(async () => {
  agent = await buildApp();
  const products = await getProducts(agent);
  cheapProduct = products.find((p) => p.inventory >= 30)!;
  limitedProduct = products.find((p) => p.inventory <= 3)!;
  expect(cheapProduct).toBeDefined();
  expect(limitedProduct).toBeDefined();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------
// Milestone gating
// ---------------------------------------------------------------------------

describe('Coupon generation — milestone gating', () => {
  it('rejects generation when 0 orders exist', async () => {
    const res = await agent.post('/api/admin/coupons/generate');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COUPON_MILESTONE_NOT_REACHED');
  });

  it('rejects generation with only 4 orders (interval=5, milestone not yet reached)', async () => {
    await placeNOrders(agent, 4, cheapProduct.id);

    const res = await agent.post('/api/admin/coupons/generate');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COUPON_MILESTONE_NOT_REACHED');
  });

  it('allows generation at exactly 5 orders (first milestone)', async () => {
    await placeNOrders(agent, 1, cheapProduct.id); // now at 5 total

    const res = await agent.post('/api/admin/coupons/generate').expect(201);
    expect(res.body.coupon.code).toMatch(/^REWARD-/);
    expect(res.body.coupon.discountPercent).toBe(10);
    expect(res.body.coupon.milestoneOrderNumber).toBe(5);
  });

  it('rejects a second generation attempt for the same milestone', async () => {
    // Still at 5 orders, coupon for milestone-5 already generated
    const res = await agent.post('/api/admin/coupons/generate');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COUPON_MILESTONE_NOT_REACHED');
  });

  it('allows a second coupon after reaching 10 orders', async () => {
    await placeNOrders(agent, 5, cheapProduct.id); // total = 10

    const res = await agent.post('/api/admin/coupons/generate').expect(201);
    expect(res.body.coupon.milestoneOrderNumber).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Coupon application and discount calculation
// ---------------------------------------------------------------------------

describe('Coupon application', () => {
  it('applies the coupon discount and reflects it in the order', async () => {
    // Get an available coupon (generated in milestone tests above)
    const couponsRes = await agent.get('/api/admin/coupons').expect(200);
    const availableCoupon = couponsRes.body.coupons.find((c: { status: string }) => c.status === 'available');
    expect(availableCoupon).toBeDefined();

    const cart = await createCart(agent);
    await addItem(agent, cart.id, cheapProduct.id, 1);

    const res = await doCheckout(agent, cart.id, { couponCode: availableCoupon.code });
    expect(res.status).toBe(201);

    // discount = floor(priceCents * 10 / 100)
    const expectedDiscount = Math.floor((cheapProduct.priceCents * 10) / 100);
    expect(res.body.order.discountCents).toBe(expectedDiscount);
    expect(res.body.order.totalCents).toBe(cheapProduct.priceCents - expectedDiscount);
    expect(res.body.order.totalCents).toBeGreaterThan(0); // never negative
  });

  it('marks the coupon as redeemed after successful use', async () => {
    const couponsRes = await agent.get('/api/admin/coupons').expect(200);
    const redeemed = couponsRes.body.coupons.filter((c: { status: string }) => c.status === 'redeemed');
    expect(redeemed.length).toBeGreaterThan(0);
  });

  it('rejects a coupon that has already been redeemed', async () => {
    const couponsRes = await agent.get('/api/admin/coupons').expect(200);
    const redeemedCoupon = couponsRes.body.coupons.find((c: { status: string }) => c.status === 'redeemed');
    expect(redeemedCoupon).toBeDefined();

    const cart = await createCart(agent);
    await addItem(agent, cart.id, cheapProduct.id, 1);

    const res = await doCheckout(agent, cart.id, { couponCode: redeemedCoupon.code });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_ALREADY_REDEEMED');
  });

  it('rejects an unknown coupon code', async () => {
    const cart = await createCart(agent);
    await addItem(agent, cart.id, cheapProduct.id, 1);

    const res = await doCheckout(agent, cart.id, { couponCode: 'DOES-NOT-EXIST' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Coupon rollback safety — coupon must survive a failed checkout
// ---------------------------------------------------------------------------

describe('Coupon rollback safety', () => {
  it('coupon remains available when the checkout fails due to insufficient inventory', async () => {
    // We need a fresh available coupon. Get to 15 total orders to unlock the third milestone.
    // (10 placed in gating tests above, need 5 more)
    await placeNOrders(agent, 5, cheapProduct.id); // total = 15
    const coupon = await generateCoupon(agent); // milestone-15 coupon

    // Try to use it with a cart that requests more than inventory
    const inventoryNow = (await agent.get(`/api/products/${limitedProduct.id}`).expect(200)).body.product.inventory;
    const cart = await createCart(agent);
    await addItem(agent, cart.id, limitedProduct.id, inventoryNow + 10); // will fail

    const res = await doCheckout(agent, cart.id, { couponCode: coupon.code });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');

    // The coupon must still be 'available' — transaction rolled back
    const afterCoupons = await agent.get('/api/admin/coupons').expect(200);
    const couponAfter = afterCoupons.body.coupons.find((c: { id: string }) => c.id === coupon.id);
    expect(couponAfter.status).toBe('available');
  });
});

// ---------------------------------------------------------------------------
// Concurrent coupon redemption — two carts racing for the same coupon
// ---------------------------------------------------------------------------

describe('Concurrent coupon redemption (CRITICAL invariant)', () => {
  it('only one of two concurrent checkouts succeeds when they race for the same coupon', async () => {
    // Ensure we have a fresh available coupon
    const couponsRes = await agent.get('/api/admin/coupons').expect(200);
    let couponCode: string;

    const availableCoupons = couponsRes.body.coupons.filter((c: { status: string }) => c.status === 'available');
    if (availableCoupons.length === 0) {
      // Generate one if needed — place 5 more orders to get to next milestone
      const currentOrderCount = (await agent.get('/api/admin/report').expect(200)).body.report.totalOrders;
      const nextMilestone = (Math.floor(currentOrderCount / 5) + 1) * 5;
      await placeNOrders(agent, nextMilestone - currentOrderCount, cheapProduct.id);
      const newCoupon = await generateCoupon(agent);
      couponCode = newCoupon.code;
    } else {
      couponCode = availableCoupons[0].code;
    }

    // Prepare two independent carts
    const cartA = await createCart(agent);
    const cartB = await createCart(agent);
    await addItem(agent, cartA.id, cheapProduct.id, 1);
    await addItem(agent, cartB.id, cheapProduct.id, 1);

    // Fire both checkouts simultaneously — the race condition
    const [resA, resB] = await Promise.all([
      doCheckout(agent, cartA.id, { couponCode }),
      doCheckout(agent, cartB.id, { couponCode }),
    ]);

    const successes = [resA, resB].filter((r) => r.status === 201);
    const failures = [resA, resB].filter((r) => r.status === 422);

    // Exactly one must win the coupon
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].body.error.code).toBe('COUPON_ALREADY_REDEEMED');

    // Verify the coupon is redeemed exactly once in the DB
    const afterCoupons = await agent.get('/api/admin/coupons').expect(200);
    const thisCoupon = afterCoupons.body.coupons.find((c: { code: string }) => c.code === couponCode);
    expect(thisCoupon.status).toBe('redeemed');
  });
});
