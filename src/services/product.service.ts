import { db } from '../db/connection';
import { products } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../errors/AppError';

export async function listProducts() {
  return db.select().from(products).orderBy(products.name);
}

export async function getProductById(id: string) {
  const rows = await db.select().from(products).where(eq(products.id, id));
  if (rows.length === 0) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product ${id} not found`);
  }
  return rows[0];
}
