import { app } from './app';

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`CartEngine API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
