import { db } from '../db/connection';
import { orders, orderItems } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../errors/AppError';

export async function getOrderById(orderId: string) {
  const orderRows = await db.select().from(orders).where(eq(orders.id, orderId));
  if (orderRows.length === 0) {
    throw new AppError(404, 'ORDER_NOT_FOUND', `Order ${orderId} not found`);
  }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { ...orderRows[0], items };
}

export async function listOrders() {
  return db.select().from(orders).orderBy(orders.orderNumber);
}
