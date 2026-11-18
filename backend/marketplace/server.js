const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const marketplaceRoutes = require('./routes/marketplaceRoutes');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 7000);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ecolinkr_marketplace';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({
    service: 'marketplace',
    status: 'running',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/marketplace', marketplaceRoutes);
app.use('/', marketplaceRoutes);

// Centralized error handler
app.use((err, _req, res, _next) => {
  console.error('[Marketplace Service Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`Marketplace service connected to MongoDB at ${MONGODB_URI}`);

    app.listen(PORT, () => {
      console.log(`Marketplace service is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start Marketplace service:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = app;
