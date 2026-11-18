const express = require('express');
const router = express.Router();
const {
  seedEndpoint,
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  addSubcategory,
  getPricing,
  getPricingBySubcategoryId,
  updatePricing,
  calculateValuation,
} = require('../controllers/catalogController');

// Public catalog and pricing routes
router.get('/categories', getCategories);
router.get('/categories/:id', getCategoryById);
router.get('/pricing', getPricing);
router.get('/pricing/:subcategoryId', getPricingBySubcategoryId);
router.post('/valuation', calculateValuation);

// Admin and authorized routes (roles checked at gateway or header level)
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);
router.post('/categories/:id/subcategories', addSubcategory);
router.put('/pricing/:id', updatePricing);
router.post('/seed', seedEndpoint);

module.exports = router;
