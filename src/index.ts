import { app, bootstrap } from './app';

const PORT = process.env.PORT ?? 3000;

bootstrap()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CartEngine API running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
