import { db } from '../db/connection';
import { orders, orderItems, coupons, products } from '../db/schema';
import { eq, sum, count, sql } from 'drizzle-orm';

export async function getReport() {
  const orderRows = await db.select().from(orders);
  const totalOrders = orderRows.length;

  // Aggregate per-product quantities from order items (immutable snapshots)
  const productQuantities = await db
    .select({
      productId: orderItems.productId,
      productName: orderItems.productName,
      totalQuantity: sum(orderItems.quantity),
    })
    .from(orderItems)
    .groupBy(orderItems.productId, orderItems.productName);

  const grossRevenueCents = orderRows.reduce((sum, o) => sum + o.subtotalCents, 0);
  const totalDiscountsCents = orderRows.reduce((sum, o) => sum + o.discountCents, 0);
  const netRevenueCents = orderRows.reduce((sum, o) => sum + o.totalCents, 0);

  const couponRows = await db.select().from(coupons);
  const couponsGenerated = couponRows.length;
  const couponsAvailable = couponRows.filter((c) => c.status === 'available').length;
  const couponsRedeemed = couponRows.filter((c) => c.status === 'redeemed').length;

  return {
    totalOrders,
    productSales: productQuantities.map((p) => ({
      productId: p.productId,
      productName: p.productName,
      totalQuantitySold: Number(p.totalQuantity ?? 0),
    })),
    grossRevenueCents,
    totalDiscountsCents,
    netRevenueCents,
    coupons: {
      generated: couponsGenerated,
      available: couponsAvailable,
      redeemed: couponsRedeemed,
    },
  };
}
