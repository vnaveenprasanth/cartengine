import { Router } from 'express';
import { validate } from '../middleware/validate';
import { CheckoutSchema } from '../schemas/checkout.schemas';
import { checkout } from '../services/checkout.service';

export const checkoutRouter = Router();

checkoutRouter.post('/', validate(CheckoutSchema), async (req, res) => {
  const { order, isRetry } = await checkout(req.body);
  // 200 on retry: same idempotency key, returning cached result
  // 201 on first success: new order created
  res.status(isRetry ? 200 : 201).json({ order });
});
