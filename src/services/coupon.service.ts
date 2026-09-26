import { randomUUID } from 'crypto';
import { db } from '../db/connection';
import { coupons, systemConfig, orderCounter } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../errors/AppError';

export async function generateCoupon() {
  const configRows = await db.select().from(systemConfig);
  const config = Object.fromEntries(configRows.map((r) => [r.key, r.value]));
  const interval = parseInt(config['coupon_order_interval'] ?? '5', 10);
  const discountPercent = parseInt(config['coupon_discount_percent'] ?? '10', 10);

  const counterRows = await db.select().from(orderCounter).where(eq(orderCounter.id, 1));
  const totalOrders = counterRows[0]?.count ?? 0;

  if (totalOrders < interval) {
    throw new AppError(
      409,
      'COUPON_MILESTONE_NOT_REACHED',
      `No milestone reached yet. Need ${interval} orders, currently at ${totalOrders}.`,
    );
  }

  // The eligible milestone is the highest multiple of interval not exceeding totalOrders
  const milestoneOrderNumber = Math.floor(totalOrders / interval) * interval;

  const code = `REWARD-${milestoneOrderNumber}-${randomUUID().slice(0, 6).toUpperCase()}`;

  try {
    await db.insert(coupons).values({
      id: randomUUID(),
      code,
      discountPercent,
      milestoneOrderNumber,
      status: 'available',
    });
  } catch {
    // UNIQUE constraint on milestoneOrderNumber — coupon already generated for this milestone
    throw new AppError(
      409,
      'COUPON_ALREADY_GENERATED',
      `A coupon has already been generated for the milestone at order ${milestoneOrderNumber}.`,
    );
  }

  const rows = await db.select().from(coupons).where(eq(coupons.code, code));
  return rows[0];
}

export async function listCoupons() {
  return db.select().from(coupons).orderBy(coupons.milestoneOrderNumber);
}

// Called inside the checkout transaction to atomically mark a coupon as redeemed
export async function redeemCouponInTransaction(
  // Accept any object that has the Drizzle query builder methods (db or tx)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  code: string,
  orderId: string,
): Promise<{ discountPercent: number; couponId: string }> {
  const rows = await tx.select().from(coupons).where(eq(coupons.code, code));

  if (rows.length === 0) {
    throw new AppError(422, 'COUPON_NOT_FOUND', `Coupon "${code}" does not exist`);
  }

  const coupon = rows[0];
  if (coupon.status !== 'available') {
    throw new AppError(422, 'COUPON_ALREADY_REDEEMED', `Coupon "${code}" has already been redeemed`);
  }

  // Atomic status update: only succeeds if coupon is still 'available'.
  // If two concurrent checkouts try to use the same coupon, only one UPDATE will match.
  const redemption = await tx
    .update(coupons)
    .set({ status: 'redeemed', redeemedByOrderId: orderId })
    .where(and(eq(coupons.code, code), eq(coupons.status, 'available')));

  if (redemption.rowsAffected === 0) {
    throw new AppError(422, 'COUPON_ALREADY_REDEEMED', `Coupon "${code}" has already been redeemed`);
  }

  return { discountPercent: coupon.discountPercent, couponId: coupon.id };
}
