const mongoose = require('mongoose');

const StatusHistoryItemSchema = new mongoose.Schema({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  changedBy: { type: String },
  note: { type: String },
});

const TransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
      index: true,
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Offer',
      required: true,
    },
    collectorId: { type: String, required: true, index: true },
    collectorName: { type: String },
    collectorPhone: { type: String },
    collectorEmail: { type: String },
    recyclerId: { type: String, required: true, index: true },
    recyclerName: { type: String },
    recyclerPhone: { type: String },
    recyclerEmail: { type: String },
    recyclerOrganization: { type: String },
    materialInfo: {
      categoryId: { type: String },
      categoryName: { type: String },
      subcategoryId: { type: String },
      subcategoryName: { type: String },
      weight: { type: Number, default: 0 },
      quantity: { type: Number, default: 1 },
      unit: { type: String, default: 'kg' },
      condition: { type: String },
    },
    agreedPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        'CREATED',
        'SCHEDULED',
        'HANDOVER_PENDING',
        'VERIFIED',
        'COMPLETED',
        'CANCELLED',
      ],
      default: 'CREATED',
      index: true,
    },
    statusHistory: [StatusHistoryItemSchema],
    handoverCode: { type: String, required: true, index: true },
    collectorConfirmed: { type: Boolean, default: false },
    collectorConfirmedAt: { type: Date },
    recyclerConfirmed: { type: Boolean, default: false },
    recyclerConfirmedAt: { type: Date },
    handoverVerified: { type: Boolean, default: false },
    handoverVerifiedAt: { type: Date },
    handoverLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
    },
    handoverEvidencePhoto: { type: String },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'UPI', 'BANK_TRANSFER'],
      default: 'UPI',
    },
    paymentPaidAt: { type: Date },
    scheduledPickupDate: { type: Date },
    pickupAddress: {
      address: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    isTest: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', TransactionSchema);
