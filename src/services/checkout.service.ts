import { randomUUID } from 'crypto';
import { db } from '../db/connection';
import { carts, cartItems, products, orders, orderItems, orderCounter } from '../db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { AppError } from '../errors/AppError';
import { calculateSubtotal, calculateDiscount } from '../utils/money';
import { redeemCouponInTransaction } from './coupon.service';
import type { CheckoutInput } from '../schemas/checkout.schemas';

export async function checkout(input: CheckoutInput) {
  // Return the existing order if this idempotency key was already processed.
  // This handles client retries without creating duplicate orders.
  const existing = await db
    .select()
    .from(orders)
    .where(eq(orders.idempotencyKey, input.idempotencyKey));

  if (existing.length > 0) {
    const existingItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, existing[0].id));
    return { order: { ...existing[0], items: existingItems }, isRetry: true };
  }

  // All mutations below run in a single transaction.
  // If any step throws, the entire transaction rolls back:
  // inventory is restored, coupon is unredeemed, cart stays active.
  const result = await db.transaction(async (tx) => {
    // Step 1: Atomically transition the cart from 'active' to 'checked_out'.
    // Conditional update ensures only one concurrent checkout can succeed for this cart.
    const cartLock = await tx
      .update(carts)
      .set({ status: 'checked_out' })
      .where(and(eq(carts.id, input.cartId), eq(carts.status, 'active')));

    if (cartLock.rowsAffected === 0) {
      const cartRows = await tx.select().from(carts).where(eq(carts.id, input.cartId));
      if (cartRows.length === 0) {
        throw new AppError(404, 'CART_NOT_FOUND', `Cart ${input.cartId} not found`);
      }
      throw new AppError(409, 'CART_ALREADY_CHECKED_OUT', `Cart ${input.cartId} has already been checked out`);
    }

    // Step 2: Load cart items joined with current product data
    const items = await tx
      .select({
        productId: products.id,
        productName: products.name,
        unitPriceCents: products.priceCents,
        quantity: cartItems.quantity,
        inventory: products.inventory,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.cartId, input.cartId));

    if (items.length === 0) {
      throw new AppError(422, 'EMPTY_CART', 'Cannot checkout an empty cart');
    }

    // Step 3: Atomically deduct inventory for each item.
    // The WHERE clause (inventory >= quantity) makes this safe under concurrency:
    // if two checkouts race for the last unit, only one UPDATE will match.
    for (const item of items) {
      const deduction = await tx
        .update(products)
        .set({ inventory: sql`${products.inventory} - ${item.quantity}` })
        .where(and(eq(products.id, item.productId), gte(products.inventory, item.quantity)));

      if (deduction.rowsAffected === 0) {
        throw new AppError(
          422,
          'INSUFFICIENT_INVENTORY',
          `Insufficient inventory for "${item.productName}" (requested ${item.quantity})`,
        );
      }
    }

    // Step 4: Redeem coupon atomically (if provided).
    // Runs inside the same transaction so a failed checkout never consumes the coupon.
    const orderId = randomUUID();
    const subtotalCents = calculateSubtotal(items);
    let discountCents = 0;
    let couponId: string | null = null;

    if (input.couponCode) {
      const coupon = await redeemCouponInTransaction(tx, input.couponCode, orderId);
      discountCents = calculateDiscount(subtotalCents, coupon.discountPercent);
      couponId = coupon.couponId;
    }

    const totalCents = subtotalCents - discountCents;

    // Step 5: Increment the global order counter and get the new order number
    await tx
      .update(orderCounter)
      .set({ count: sql`${orderCounter.count} + 1` })
      .where(eq(orderCounter.id, 1));

    const counterRows = await tx.select().from(orderCounter).where(eq(orderCounter.id, 1));
    const orderNumber = counterRows[0].count;

    // Step 6: Create the order and snapshot each line item with its price at this moment
    await tx.insert(orders).values({
      id: orderId,
      cartId: input.cartId,
      idempotencyKey: input.idempotencyKey,
      subtotalCents,
      discountCents,
      totalCents,
      couponId,
      orderNumber,
    });

    const lineItems = items.map((item) => ({
      id: randomUUID(),
      orderId,
      productId: item.productId,
      productName: item.productName,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      lineTotalCents: item.unitPriceCents * item.quantity,
    }));

    await tx.insert(orderItems).values(lineItems);

    return { id: orderId, cartId: input.cartId, idempotencyKey: input.idempotencyKey, subtotalCents, discountCents, totalCents, orderNumber, items: lineItems };
  });

  return { order: result, isRetry: false };
}
