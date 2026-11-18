const mongoose = require('mongoose');

const HandoverSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    handoverId: { type: String, required: true, unique: true, index: true },
    handoverCode: { type: String, required: true },
    qrPayload: { type: String, required: true },
    collectorId: { type: String, required: true },
    recyclerId: { type: String, required: true },
    collectorConfirmed: { type: Boolean, default: false },
    collectorConfirmedAt: { type: Date },
    recyclerConfirmed: { type: Boolean, default: false },
    recyclerConfirmedAt: { type: Date },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    verificationTimestamp: { type: Date },
    gpsCoordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
      accuracy: { type: Number },
    },
    photoEvidence: [{ type: String }],
    notes: { type: String },
    isTest: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Handover', HandoverSchema);
