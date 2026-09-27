/**
 * Admin report tests
 *
 * Verifies:
 *  - Fresh DB reports all zeros
 *  - Order totals and per-product quantities reconcile correctly
 *  - Discount amounts appear correctly when coupons are used
 *  - net = gross - discounts
 *  - Repeated report calls don't mutate state
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
let products: Awaited<ReturnType<typeof getProducts>>;

beforeAll(async () => {
  agent = await buildApp();
  products = await getProducts(agent);
});

afterAll(() => cleanupTestDb(dbPath));

describe('Admin report', () => {
  it('returns all-zero totals on a fresh database', async () => {
    const res = await agent.get('/api/admin/report').expect(200);
    const report = res.body.report;

    expect(report.totalOrders).toBe(0);
    expect(report.grossRevenueCents).toBe(0);
    expect(report.netRevenueCents).toBe(0);
    expect(report.totalDiscountsCents).toBe(0);
    expect(report.coupons.generated).toBe(0);
    expect(report.coupons.available).toBe(0);
    expect(report.coupons.redeemed).toBe(0);
    expect(report.productSales).toHaveLength(0);
  });

  it('reflects one order accurately — quantity, gross revenue, net revenue', async () => {
    const product = products.find((p) => p.inventory >= 50)!;
    const QTY = 3;
    const cart = await createCart(agent);
    await addItem(agent, cart.id, product.id, QTY);
    await doCheckout(agent, cart.id);

    const res = await agent.get('/api/admin/report').expect(200);
    const report = res.body.report;

    expect(report.totalOrders).toBe(1);
    expect(report.grossRevenueCents).toBe(product.priceCents * QTY);
    expect(report.netRevenueCents).toBe(product.priceCents * QTY);
    expect(report.totalDiscountsCents).toBe(0);

    const productSale = report.productSales.find((p: { productId: string }) => p.productId === product.id);
    expect(productSale).toBeDefined();
    expect(productSale.totalQuantitySold).toBe(QTY);
  });

  it('repeated report requests return the same result without mutating state', async () => {
    const first = await agent.get('/api/admin/report').expect(200);
    const second = await agent.get('/api/admin/report').expect(200);

    expect(second.body.report.totalOrders).toBe(first.body.report.totalOrders);
    expect(second.body.report.grossRevenueCents).toBe(first.body.report.grossRevenueCents);
    expect(second.body.report.coupons.generated).toBe(first.body.report.coupons.generated);
  });

  it('net revenue = gross - discounts when a coupon is applied', async () => {
    // We have 1 order placed above. Place 4 more to reach milestone-5.
    const cheapProduct = products.find((p) => p.inventory >= 20)!;
    await placeNOrders(agent, 4, cheapProduct.id); // total = 5

    const coupon = await generateCoupon(agent);

    const cart = await createCart(agent);
    await addItem(agent, cart.id, cheapProduct.id, 1);
    await doCheckout(agent, cart.id, { couponCode: coupon.code });

    const res = await agent.get('/api/admin/report').expect(200);
    const report = res.body.report;

    // The coupon should now appear as redeemed
    expect(report.coupons.generated).toBe(1);
    expect(report.coupons.redeemed).toBe(1);
    expect(report.coupons.available).toBe(0);

    // Discount must be > 0
    expect(report.totalDiscountsCents).toBeGreaterThan(0);

    // Core reconciliation: net = gross - discounts
    expect(report.netRevenueCents).toBe(report.grossRevenueCents - report.totalDiscountsCents);
  });

  it('tracks per-product quantities from multiple orders correctly', async () => {
    const productA = products.find((p) => p.inventory >= 50)!;
    const productB = products.filter((p) => p.inventory >= 50)[1] ?? products.find((p) => p.inventory >= 40)!;
    expect(productA).toBeDefined();
    expect(productB).toBeDefined();

    // Get baseline quantities already sold (from previous tests in this file)
    const baselineRes = await agent.get('/api/admin/report').expect(200);
    const baselineA = baselineRes.body.report.productSales.find((p: { productId: string }) => p.productId === productA.id)?.totalQuantitySold ?? 0;
    const baselineB = baselineRes.body.report.productSales.find((p: { productId: string }) => p.productId === productB.id)?.totalQuantitySold ?? 0;

    // Place 2 orders for productA (3 + 2 = 5 units additional)
    const cartA1 = await createCart(agent);
    await addItem(agent, cartA1.id, productA.id, 3);
    await doCheckout(agent, cartA1.id);

    const cartA2 = await createCart(agent);
    await addItem(agent, cartA2.id, productA.id, 2);
    await doCheckout(agent, cartA2.id);

    // One order for productB (4 units additional)
    const cartB = await createCart(agent);
    await addItem(agent, cartB.id, productB.id, 4);
    await doCheckout(agent, cartB.id);

    const res = await agent.get('/api/admin/report').expect(200);
    const report = res.body.report;

    const saleA = report.productSales.find((p: { productId: string }) => p.productId === productA.id);
    const saleB = report.productSales.find((p: { productId: string }) => p.productId === productB.id);

    expect(saleA).toBeDefined();
    expect(saleA.totalQuantitySold).toBe(baselineA + 5); // 3 + 2 added by this test

    expect(saleB).toBeDefined();
    expect(saleB.totalQuantitySold).toBe(baselineB + 4); // 4 added by this test
  });
});
