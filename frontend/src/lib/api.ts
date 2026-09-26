const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? `Request failed (${res.status})`;
    const code = data?.error?.code ?? 'UNKNOWN';
    throw Object.assign(new Error(msg), { code, status: res.status });
  }
  return data;
}

// Products
export const api = {
  products: {
    list: () => request<{ products: Product[] }>('/products'),
  },
  carts: {
    create: () => request<{ cart: Cart }>('/carts', { method: 'POST' }),
    get: (id: string) => request<{ cart: Cart }>(`/carts/${id}`),
    addItem: (id: string, productId: string, quantity: number) =>
      request<{ cart: Cart }>(`/carts/${id}/items`, {
        method: 'POST',
        body: JSON.stringify({ productId, quantity }),
      }),
    updateItem: (cartId: string, productId: string, quantity: number) =>
      request<{ cart: Cart }>(`/carts/${cartId}/items/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity }),
      }),
    removeItem: (cartId: string, productId: string) =>
      fetch(`${BASE}/carts/${cartId}/items/${productId}`, { method: 'DELETE' }),
  },
  checkout: (cartId: string, idempotencyKey: string, couponCode?: string) =>
    request<{ order: Order }>('/checkout', {
      method: 'POST',
      body: JSON.stringify({ cartId, idempotencyKey, couponCode }),
    }),
  orders: {
    get: (id: string) => request<{ order: Order }>(`/orders/${id}`),
  },
  admin: {
    generateCoupon: () => request<{ coupon: Coupon }>('/admin/coupons/generate', { method: 'POST' }),
    listCoupons: () => request<{ coupons: Coupon[] }>('/admin/coupons'),
    report: () => request<{ report: Report }>('/admin/report'),
    listOrders: () => request<{ orders: Order[] }>('/admin/orders'),
  },
};

// Types
export interface Product {
  id: string;
  name: string;
  priceCents: number;
  inventory: number;
}

export interface CartItem {
  cartItemId: string;
  productId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  inventory: number;
}

export interface Cart {
  id: string;
  status: 'active' | 'checked_out';
  items: CartItem[];
  subtotalCents: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface Order {
  id: string;
  cartId: string;
  orderNumber: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  couponId: string | null;
  items: OrderItem[];
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountPercent: number;
  milestoneOrderNumber: number;
  status: 'available' | 'redeemed';
}

export interface Report {
  totalOrders: number;
  grossRevenueCents: number;
  totalDiscountsCents: number;
  netRevenueCents: number;
  productSales: { productId: string; productName: string; totalQuantitySold: number }[];
  coupons: { generated: number; available: number; redeemed: number };
}

export function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function uuid(): string {
  return crypto.randomUUID();
}
