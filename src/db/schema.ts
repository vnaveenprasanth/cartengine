import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const products = sqliteTable('products', {
  id:         text('id').primaryKey(),
  name:       text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  inventory:  integer('inventory').notNull(),
  version:    integer('version').notNull().default(1),
  createdAt:  text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const carts = sqliteTable('carts', {
  id:        text('id').primaryKey(),
  // 'active' | 'checked_out'
  status:    text('status').notNull().default('active'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const cartItems = sqliteTable('cart_items', {
  id:        text('id').primaryKey(),
  cartId:    text('cart_id').notNull().references(() => carts.id),
  productId: text('product_id').notNull().references(() => products.id),
  quantity:  integer('quantity').notNull(),
}, (table) => ({
  uniqueCartProduct: uniqueIndex('cart_product_idx').on(table.cartId, table.productId),
}));

// Immutable snapshot of what was purchased and at what price
export const orders = sqliteTable('orders', {
  id:             text('id').primaryKey(),
  cartId:         text('cart_id').notNull().references(() => carts.id).unique(),
  idempotencyKey: text('idempotency_key').unique(),
  subtotalCents:  integer('subtotal_cents').notNull(),
  discountCents:  integer('discount_cents').notNull().default(0),
  totalCents:     integer('total_cents').notNull(),
  couponId:       text('coupon_id'),
  orderNumber:    integer('order_number').notNull(),
  createdAt:      text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Price snapshot per line item — reflects prices at time of checkout, not current prices
export const orderItems = sqliteTable('order_items', {
  id:             text('id').primaryKey(),
  orderId:        text('order_id').notNull().references(() => orders.id),
  productId:      text('product_id').notNull(),
  productName:    text('product_name').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  quantity:       integer('quantity').notNull(),
  lineTotalCents: integer('line_total_cents').notNull(),
});

export const coupons = sqliteTable('coupons', {
  id:                   text('id').primaryKey(),
  code:                 text('code').notNull().unique(),
  discountPercent:      integer('discount_percent').notNull(),
  // Which sequential order number triggered this coupon's eligibility
  milestoneOrderNumber: integer('milestone_order_number').notNull().unique(),
  // 'available' | 'redeemed'
  status:               text('status').notNull().default('available'),
  redeemedByOrderId:    text('redeemed_by_order_id'),
  createdAt:            text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Key-value store for system configuration (coupon interval, discount percent)
export const systemConfig = sqliteTable('system_config', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

// Monotonically increasing counter — source of truth for order numbering and coupon milestones
export const orderCounter = sqliteTable('order_counter', {
  id:    integer('id').primaryKey(),
  count: integer('count').notNull().default(0),
});
