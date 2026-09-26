// All amounts in integer cents: no floating-point arithmetic anywhere in this module

export function calculateSubtotal(items: Array<{ unitPriceCents: number; quantity: number }>): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

export function calculateDiscount(subtotalCents: number, discountPercent: number): number {
  // Integer floor division: $10.99 at 10% = 109.9 cents → 109 cents discount
  return Math.floor((subtotalCents * discountPercent) / 100);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
