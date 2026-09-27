import { randomUUID } from 'crypto';
import { db, initDB } from './connection';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { products, systemConfig } from './schema';
import { eq } from 'drizzle-orm';
import path from 'path';

const SEED_PRODUCTS = [
  { id: randomUUID(), name: 'Wireless Bluetooth Headphones', priceCents: 7999, inventory: 50 },
  { id: randomUUID(), name: 'USB-C Fast Charging Cable', priceCents: 1299, inventory: 200 },
  { id: randomUUID(), name: 'Mechanical Keyboard (Cherry MX)', priceCents: 14999, inventory: 25 },
  // Limited inventory — used to verify oversell prevention
  { id: randomUUID(), name: 'Limited Edition Smart Watch', priceCents: 29999, inventory: 3 },
  { id: randomUUID(), name: 'Portable SSD 1TB', priceCents: 8999, inventory: 40 },
  { id: randomUUID(), name: 'Noise Cancelling Earbuds', priceCents: 5999, inventory: 15 },
];

async function seed() {
  await initDB();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });

  const existing = await db.select().from(products).limit(1);
  if (existing.length > 0) {
    console.log('Seed data already present, skipping');
    return;
  }

  await db.insert(products).values(SEED_PRODUCTS);

  await db.insert(systemConfig).values([
    { key: 'coupon_order_interval', value: '5' },
    { key: 'coupon_discount_percent', value: '10' },
  ]);

  console.log(`Seeded ${SEED_PRODUCTS.length} products`);
  console.log('System config: every 5th order generates a 10% coupon');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
