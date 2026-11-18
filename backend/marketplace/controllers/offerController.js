const crypto = require('crypto');
const Offer = require('../models/Offer');
const Listing = require('../models/Listing');
const Transaction = require('../models/Transaction');
const Handover = require('../models/Handover');

exports.submitOffer = async (req, res) => {
  try {
    const { listingId, offeredPrice, proposedPickupDate, notes } = req.body;

    const recyclerId = req.headers['x-user-id'] || req.body.recyclerId;
    const recyclerRole = req.headers['x-user-role'] || req.body.recyclerRole;
    const isVerifiedHeader = req.headers['x-user-verified'];
    const isVerified = isVerifiedHeader === 'true' || req.body.isVerified === true;

    if (!recyclerId) {
      return res.status(401).json({ success: false, error: 'Recycler identity required' });
    }

    if (recyclerRole !== 'RECYCLER' && recyclerRole !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Only recyclers can submit offers' });
    }

    // Security check: Only verified recyclers can submit offers
    if (recyclerRole === 'RECYCLER' && !isVerified) {
      return res.status(403).json({
        success: false,
        error: 'Recycler account pending admin verification. Cannot submit offers.',
        code: 'RECYCLER_NOT_VERIFIED',
      });
    }

    if (!listingId || !offeredPrice || Number(offeredPrice) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Listing ID and a positive offered price are required',
      });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    if (!['ACTIVE', 'OFFER_RECEIVED'].includes(listing.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot submit offer on listing with status ${listing.status}`,
      });
    }

    // Check if recycler already has an active offer on this listing
    const existingOffer = await Offer.findOne({
      listingId: listing._id,
      recyclerId,
      status: 'SUBMITTED',
    });

    if (existingOffer) {
      return res.status(409).json({
        success: false,
        error: 'You already have an active offer on this listing. Please update your existing offer.',
        data: existingOffer,
      });
    }

    const recyclerName =
      req.headers['x-user-name'] ||
      req.headers['x-user-org'] ||
      req.body.recyclerName ||
      'Authorized Recycler';
    const recyclerPhone = req.headers['x-user-phone'] || req.body.recyclerPhone;
    const recyclerEmail = req.headers['x-user-email'] || req.body.recyclerEmail;
    const recyclerOrganization =
      req.headers['x-user-org'] || req.body.recyclerOrganization || recyclerName;

    const offer = new Offer({
      listingId: listing._id,
      collectorId: listing.collectorId,
      recyclerId,
      recyclerName,
      recyclerPhone,
      recyclerEmail,
      recyclerOrganization,
      offeredPrice: Number(offeredPrice),
      proposedPickupDate: proposedPickupDate ? new Date(proposedPickupDate) : undefined,
      notes,
      status: 'SUBMITTED',
      isTest: listing.isTest || Boolean(req.body.isTest),
    });

    await offer.save();

    // Update listing status & offersCount
    listing.offersCount += 1;
    if (listing.status === 'ACTIVE') {
      listing.status = 'OFFER_RECEIVED';
    }
    await listing.save();

    res.status(201).json({
      success: true,
      message: 'Offer submitted successfully',
      data: offer,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getOffersForListing = async (req, res) => {
  try {
    const { listingId } = req.params;
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    if (listing.collectorId !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view offers for this listing',
      });
    }

    const offers = await Offer.find({ listingId }).sort({ offeredPrice: -1, createdAt: -1 });
    res.json({ success: true, data: offers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMyOffers = async (req, res) => {
  try {
    const recyclerId = req.headers['x-user-id'] || req.query.recyclerId;
    if (!recyclerId) {
      return res.status(401).json({ success: false, error: 'Recycler ID required' });
    }

    const { status } = req.query;
    const filter = { recyclerId };
    if (status) filter.status = status;

    const offers = await Offer.find(filter)
      .populate('listingId')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: offers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const { offeredPrice, proposedPickupDate, notes } = req.body;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    if (offer.recyclerId !== userId && req.headers['x-user-role'] !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Unauthorized to update this offer' });
    }

    if (offer.status !== 'SUBMITTED') {
      return res.status(400).json({
        success: false,
        error: `Cannot modify offer with status ${offer.status}`,
      });
    }

    if (offeredPrice) offer.offeredPrice = Number(offeredPrice);
    if (proposedPickupDate) offer.proposedPickupDate = new Date(proposedPickupDate);
    if (notes !== undefined) offer.notes = notes;

    await offer.save();
    res.json({ success: true, message: 'Offer updated successfully', data: offer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.withdrawOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    if (offer.recyclerId !== userId && req.headers['x-user-role'] !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Unauthorized to withdraw this offer' });
    }

    if (offer.status !== 'SUBMITTED') {
      return res.status(400).json({
        success: false,
        error: `Cannot withdraw offer with status ${offer.status}`,
      });
    }

    offer.status = 'WITHDRAWN';
    await offer.save();

    // Check remaining active offers for listing
    const remainingCount = await Offer.countDocuments({
      listingId: offer.listingId,
      status: 'SUBMITTED',
    });

    await Listing.findByIdAndUpdate(offer.listingId, {
      offersCount: remainingCount,
      status: remainingCount > 0 ? 'OFFER_RECEIVED' : 'ACTIVE',
    });

    res.json({ success: true, message: 'Offer withdrawn successfully', data: offer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.acceptOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    if (offer.status !== 'SUBMITTED') {
      return res.status(400).json({
        success: false,
        error: `Offer cannot be accepted because its status is ${offer.status}`,
      });
    }

    const listing = await Listing.findById(offer.listingId);
    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    if (listing.collectorId !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. Only the listing owner collector can accept offers.',
      });
    }

    // Atomic race-condition prevention:
    // Update listing only if status is still ACTIVE or OFFER_RECEIVED
    const transactionId = `TXN-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const handoverCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    const updatedListing = await Listing.findOneAndUpdate(
      {
        _id: listing._id,
        status: { $in: ['ACTIVE', 'OFFER_RECEIVED'] },
      },
      {
        status: 'ACCEPTED',
        acceptedOfferId: offer._id,
        acceptedTransactionId: transactionId,
      },
      { new: true }
    );

    if (!updatedListing) {
      return res.status(409).json({
        success: false,
        error: 'Listing is no longer available for offer acceptance (may already be accepted or cancelled)',
      });
    }

    // Mark accepted offer
    offer.status = 'ACCEPTED';
    await offer.save();

    // Reject all other open offers for this listing
    await Offer.updateMany(
      {
        listingId: listing._id,
        _id: { $ne: offer._id },
        status: 'SUBMITTED',
      },
      { status: 'REJECTED' }
    );

    // Create Transaction record
    const transaction = new Transaction({
      transactionId,
      listingId: listing._id,
      offerId: offer._id,
      collectorId: listing.collectorId,
      collectorName: listing.collectorName,
      collectorPhone: listing.collectorPhone,
      collectorEmail: listing.collectorEmail,
      recyclerId: offer.recyclerId,
      recyclerName: offer.recyclerName,
      recyclerPhone: offer.recyclerPhone,
      recyclerEmail: offer.recyclerEmail,
      recyclerOrganization: offer.recyclerOrganization,
      materialInfo: {
        categoryId: listing.categoryId,
        categoryName: listing.categoryName,
        subcategoryId: listing.subcategoryId,
        subcategoryName: listing.subcategoryName,
        weight: listing.weight,
        quantity: listing.quantity,
        unit: listing.unit,
        condition: listing.condition,
      },
      agreedPrice: offer.offeredPrice,
      status: 'CREATED',
      statusHistory: [
        {
          status: 'CREATED',
          timestamp: new Date(),
          changedBy: listing.collectorName || 'Collector',
          note: `Offer of ₹${offer.offeredPrice} accepted by collector`,
        },
      ],
      handoverCode,
      collectorConfirmed: false,
      recyclerConfirmed: false,
      handoverVerified: false,
      paymentStatus: 'PENDING',
      paymentMethod: 'UPI',
      scheduledPickupDate: offer.proposedPickupDate,
      pickupAddress: listing.pickupLocation,
      isTest: listing.isTest,
    });

    await transaction.save();

    // Create Handover record
    const handover = new Handover({
      transactionId,
      listingId: listing._id,
      handoverId: `HND-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
      handoverCode,
      qrPayload: JSON.stringify({
        transactionId,
        handoverCode,
        collectorId: listing.collectorId,
        recyclerId: offer.recyclerId,
        material: `${listing.categoryName} - ${listing.subcategoryName || ''}`,
        agreedPrice: offer.offeredPrice,
      }),
      collectorId: listing.collectorId,
      recyclerId: offer.recyclerId,
      collectorConfirmed: false,
      recyclerConfirmed: false,
      status: 'PENDING',
      isTest: listing.isTest,
    });

    await handover.save();

    res.json({
      success: true,
      message: 'Offer accepted successfully and transaction created',
      data: {
        listing: updatedListing,
        offer,
        transaction,
        handover,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.rejectOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    const listing = await Listing.findById(offer.listingId);
    if (listing && listing.collectorId !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Unauthorized to reject this offer' });
    }

    offer.status = 'REJECTED';
    await offer.save();

    // Update remaining count
    const remainingCount = await Offer.countDocuments({
      listingId: offer.listingId,
      status: 'SUBMITTED',
    });

    if (listing && listing.status === 'OFFER_RECEIVED' && remainingCount === 0) {
      listing.status = 'ACTIVE';
      listing.offersCount = 0;
      await listing.save();
    }

    res.json({ success: true, message: 'Offer rejected', data: offer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
