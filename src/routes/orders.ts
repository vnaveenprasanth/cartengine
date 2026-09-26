import { Router, Request } from 'express';
import { getOrderById, listOrders } from '../services/order.service';

export const ordersRouter = Router();

ordersRouter.get('/', async (_req, res) => {
  const orderList = await listOrders();
  res.json({ orders: orderList });
});

ordersRouter.get('/:orderId', async (req: Request<{ orderId: string }>, res) => {
  const order = await getOrderById(req.params.orderId);
  res.json({ order });
});
