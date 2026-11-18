const Listing = require('../models/Listing');
const Offer = require('../models/Offer');

exports.createListing = async (req, res) => {
  try {
    const {
      title,
      categoryId,
      categoryName,
      subcategoryId,
      subcategoryName,
      weight,
      quantity,
      unit,
      condition,
      description,
      photos,
      pickupLocation,
      estimatedValue,
      status,
      isTest,
    } = req.body;

    const collectorId = req.headers['x-user-id'] || req.body.collectorId;
    const collectorName = req.headers['x-user-name'] || req.body.collectorName;
    const collectorPhone = req.headers['x-user-phone'] || req.body.collectorPhone;
    const collectorEmail = req.headers['x-user-email'] || req.body.collectorEmail;

    if (!collectorId) {
      return res.status(401).json({ success: false, error: 'Collector identity required' });
    }

    if (!title || !categoryId || !categoryName) {
      return res.status(400).json({
        success: false,
        error: 'Title, categoryId, and categoryName are required',
      });
    }

    if (!pickupLocation || !pickupLocation.address || !pickupLocation.city || !pickupLocation.state) {
      return res.status(400).json({
        success: false,
        error: 'Pickup address, city, and state are required',
      });
    }

    const numWeight = Number(weight || 0);
    const numQty = Number(quantity || 1);

    if (numWeight <= 0 && numQty <= 0) {
      return res.status(400).json({
        success: false,
        error: 'A valid weight or quantity is required',
      });
    }

    const listingStatus = status === 'DRAFT' ? 'DRAFT' : 'ACTIVE';
    const isTestListing = Boolean(
      isTest ||
      (title && title.startsWith('test_')) ||
      (collectorEmail && (collectorEmail.startsWith('test_') || collectorEmail.startsWith('e2e_')))
    );

    const listing = new Listing({
      collectorId,
      collectorName,
      collectorPhone,
      collectorEmail,
      title: title.trim(),
      categoryId,
      categoryName,
      subcategoryId,
      subcategoryName,
      weight: numWeight,
      quantity: numQty,
      unit: unit || 'kg',
      condition: condition || 'Scrap',
      description,
      photos: photos || [],
      pickupLocation,
      estimatedValue: Number(estimatedValue || 0),
      status: listingStatus,
      isTest: isTestListing,
      isSeed: false,
    });

    await listing.save();

    res.status(201).json({
      success: true,
      message: listingStatus === 'DRAFT' ? 'Listing saved as draft' : 'Listing published successfully',
      data: listing,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getListings = async (req, res) => {
  try {
    const {
      categoryId,
      subcategoryId,
      city,
      minWeight,
      maxWeight,
      condition,
      search,
      status,
      sortBy,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    // For public browse, default to ACTIVE (or OFFER_RECEIVED which is still active for offers)
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $in: ['ACTIVE', 'OFFER_RECEIVED'] };
    }

    if (categoryId) filter.categoryId = categoryId;
    if (subcategoryId) filter.subcategoryId = subcategoryId;
    if (condition) filter.condition = condition;
    if (city) {
      filter['pickupLocation.city'] = new RegExp(String(city).trim(), 'i');
    }

    if (minWeight || maxWeight) {
      filter.weight = {};
      if (minWeight) filter.weight.$gte = Number(minWeight);
      if (maxWeight) filter.weight.$lte = Number(maxWeight);
    }

    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { categoryName: searchRegex },
        { subcategoryName: searchRegex },
        { 'pickupLocation.city': searchRegex },
      ];
    }

    // Sorting
    let sort = { createdAt: -1 };
    if (sortBy === 'price_asc') sort = { estimatedValue: 1 };
    if (sortBy === 'price_desc') sort = { estimatedValue: -1 };
    if (sortBy === 'weight_asc') sort = { weight: 1 };
    if (sortBy === 'weight_desc') sort = { weight: -1 };

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [listings, total] = await Promise.all([
      Listing.find(filter).sort(sort).skip(skip).limit(limitNum),
      Listing.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        listings,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getListingById = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    // If requester is the owner collector or admin, include offers
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    let offers = [];
    if (userId === listing.collectorId || userRole === 'ADMIN') {
      offers = await Offer.find({ listingId: listing._id }).sort({ createdAt: -1 });
    } else if (userRole === 'RECYCLER' && userId) {
      // Recycler can see their own offer if submitted
      offers = await Offer.find({ listingId: listing._id, recyclerId: userId });
    }

    res.json({
      success: true,
      data: {
        ...listing.toObject(),
        offers,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMyListings = async (req, res) => {
  try {
    const collectorId = req.headers['x-user-id'] || req.query.collectorId;
    if (!collectorId) {
      return res.status(401).json({ success: false, error: 'Collector ID required' });
    }

    const { status } = req.query;
    const filter = { collectorId };
    if (status) filter.status = status;

    const listings = await Listing.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: listings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    if (listing.collectorId !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Unauthorized to update this listing' });
    }

    if (['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(listing.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot modify listing with status ${listing.status}`,
      });
    }

    const allowedUpdates = [
      'title',
      'weight',
      'quantity',
      'unit',
      'condition',
      'description',
      'photos',
      'pickupLocation',
      'estimatedValue',
      'status',
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    await listing.save();
    res.json({ success: true, message: 'Listing updated successfully', data: listing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.cancelListing = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    const listing = await Listing.findById(id);
    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    if (listing.collectorId !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Unauthorized to cancel this listing' });
    }

    if (['COMPLETED', 'ACCEPTED', 'IN_PROGRESS'].includes(listing.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel listing that is already ${listing.status}`,
      });
    }

    listing.status = 'CANCELLED';
    await listing.save();

    // Reject any open offers
    await Offer.updateMany(
      { listingId: listing._id, status: 'SUBMITTED' },
      { status: 'REJECTED' }
    );

    res.json({ success: true, message: 'Listing cancelled successfully', data: listing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
