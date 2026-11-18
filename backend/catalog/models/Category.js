const mongoose = require('mongoose');

const SubcategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, trim: true },
  description: { type: String },
  unit: { type: String, enum: ['kg', 'unit', 'piece'], default: 'kg' },
  basePricePerUnit: { type: Number, required: true, default: 0 },
  minPrice: { type: Number, default: 0 },
  maxPrice: { type: Number, default: 0 },
  hazardLevel: { type: String, enum: ['Low', 'Medium', 'High', 'Toxic'], default: 'Low' },
  recyclingInstructions: { type: String },
  safetyInfo: { type: String },
  isActive: { type: Boolean, default: true },
});

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String },
    image: { type: String },
    hazardClassification: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Toxic'],
      default: 'Low',
    },
    recyclingInstructions: { type: String },
    safetyInformation: { type: String },
    acceptedMaterialTypes: [{ type: String }],
    subcategories: [SubcategorySchema],
    isActive: { type: Boolean, default: true, index: true },
    isSeed: { type: Boolean, default: false, index: true },
    isTest: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', CategorySchema);
