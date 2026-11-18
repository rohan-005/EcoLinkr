const QRCode = require('qrcode');
const Transaction = require('../models/Transaction');
const Listing = require('../models/Listing');
const Handover = require('../models/Handover');

const VALID_TRANSITIONS = {
  CREATED: ['SCHEDULED', 'HANDOVER_PENDING', 'CANCELLED'],
  SCHEDULED: ['HANDOVER_PENDING', 'CANCELLED'],
  HANDOVER_PENDING: ['VERIFIED', 'CANCELLED'],
  VERIFIED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

exports.getTransactions = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    const { status, role, page = 1, limit = 50 } = req.query;

    const filter = {};

    if (userRole === 'COLLECTOR' || role === 'COLLECTOR') {
      filter.collectorId = userId || req.query.collectorId;
    } else if (userRole === 'RECYCLER' || role === 'RECYCLER') {
      filter.recyclerId = userId || req.query.recyclerId;
    }
    // Admin sees all unless specific collector/recycler queried

    if (status) filter.status = status;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const isCustomId = id.startsWith('TXN-');
    const transaction = isCustomId
      ? await Transaction.findOne({ transactionId: id })
      : await Transaction.findById(id);

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const handover = await Handover.findOne({ transactionId: transaction.transactionId });

    res.json({
      success: true,
      data: {
        ...transaction.toObject(),
        handover,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getHandoverQR = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const handover = await Handover.findOne({ transactionId });
    if (!handover) {
      return res.status(404).json({ success: false, error: 'Handover record not found' });
    }

    const qrDataUrl = await QRCode.toDataURL(handover.qrPayload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300,
      color: {
        dark: '#0B0B0C',
        light: '#FFFFFF',
      },
    });

    res.json({
      success: true,
      data: {
        qrCode: qrDataUrl,
        handoverCode: transaction.handoverCode,
        handoverId: handover.handoverId,
        transactionId: transaction.transactionId,
        isVerified: transaction.handoverVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.verifyHandover = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { handoverCode, gpsCoordinates, photoEvidence, notes } = req.body;
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];

    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    if (transaction.status === 'COMPLETED' || transaction.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        error: `Cannot verify handover for transaction with status ${transaction.status}`,
      });
    }

    // Validate code
    if (!handoverCode || handoverCode.toUpperCase().trim() !== transaction.handoverCode.toUpperCase().trim()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid handover verification code',
      });
    }

    const isCollector = userId === transaction.collectorId || userRole === 'COLLECTOR';
    const isRecycler = userId === transaction.recyclerId || userRole === 'RECYCLER';
    const isAdmin = userRole === 'ADMIN';

    if (!isCollector && !isRecycler && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized. Only the involved collector, recycler, or admin can verify this handover.',
      });
    }

    const now = new Date();

    if (isCollector) {
      transaction.collectorConfirmed = true;
      transaction.collectorConfirmedAt = now;
    }
    if (isRecycler) {
      transaction.recyclerConfirmed = true;
      transaction.recyclerConfirmedAt = now;
    }
    if (isAdmin) {
      transaction.collectorConfirmed = true;
      transaction.collectorConfirmedAt = now;
      transaction.recyclerConfirmed = true;
      transaction.recyclerConfirmedAt = now;
    }

    // Record GPS and photo evidence if provided
    if (gpsCoordinates) {
      transaction.handoverLocation = gpsCoordinates;
    }
    if (photoEvidence) {
      transaction.handoverEvidencePhoto = photoEvidence;
    }

    // If both confirmed or validated with the unique code by recycler/admin
    transaction.handoverVerified = true;
    transaction.handoverVerifiedAt = now;
    transaction.status = 'VERIFIED';
    transaction.statusHistory.push({
      status: 'VERIFIED',
      timestamp: now,
      changedBy: req.headers['x-user-name'] || req.headers['x-user-email'] || 'Handover Verification',
      note: `Handover verified with secure code ${transaction.handoverCode}`,
    });

    await transaction.save();

    // Update Handover collection
    const handover = await Handover.findOne({ transactionId });
    if (handover) {
      handover.status = 'VERIFIED';
      handover.verificationTimestamp = now;
      if (isCollector) {
        handover.collectorConfirmed = true;
        handover.collectorConfirmedAt = now;
      }
      if (isRecycler) {
        handover.recyclerConfirmed = true;
        handover.recyclerConfirmedAt = now;
      }
      if (gpsCoordinates) handover.gpsCoordinates = gpsCoordinates;
      if (photoEvidence) handover.photoEvidence.push(photoEvidence);
      if (notes) handover.notes = notes;
      await handover.save();
    }

    res.json({
      success: true,
      message: 'Handover verification completed successfully',
      data: {
        transaction,
        handover,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateTransactionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, scheduledPickupDate } = req.body;
    const userRole = req.headers['x-user-role'];
    const userName = req.headers['x-user-name'] || req.headers['x-user-email'] || 'User';

    const isCustomId = id.startsWith('TXN-');
    const transaction = isCustomId
      ? await Transaction.findOne({ transactionId: id })
      : await Transaction.findById(id);

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    const currentStatus = transaction.status;
    const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid state transition from ${currentStatus} to ${status}. Allowed: ${allowedNextStatuses.join(', ')}`,
      });
    }

    // Critical constraint: A transaction cannot reach COMPLETED until handover is verified
    if (status === 'COMPLETED' && !transaction.handoverVerified) {
      return res.status(400).json({
        success: false,
        error: 'Cannot complete transaction before handover is verified',
        code: 'HANDOVER_NOT_VERIFIED',
      });
    }

    if (scheduledPickupDate) {
      transaction.scheduledPickupDate = new Date(scheduledPickupDate);
    }

    transaction.status = status;
    transaction.statusHistory.push({
      status,
      timestamp: new Date(),
      changedBy: userName,
      note: note || `Status transitioned from ${currentStatus} to ${status}`,
    });

    if (status === 'COMPLETED') {
      transaction.paymentStatus = 'COMPLETED';
      transaction.paymentPaidAt = new Date();
      // Update listing
      await Listing.findByIdAndUpdate(transaction.listingId, { status: 'COMPLETED' });
    } else if (status === 'CANCELLED') {
      // Revert listing to active or cancelled
      await Listing.findByIdAndUpdate(transaction.listingId, {
        status: 'ACTIVE',
        acceptedOfferId: undefined,
        acceptedTransactionId: undefined,
      });
    }

    await transaction.save();

    res.json({
      success: true,
      message: `Transaction status updated to ${status}`,
      data: transaction,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.completeTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const isCustomId = id.startsWith('TXN-');
    const transaction = isCustomId
      ? await Transaction.findOne({ transactionId: id })
      : await Transaction.findById(id);

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // Check verification constraint
    if (!transaction.handoverVerified) {
      return res.status(400).json({
        success: false,
        error: 'Cannot complete transaction before handover verification is completed',
        code: 'HANDOVER_NOT_VERIFIED',
      });
    }

    if (transaction.status === 'COMPLETED') {
      return res.json({
        success: true,
        message: 'Transaction already completed',
        data: transaction,
      });
    }

    const now = new Date();
    transaction.status = 'COMPLETED';
    transaction.paymentStatus = 'COMPLETED';
    transaction.paymentPaidAt = now;
    transaction.statusHistory.push({
      status: 'COMPLETED',
      timestamp: now,
      changedBy: req.headers['x-user-name'] || 'System',
      note: 'Transaction finalized and payout released',
    });

    await transaction.save();
    await Listing.findByIdAndUpdate(transaction.listingId, { status: 'COMPLETED' });

    res.json({
      success: true,
      message: 'Transaction completed successfully',
      data: transaction,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getFinancialHistory = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    const userRole = req.headers['x-user-role'] || req.query.role;

    if (userRole === 'COLLECTOR') {
      const allTxns = await Transaction.find({ collectorId: userId });
      const completed = allTxns.filter((t) => t.status === 'COMPLETED');
      const active = allTxns.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status));

      const totalEarnings = completed.reduce((sum, t) => sum + (t.agreedPrice || 0), 0);
      const pendingPayments = active.reduce((sum, t) => sum + (t.agreedPrice || 0), 0);

      return res.json({
        success: true,
        data: {
          totalEarnings,
          pendingPayments,
          completedCount: completed.length,
          activeCount: active.length,
          totalTransactions: allTxns.length,
        },
      });
    }

    if (userRole === 'RECYCLER') {
      const allTxns = await Transaction.find({ recyclerId: userId });
      const completed = allTxns.filter((t) => t.status === 'COMPLETED');
      const active = allTxns.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status));

      const totalPurchasesValue = completed.reduce((sum, t) => sum + (t.agreedPrice || 0), 0);

      return res.json({
        success: true,
        data: {
          totalPurchasesValue,
          completedCount: completed.length,
          activeCount: active.length,
          totalPurchasesCount: allTxns.length,
        },
      });
    }

    // Admin overview
    const [allTxns, allListings] = await Promise.all([
      Transaction.find({}),
      Listing.find({}),
    ]);

    const completedTxns = allTxns.filter((t) => t.status === 'COMPLETED');
    const platformTransactionValue = completedTxns.reduce((sum, t) => sum + (t.agreedPrice || 0), 0);
    const totalMaterialCollectedKg = completedTxns.reduce(
      (sum, t) => sum + (t.materialInfo?.weight || 0),
      0
    );

    res.json({
      success: true,
      data: {
        platformTransactionValue,
        totalMaterialCollectedKg,
        totalTransactions: allTxns.length,
        completedTransactions: completedTxns.length,
        activeListingsCount: allListings.filter((l) => ['ACTIVE', 'OFFER_RECEIVED'].includes(l.status)).length,
        totalListingsCount: allListings.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
