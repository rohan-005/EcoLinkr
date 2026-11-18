const express = require('express');
const router = express.Router();

const {
  createListing,
  getListings,
  getListingById,
  getMyListings,
  updateListing,
  cancelListing,
} = require('../controllers/listingController');

const {
  submitOffer,
  getOffersForListing,
  getMyOffers,
  updateOffer,
  withdrawOffer,
  acceptOffer,
  rejectOffer,
} = require('../controllers/offerController');

const {
  getTransactions,
  getTransactionById,
  getHandoverQR,
  verifyHandover,
  updateTransactionStatus,
  completeTransaction,
  getFinancialHistory,
} = require('../controllers/transactionController');

// Listing routes
router.post('/listings', createListing);
router.get('/listings', getListings);
router.get('/listings/my', getMyListings);
router.get('/listings/:id', getListingById);
router.put('/listings/:id', updateListing);
router.delete('/listings/:id', cancelListing);

// Offer routes
router.post('/offers', submitOffer);
router.get('/offers/my', getMyOffers);
router.get('/offers/listing/:listingId', getOffersForListing);
router.put('/offers/:id', updateOffer);
router.post('/offers/:id/withdraw', withdrawOffer);
router.post('/offers/:id/accept', acceptOffer);
router.post('/offers/:id/reject', rejectOffer);

// Transaction & Handover routes
router.get('/transactions', getTransactions);
router.get('/transactions/:id', getTransactionById);
router.put('/transactions/:id/status', updateTransactionStatus);
router.get('/transactions/:transactionId/qr', getHandoverQR);
router.post('/transactions/:transactionId/verify', verifyHandover);
router.post('/transactions/:id/complete', completeTransaction);
router.get('/financials', getFinancialHistory);

module.exports = router;
