const mongoose = require('mongoose');

const ListingSchema = new mongoose.Schema(
  {
    collectorId: { type: String, required: true, index: true },
    collectorName: { type: String },
    collectorPhone: { type: String },
    collectorEmail: { type: String },
    title: { type: String, required: true, trim: true },
    categoryId: { type: String, required: true, index: true },
    categoryName: { type: String, required: true },
    subcategoryId: { type: String },
    subcategoryName: { type: String },
    weight: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    unit: { type: String, enum: ['kg', 'unit', 'piece'], default: 'kg' },
    condition: {
      type: String,
      enum: ['Working', 'Non-Working', 'Mixed', 'Scrap', 'Fair', 'Poor'],
      default: 'Scrap',
    },
    description: { type: String, trim: true },
    photos: [{ type: String }],
    pickupLocation: {
      address: { type: String, required: true },
      city: { type: String, required: true, index: true },
      state: { type: String, required: true },
      pincode: { type: String },
      coordinates: {
        latitude: { type: Number },
        longitude: { type: Number },
      },
    },
    estimatedValue: { type: Number, default: 0 },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING',
        'ACTIVE',
        'OFFER_RECEIVED',
        'ACCEPTED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ],
      default: 'ACTIVE',
      index: true,
    },
    offersCount: { type: Number, default: 0 },
    acceptedOfferId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
    acceptedTransactionId: { type: String },
    isSeed: { type: Boolean, default: false, index: true },
    isTest: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Listing', ListingSchema);
