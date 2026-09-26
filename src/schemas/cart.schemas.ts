import { z } from 'zod';

export const AddCartItemSchema = z.object({
  productId: z.string().uuid('productId must be a valid UUID'),
  quantity: z.number().int().positive('quantity must be a positive integer'),
});

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().positive('quantity must be a positive integer'),
});

export type AddCartItemInput = z.infer<typeof AddCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>;
