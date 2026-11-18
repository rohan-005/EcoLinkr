const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3000';
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://127.0.0.1:6000';
const MARKETPLACE_SERVICE_URL = process.env.MARKETPLACE_SERVICE_URL || 'http://127.0.0.1:7000';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'ecolinkr-super-secure-jwt-key-2026';

// Request timeout middleware
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
app.use((req, res, next) => {
  res.setTimeout(TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        error: 'Gateway Timeout: Downstream service took too long to respond',
      });
    }
  });
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[Gateway] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role'],
  })
);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_MAX || 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes',
  },
});
app.use(limiter);

// JWT verification & header injection helper
function extractUserFromToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Middleware: attach user to headers if valid token present
function attachUserHeaders(req, _res, next) {
  const user = extractUserFromToken(req);
  if (user) {
    req.user = user;
    req.headers['x-user-id'] = user.id || user._id;
    req.headers['x-user-email'] = user.email;
    req.headers['x-user-role'] = user.role;
    req.headers['x-user-verified'] = String(Boolean(user.isVerified));
  }
  next();
}

// Gateway RBAC Guard
function requireAuth(allowedRoles = []) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token required',
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Authentication token expired',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token',
      });
    }

    req.user = decoded;
    req.headers['x-user-id'] = decoded.id || decoded._id;
    req.headers['x-user-email'] = decoded.email;
    req.headers['x-user-role'] = decoded.role;
    req.headers['x-user-verified'] = String(Boolean(decoded.isVerified));

    if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Access requires one of [${allowedRoles.join(', ')}] role`,
      });
    }

    next();
  };
}

// Health check endpoint with downstream service status
app.get('/health', async (_req, res) => {
  const checkService = async (name, url) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        return { name, status: 'healthy', reachable: true };
      }
      return { name, status: 'degraded', reachable: true, statusCode: resp.status };
    } catch (err) {
      return { name, status: 'unreachable', reachable: false, error: err.message };
    }
  };

  const [authHealth, catalogHealth, marketplaceHealth, aiHealth] = await Promise.all([
    checkService('auth', AUTH_SERVICE_URL),
    checkService('catalog', CATALOG_SERVICE_URL),
    checkService('marketplace', MARKETPLACE_SERVICE_URL),
    checkService('ai', AI_SERVICE_URL),
  ]);

  const allHealthy = [authHealth, catalogHealth, marketplaceHealth, aiHealth].every(
    (s) => s.status === 'healthy'
  );

  res.status(allHealthy ? 200 : 207).json({
    service: 'gateway',
    status: allHealthy ? 'healthy' : 'partially_degraded',
    port: PORT,
    timestamp: new Date().toISOString(),
    services: {
      auth: authHealth,
      catalog: catalogHealth,
      marketplace: marketplaceHealth,
      ai: aiHealth,
    },
  });
});

// Proxy error handler
function handleProxyError(err, req, res) {
  console.error(`[Gateway Proxy Error] ${req.method} ${req.url}:`, err.message);
  if (!res.headersSent) {
    res.status(503).json({
      success: false,
      error: 'Downstream microservice is unavailable. Please try again later.',
      details: err.message,
    });
  }
}

// Create Proxy Middlewares
const authProxy = createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/api/auth' },
  onError: handleProxyError,
  onProxyReq: (proxyReq, req) => {
    if (req.user) {
      proxyReq.setHeader('x-user-id', req.user.id || req.user._id || '');
      proxyReq.setHeader('x-user-email', req.user.email || '');
      proxyReq.setHeader('x-user-role', req.user.role || '');
      proxyReq.setHeader('x-user-verified', String(Boolean(req.user.isVerified)));
    }
  },
});

const catalogProxy = createProxyMiddleware({
  target: CATALOG_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/catalog': '/api/catalog' },
  onError: handleProxyError,
  onProxyReq: (proxyReq, req) => {
    if (req.user) {
      proxyReq.setHeader('x-user-id', req.user.id || req.user._id || '');
      proxyReq.setHeader('x-user-email', req.user.email || '');
      proxyReq.setHeader('x-user-role', req.user.role || '');
    }
  },
});

const marketplaceProxy = createProxyMiddleware({
  target: MARKETPLACE_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/marketplace': '/api/marketplace' },
  onError: handleProxyError,
  onProxyReq: (proxyReq, req) => {
    if (req.user) {
      proxyReq.setHeader('x-user-id', req.user.id || req.user._id || '');
      proxyReq.setHeader('x-user-email', req.user.email || '');
      proxyReq.setHeader('x-user-role', req.user.role || '');
      proxyReq.setHeader('x-user-name', req.user.fullName || req.user.organizationName || '');
      proxyReq.setHeader('x-user-verified', String(Boolean(req.user.isVerified)));
    }
  },
});

const aiProxy = createProxyMiddleware({
  target: AI_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/ai': '/api/ai' },
  onError: handleProxyError,
});

// Route-level RBAC rules before forwarding:
// 1. Admin-only endpoints on auth service
app.use(['/api/auth/users', '/api/auth/recyclers'], requireAuth(['ADMIN']), authProxy);

// 2. Admin-only modification endpoints on catalog
app.post(['/api/catalog/categories', '/api/catalog/categories/*'], requireAuth(['ADMIN']), catalogProxy);
app.put(['/api/catalog/categories', '/api/catalog/categories/*'], requireAuth(['ADMIN']), catalogProxy);
app.delete(['/api/catalog/categories', '/api/catalog/categories/*'], requireAuth(['ADMIN']), catalogProxy);
app.post('/api/catalog/seed', requireAuth(['ADMIN']), catalogProxy);

// 3. Marketplace protections:
// Collector creates listing
app.post('/api/marketplace/listings', requireAuth(['COLLECTOR', 'ADMIN']), marketplaceProxy);
// Recycler submits offer (verified check also performed at service level)
app.post('/api/marketplace/offers', requireAuth(['RECYCLER', 'ADMIN']), marketplaceProxy);
// Offer acceptance / withdrawal
app.post('/api/marketplace/offers/:id/accept', requireAuth(['COLLECTOR', 'ADMIN']), marketplaceProxy);
app.post('/api/marketplace/offers/:id/reject', requireAuth(['COLLECTOR', 'ADMIN']), marketplaceProxy);
app.post('/api/marketplace/offers/:id/withdraw', requireAuth(['RECYCLER', 'ADMIN']), marketplaceProxy);
// Handover verification
app.post('/api/marketplace/transactions/:id/verify', requireAuth(['COLLECTOR', 'RECYCLER', 'ADMIN']), marketplaceProxy);

// General route mountings with user header attachment
app.use('/api/auth', attachUserHeaders, authProxy);
app.use('/api/catalog', attachUserHeaders, catalogProxy);
app.use('/api/marketplace', attachUserHeaders, marketplaceProxy);
app.use('/api/ai', attachUserHeaders, aiProxy);

// 404 for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handling Middleware
app.use((err, _req, res, _next) => {
  console.error('[Gateway Internal Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Gateway Error',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`API Gateway is running on port ${PORT}`);
    console.log(`  -> Auth:        ${AUTH_SERVICE_URL}`);
    console.log(`  -> Catalog:     ${CATALOG_SERVICE_URL}`);
    console.log(`  -> Marketplace: ${MARKETPLACE_SERVICE_URL}`);
    console.log(`  -> AI:          ${AI_SERVICE_URL}`);
  });
}

module.exports = app;
