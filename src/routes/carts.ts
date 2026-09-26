import { Router, Request } from 'express';
import { validate } from '../middleware/validate';
import { AddCartItemSchema, UpdateCartItemSchema } from '../schemas/cart.schemas';
import {
  createCart,
  getCart,
  addItem,
  updateItem,
  removeItem,
} from '../services/cart.service';

export const cartsRouter = Router();

cartsRouter.post('/', async (_req, res) => {
  const cart = await createCart();
  res.status(201).json({ cart });
});

cartsRouter.get('/:cartId', async (req: Request<{ cartId: string }>, res) => {
  const cart = await getCart(req.params.cartId);
  res.json({ cart });
});

cartsRouter.post(
  '/:cartId/items',
  validate(AddCartItemSchema),
  async (req: Request<{ cartId: string }>, res) => {
    const cart = await addItem(req.params.cartId, req.body);
    res.status(201).json({ cart });
  },
);

cartsRouter.put(
  '/:cartId/items/:productId',
  validate(UpdateCartItemSchema),
  async (req: Request<{ cartId: string; productId: string }>, res) => {
    const cart = await updateItem(req.params.cartId, req.params.productId, req.body);
    res.json({ cart });
  },
);

cartsRouter.delete(
  '/:cartId/items/:productId',
  async (req: Request<{ cartId: string; productId: string }>, res) => {
    await removeItem(req.params.cartId, req.params.productId);
    res.status(204).send();
  },
);
