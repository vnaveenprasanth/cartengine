import { z } from 'zod';

export const CheckoutSchema = z.object({
  cartId: z.string().uuid('cartId must be a valid UUID'),
  idempotencyKey: z.string().uuid('idempotencyKey must be a valid UUID'),
  couponCode: z.string().optional(),
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;
