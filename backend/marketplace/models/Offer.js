const mongoose = require('mongoose');

const OfferSchema = new mongoose.Schema(
  {
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
    collectorId: { type: String, required: true, index: true },
    recyclerId: { type: String, required: true, index: true },
    recyclerName: { type: String, required: true },
    recyclerPhone: { type: String },
    recyclerEmail: { type: String },
    recyclerOrganization: { type: String },
    offeredPrice: { type: Number, required: true, min: 1 },
    proposedPickupDate: { type: Date },
    notes: { type: String, trim: true },
    status: {
      type: String,
      enum: ['SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
      default: 'SUBMITTED',
      index: true,
    },
    isTest: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Offer', OfferSchema);
