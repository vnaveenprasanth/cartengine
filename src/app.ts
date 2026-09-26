import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { initDB } from './db/connection';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export async function bootstrap() {
  await initDB();
}
