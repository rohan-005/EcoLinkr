const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const catalogRoutes = require('./routes/catalogRoutes');
const { seedCatalog } = require('./controllers/catalogController');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 6000);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ecolinkr_catalog';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({
    service: 'catalog',
    status: 'running',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/catalog', catalogRoutes);
app.use('/', catalogRoutes);

// Centralized error handler
app.use((err, _req, res, _next) => {
  console.error('[Catalog Service Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`Catalog service connected to MongoDB at ${MONGODB_URI}`);

    // Auto seed on boot if collection is empty
    const seedResult = await seedCatalog(false);
    console.log('Catalog seed status:', seedResult.message);

    app.listen(PORT, () => {
      console.log(`Catalog service is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start Catalog service:', err);
    process.exit(1);
  }
}

// Export app for testing
if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = app;
