# DECISIONS.md — Checkout & Rewards Service

## System Invariants

These are the properties the system must never violate, regardless of retries, concurrent requests, or partial failures.
 
1. **Inventory can never go negative.** A product's `inventory` column must always reflect the true available stock. Selling two concurrent carts that each want the last unit must result in exactly one success.

2. **A cart can only be checked out once.** Once an order is placed against a cart, that cart is permanently in the `checked_out` state. No retry or race condition should produce a second order for the same cart.

3. **An idempotency key maps to exactly one order.** If a client submits a checkout with a key that already produced an order, the same order is returned — not a second one created.

4. **A coupon can be redeemed exactly once.** Two concurrent checkouts that both supply the same coupon code must result in exactly one redemption.

5. **A coupon that is consumed by a failed checkout must be returned to `available`.** If inventory runs out after coupon redemption begins inside a transaction, the whole transaction rolls back and the coupon is untouched.

6. **Order records are immutable snapshots.** The price and product name stored in `order_items` reflect what the customer paid at the moment of checkout. Subsequent price changes to the `products` table must not alter historical orders.

7. **Strictly non-negative order totals.** A discount applied to an order must never exceed the subtotal. The final calculated total (subtotal minus discount) is mathematically bounded at zero or greater.

8. **Report reads are non-mutating.** Calling `GET /api/admin/report` any number of times must return consistent results without changing any state.

---

## Ambiguities Found and Resolutions

**What happens if a product's price changes after it's added to a cart but before checkout?**
The requirement didn't specify. I chose to apply the *current price at checkout time*. This is the commercially standard behaviour (prices are live, not locked when you add to cart). An alternative would be to snapshot the price at add-to-cart time, but that requires a significant extra column on `cart_items`. The chosen approach means the customer always pays the current live price. A known trade-off here is that if a price changes while the customer is idling on the checkout page (without refreshing), they could be charged a different amount than what their stale frontend displayed. In a fully-featured production system, this trade-off is typically solved by introducing an intermediate "Checkout Session" that temporarily locks the price for 10-15 minutes while the customer enters payment details (similar to Flipkart/Amazon). Given the timebox and scope, implementing a session state machine was deferred.

**Who triggers coupon generation — is it automatic or manual?**
The spec says "an administrator *can* request coupon generation." I kept it as a deliberate admin action. The milestone check tells the admin whether they're allowed to generate one right now. Auto-generating inside the checkout transaction would couple two concerns and add latency to the checkout hot path.

**Can any client use any coupon code, or is it user-scoped?**
The spec doesn't attach coupons to users (there's no user model). I treated coupons as global codes, any client that knows the code can use it. Single-use enforcement is the meaningful constraint.

**What is the minimum order total with a discount applied?**
Zero. A percentage discount is always less than 100%, and `Math.floor` keeps it in integer cents. The total is `subtotalCents - discountCents`, which cannot be negative. A `Math.max(0, ...)` guard is included as a safety measure.

---

## Material Design Decisions

### Decision 1: Cart stores intent, not price snapshots

**Context:** When a customer adds a product to a cart, should we record the price at that moment, or just the product reference and resolve price dynamically at checkout?

**Options considered:**
- *Snapshot price at add-to-cart:* Store `unitPriceCents` on `cart_items`. Customer is guaranteed the price they saw when they added it.
- *Checkout Session Price Lock:* An intermediate step where clicking "Proceed to Checkout" generates a temporary session that locks the price for 15 or so minutes.
- *Live pricing at checkout (chosen):* Cart only stores `productId + quantity`. Prices are read fresh from `products` at checkout time.

**Choice:** Live pricing at checkout.

**Why:** Snapshotting cart prices adds a column to `cart_items`, requires a migration path for "refreshing" prices, and creates confusing UX when a user browses with an old cart and sees a price that differs from the site. Most real ecommerce platforms use live pricing — the price you see in your cart is the current price. While the *Checkout Session Price Lock* is the most robust production solution, it introduces significant complexity (session TTLs, state machines, cron jobs for expiration) that exceeded the timebox. Live pricing provides a transparent and simple baseline.

**Consequences:** Easier to implement and maintain. A price cut benefits the customer mid-cart automatically. A price rise is charged at the new rate. As noted earlier, the trade-off here is that if a price changes while the customer is idling on the checkout page without refreshing, they could be charged a different amount than what their stale frontend displayed. A future iteration should solve this by implementing the Checkout Session Price Lock.

---

### Decision 2: Checkout idempotency via client-supplied UUID key on the orders table

**Context:** Clients may retry a checkout request after a timeout. Retries must not create duplicate orders, double-charge inventory, or double-consume coupons.

**Options considered:**
- *Dedicated idempotency table:* A separate `idempotency_keys` table that stores `(key → serialised response)`. Lock the key row before processing, write the result after. Standard pattern for payment APIs like Stripe.
- *`idempotency_key` column on `orders` (chosen):* Store the key directly on the `orders` row with a UNIQUE constraint. The checkout handler queries for an existing order with that key first — if found, return it immediately.

**Choice:** Key column on `orders`.

**Why:** A dedicated idempotency table is the "correct" production answer but adds meaningful complexity (a second write path, TTL management, locking semantics for in-flight duplicate requests). For this timebox, the `orders.idempotency_key UNIQUE` column achieves the same safety guarantee with far less code: it is physically impossible to insert two orders with the same key. The pre-check handles the normal retry path efficiently. The UNIQUE constraint is the actual hard stop for any race condition.

