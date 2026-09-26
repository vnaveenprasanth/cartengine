import { randomUUID } from 'crypto';
import { db } from '../db/connection';
import { carts, cartItems, products } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../errors/AppError';
import type { AddCartItemInput, UpdateCartItemInput } from '../schemas/cart.schemas';

export async function createCart() {
  const id = randomUUID();
  await db.insert(carts).values({ id });
  return { id, status: 'active', items: [], subtotalCents: 0 };
}

export async function getCart(cartId: string) {
  const cartRows = await db.select().from(carts).where(eq(carts.id, cartId));
  if (cartRows.length === 0) {
    throw new AppError(404, 'CART_NOT_FOUND', `Cart ${cartId} not found`);
  }
  const cart = cartRows[0];
  const items = await getCartItemsWithProducts(cartId);
  const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  return { ...cart, items, subtotalCents };
}

export async function addItem(cartId: string, input: AddCartItemInput) {
  const cart = await getCartOrThrow(cartId);
  assertCartActive(cart, cartId);

  const productRows = await db.select().from(products).where(eq(products.id, input.productId));
  if (productRows.length === 0) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product ${input.productId} not found`);
  }

  // Check if product already in cart — update quantity instead of inserting duplicate
  const existing = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, input.productId)));

  if (existing.length > 0) {
    const newQty = existing[0].quantity + input.quantity;
    await db
      .update(cartItems)
      .set({ quantity: newQty })
      .where(eq(cartItems.id, existing[0].id));
  } else {
    await db.insert(cartItems).values({
      id: randomUUID(),
      cartId,
      productId: input.productId,
      quantity: input.quantity,
    });
  }

  return getCart(cartId);
}

export async function updateItem(cartId: string, productId: string, input: UpdateCartItemInput) {
  const cart = await getCartOrThrow(cartId);
  assertCartActive(cart, cartId);

  const existing = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));

  if (existing.length === 0) {
    throw new AppError(404, 'CART_ITEM_NOT_FOUND', `Product ${productId} not in cart`);
  }

  await db
    .update(cartItems)
    .set({ quantity: input.quantity })
    .where(eq(cartItems.id, existing[0].id));

  return getCart(cartId);
}

export async function removeItem(cartId: string, productId: string) {
  const cart = await getCartOrThrow(cartId);
  assertCartActive(cart, cartId);

  const existing = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));

  if (existing.length === 0) {
    throw new AppError(404, 'CART_ITEM_NOT_FOUND', `Product ${productId} not in cart`);
  }

  await db.delete(cartItems).where(eq(cartItems.id, existing[0].id));
}

// --- helpers ---

async function getCartOrThrow(cartId: string) {
  const rows = await db.select().from(carts).where(eq(carts.id, cartId));
  if (rows.length === 0) throw new AppError(404, 'CART_NOT_FOUND', `Cart ${cartId} not found`);
  return rows[0];
}

function assertCartActive(cart: { status: string }, cartId: string) {
  if (cart.status !== 'active') {
    throw new AppError(409, 'CART_ALREADY_CHECKED_OUT', `Cart ${cartId} has already been checked out`);
  }
}

async function getCartItemsWithProducts(cartId: string) {
  const rows = await db
    .select({
      cartItemId: cartItems.id,
      productId: products.id,
      productName: products.name,
      unitPriceCents: products.priceCents,
      quantity: cartItems.quantity,
      inventory: products.inventory,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.cartId, cartId));

  return rows.map((r) => ({
    ...r,
    lineTotalCents: r.unitPriceCents * r.quantity,
  }));
}
