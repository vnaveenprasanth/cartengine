import { Router, Request } from 'express';
import { listProducts, getProductById } from '../services/product.service';

export const productsRouter = Router();

productsRouter.get('/', async (_req, res) => {
  const items = await listProducts();
  res.json({ products: items });
});

productsRouter.get('/:id', async (req: Request<{ id: string }>, res) => {
  const product = await getProductById(req.params.id);
  res.json({ product });
});
