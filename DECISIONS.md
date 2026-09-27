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
The requirement didn't specify. I chose to apply the *current price at checkout time*. This is the commercially standard behaviour (prices are live, not locked when you add to cart). An alternative would be to snapshot the price at add-to-cart time, but that requires a significant extra column on `cart_items`. The chosen approach means the customer always pays the current live price. A known trade-off here is that if a price changes while the customer is idling on the checkout page (without refreshing), they could be charged a different amount than what their stale frontend displayed.

**Who triggers coupon generation — is it automatic or manual?**
The spec says "an administrator *can* request coupon generation." I kept it as a deliberate admin action. The milestone check tells the admin whether they're allowed to generate one right now. Auto-generating inside the checkout transaction would couple two concerns and add latency to the checkout hot path.

**Can any client use any coupon code, or is it user-scoped?**
The spec doesn't attach coupons to users (there's no user model). I treated coupons as global codes, any client that knows the code can use it. Single-use enforcement is the meaningful constraint.

**What is the minimum order total with a discount applied?**
Zero. A percentage discount is always less than 100%, and `Math.floor` keeps it in integer cents. The total is `subtotalCents - discountCents`, which cannot be negative. A `Math.max(0, ...)` guard is included as a safety measure.