**Consequences:** Simpler implementation. The gap is that two genuinely simultaneous first-time requests with the same key could both pass the pre-check and race to insert — the second INSERT will fail on the UNIQUE constraint and return a database error rather than a clean 200. With client-generated UUIDs as idempotency keys, the probability of this is negligible. Worth noting: idempotency keys only protect **automated retries** where the client reuses the same key. If a user manually refreshes their browser, the frontend generates a fresh UUID — making the old key stale. In that case, the `CART_ALREADY_CHECKED_OUT` status check is what prevents a double order, not the idempotency key. The two mechanisms complement each other.

---

### Decision 3: No order-count tracking table — derive milestone from COUNT(orders)

**Context:** To know when a coupon milestone is reached, the system needs to know how many orders have been placed. The AI initially suggested a dedicated `order_counter` table that would be incremented inside every checkout transaction.

**Options considered:**
- *Dedicated counter table (AI suggestion, rejected):* A `counters` table with a single row holding `total_orders`. Increment inside the checkout transaction. Fast to read, always current.
- *`COUNT(orders)` at generation time (chosen):* When an admin requests coupon generation, run `SELECT COUNT(*) FROM orders`. This is the current total at that moment.

**Choice:** Derive from `COUNT(orders)`.

**Why:** I pushed back on the counter table. The bottleneck concern is real — every checkout acquiring a write lock on a single counter row serialises all checkouts globally through that row. That's a throughput ceiling that grows more painful over time. `COUNT(orders)` is fast for the scale we're at, and coupon generation is a rare admin action — not a hot path. The correctness gap (count and insert aren't atomic) is fully covered by the UNIQUE constraint on `milestoneOrderNumber`.

**Consequences:** Removes a serialisation bottleneck from the checkout path. The UNIQUE constraint on `coupons.milestone_order_number` handles any race between two admins clicking Generate simultaneously.

---

### Decision 4: Single database transaction for the entire checkout sequence

**Context:** Checkout involves several sequential operations: lock the cart, check/deduct inventory per item, optionally redeem a coupon, create the order and snapshot line items. These must all succeed together or all fail together.

**Options considered:**
- *Optimistic locking with compensating transactions:* Attempt each step; if one fails, manually undo the previous ones. Extremely error-prone — every failure path needs a corresponding rollback path.
- *Single database transaction (chosen):* Wrap all mutations in `db.transaction(async tx => {...})`.

**Choice:** Single transaction.

**Why:** For a monolith backed by a single relational database, an ACID transaction is the most robust choice. While distributed microservice architectures often rely on patterns with compensating transactions (where partial states exist temporarily), building that manually in a monolith introduces unnecessary complexity and failure modes. SQLite's ACID guarantees mean either everything commits or nothing does. A coupon `UPDATE` inside the same transaction means a checkout that fails on inventory automatically returns the coupon to `available` without requiring custom rollback logic.

**Consequences:** This is the core correctness guarantee of the system. It makes the failure behaviour simple to reason about: a 422 or 409 response means the database is in exactly the state it was before the request arrived.

---

### Decision 5: Coupon race condition handled by UNIQUE constraint, not application-level lock

**Context:** Two concurrent admin requests to generate a coupon for the same milestone. The application-level check (count orders → count coupons → compare) is not atomic with the subsequent insert.

**Options considered:**
- *In-memory application mutex:* Utilizing a programmatic lock (e.g., a JavaScript `Map`) to track in-flight requests. While simple, this approach inherently fails in horizontally scaled environments where multiple service instances do not share memory.
- *Pessimistic database locking:* Acquiring an exclusive row-level lock via `SELECT ... FOR UPDATE` during the transaction. While a standard pattern in systems like PostgreSQL, SQLite does not support this syntax natively.
- *UNIQUE constraint on `milestoneOrderNumber` (chosen):* If a race occurs, the second INSERT violates the constraint and is rejected by the database.

**Choice:** UNIQUE constraint as the race condition guard.

**Why:** Database constraints are more reliable than application-level coordination, particularly once you have more than one process. The race window between the eligibility check and the insert is small, and the UNIQUE constraint is an absolute guarantee that the database enforces rather than something we have to remember to check in every code path. The constraint violation is caught and translated into a clear `409 COUPON_ALREADY_GENERATED` response.

**Consequences:** Concurrent coupon generation is safe by construction for our system. The error surface is clear.

---

### Decision 6: Concurrent oversell prevention via conditional inventory UPDATE

**Context:** Two concurrent checkouts both wanting the last unit of a product. Reading inventory and then decrementing are two operations — naive implementations have a TOCTOU bug.

**Options considered:**
- *Application-level read-check-modify pattern:* Reading inventory into memory, evaluating the condition, and executing a subsequent `UPDATE`. This introduces a classic Time-of-Check to Time-of-Use vulnerability where concurrent transactions both read a valid state but proceed to write an invalid, negative inventory.
- *Pessimistic row-level locking:* Utilizing `SELECT ... FOR UPDATE` to exclusively lock the product row before evaluating inventory. While this is the standard concurrency control in RDBMS engines like PostgreSQL, SQLite does not support explicit row-level lock syntax (relying instead on transaction-level serialization).
- *Conditional UPDATE (chosen):* `UPDATE products SET inventory = inventory - ? WHERE id = ? AND inventory >= ?`. If inventory is insufficient, `rowsAffected` is 0.

**Choice:** Conditional UPDATE inside the checkout transaction.

**Why:** This is a single atomic statement. The WHERE clause ensures the decrement only applies if inventory is still sufficient at the exact moment the update runs. Two concurrent transactions race for the same row. SQLite serialises the writes, so only one can decrement successfully when inventory equals the requested quantity. The `rowsAffected` check immediately tells us if we lost the race.

**Consequences:** Inventory correctness is guaranteed by the database, not by application-level coordination. The losing checkout receives a clear 422 with `INSUFFICIENT_INVENTORY`. No negative inventory is possible.
