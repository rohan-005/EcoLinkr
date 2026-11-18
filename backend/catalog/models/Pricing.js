const mongoose = require('mongoose');

const LocationRateSchema = new mongoose.Schema({
  city: { type: String, required: true, trim: true },
  state: { type: String, trim: true },
  pricePerUnit: { type: Number, required: true },
});

const RecyclerRateSchema = new mongoose.Schema({
  recyclerId: { type: String, required: true },
  recyclerName: { type: String, required: true },
  pricePerUnit: { type: Number, required: true },
  effectiveDate: { type: Date, default: Date.now },
});

const PriceHistorySchema = new mongoose.Schema({
  pricePerUnit: { type: Number, required: true },
  effectiveDate: { type: Date, default: Date.now },
  changedBy: { type: String },
  note: { type: String },
});

const PricingSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    subcategoryId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    materialName: { type: String, required: true, trim: true },
    categoryName: { type: String, required: true, trim: true },
    unit: { type: String, enum: ['kg', 'unit', 'piece'], default: 'kg' },
    basePricePerUnit: { type: Number, required: true, min: 0 },
    minPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    locationRates: [LocationRateSchema],
    recyclerRates: [RecyclerRateSchema],
    priceHistory: [PriceHistorySchema],
    isSeed: { type: Boolean, default: false, index: true },
    isTest: { type: Boolean, default: false, index: true },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pricing', PricingSchema);
