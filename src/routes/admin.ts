import { Router } from 'express';
import { generateCoupon, listCoupons } from '../services/coupon.service';
import { getReport } from '../services/admin.service';
import { listOrders } from '../services/order.service';

export const adminRouter = Router();

adminRouter.post('/coupons/generate', async (_req, res) => {
  const coupon = await generateCoupon();
  res.status(201).json({ coupon });
});

adminRouter.get('/coupons', async (_req, res) => {
  const couponList = await listCoupons();
  res.json({ coupons: couponList });
});

adminRouter.get('/report', async (_req, res) => {
  const report = await getReport();
  res.json({ report });
});

adminRouter.get('/orders', async (_req, res) => {
  const orderList = await listOrders();
  res.json({ orders: orderList });
});
