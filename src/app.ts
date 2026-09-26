import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db, initDB } from './db/connection';
import { products, systemConfig, orderCounter } from './db/schema';
import { randomUUID } from 'crypto';
import path from 'path';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler must be registered after all routes
app.use(errorHandler);

const SEED_PRODUCTS = [
  { id: randomUUID(), name: 'Wireless Bluetooth Headphones', priceCents: 7999, inventory: 50 },
  { id: randomUUID(), name: 'USB-C Fast Charging Cable', priceCents: 1299, inventory: 200 },
  { id: randomUUID(), name: 'Mechanical Keyboard (Cherry MX)', priceCents: 14999, inventory: 25 },
  { id: randomUUID(), name: 'Limited Edition Smart Watch', priceCents: 29999, inventory: 3 },
  { id: randomUUID(), name: 'Portable SSD 1TB', priceCents: 8999, inventory: 40 },
  { id: randomUUID(), name: 'Noise Cancelling Earbuds', priceCents: 5999, inventory: 15 },
];

export async function bootstrap() {
  await initDB();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });

  const existing = await db.select().from(products).limit(1);
  if (existing.length === 0) {
    await db.insert(products).values(SEED_PRODUCTS);
    await db.insert(systemConfig).values([
      { key: 'coupon_order_interval', value: '5' },
      { key: 'coupon_discount_percent', value: '10' },
    ]);
    await db.insert(orderCounter).values([{ id: 1, count: 0 }]);
    console.log('Database seeded');
  }
}
