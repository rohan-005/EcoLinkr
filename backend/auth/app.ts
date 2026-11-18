import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'auth',
    status: 'running',
    port: Number(process.env.PORT || 3000),
    timestamp: new Date().toISOString(),
  });
});

// Mount auth routes directly and under /api/auth
app.use('/api/auth', authRoutes);
app.use('/', authRoutes);

// Centralized error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Auth Service Error]:', err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

export default app;
