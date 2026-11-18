const Category = require('../models/Category');
const Pricing = require('../models/Pricing');
const { seedCategories } = require('../data/seedData');

// Seed catalog categories and pricing
async function seedCatalog(force = false) {
  try {
    const existingCount = await Category.countDocuments({ isTest: false });
    if (existingCount > 0 && !force) {
      return { message: 'Catalog already seeded', count: existingCount };
    }

    if (force) {
      await Category.deleteMany({ isSeed: true });
      await Pricing.deleteMany({ isSeed: true });
    }

    const defaultCities = [
      { city: 'New Delhi', state: 'Delhi', factor: 1.05 },
      { city: 'Mumbai', state: 'Maharashtra', factor: 1.08 },
      { city: 'Bengaluru', state: 'Karnataka', factor: 1.02 },
      { city: 'Hyderabad', state: 'Telangana', factor: 1.0 },
      { city: 'Chennai', state: 'Tamil Nadu', factor: 0.98 },
      { city: 'Kolkata', state: 'West Bengal', factor: 0.95 },
    ];

    let createdCategoriesCount = 0;
    let createdPricingCount = 0;

    for (const catData of seedCategories) {
      let category = await Category.findOne({ slug: catData.slug });
      if (!category) {
        category = new Category({
          ...catData,
          isSeed: true,
          isTest: false,
        });
        await category.save();
        createdCategoriesCount++;
      }

      // Create or update pricing for each subcategory
      for (const sub of category.subcategories) {
        let pricing = await Pricing.findOne({ subcategoryId: sub._id });
        if (!pricing) {
          const locRates = defaultCities.map((c) => ({
            city: c.city,
            state: c.state,
            pricePerUnit: Math.round(sub.basePricePerUnit * c.factor),
          }));

          pricing = new Pricing({
            categoryId: category._id,
            subcategoryId: sub._id,
            materialName: sub.name,
            categoryName: category.name,
            unit: sub.unit,
            basePricePerUnit: sub.basePricePerUnit,
            minPrice: sub.minPrice,
            maxPrice: sub.maxPrice,
            locationRates: locRates,
            recyclerRates: [],
            priceHistory: [
              {
                pricePerUnit: sub.basePricePerUnit,
                effectiveDate: new Date(),
                changedBy: 'System Seed',
                note: 'Initial baseline transparent market price',
              },
            ],
            isSeed: true,
            isTest: false,
            lastUpdated: new Date(),
          });
          await pricing.save();
          createdPricingCount++;
        }
      }
    }

    return {
      success: true,
      message: 'Catalog seeded successfully',
      categoriesCount: createdCategoriesCount,
      pricingCount: createdPricingCount,
    };
  } catch (error) {
    console.error('Seed catalog error:', error);
    throw error;
  }
}

// Controller Endpoints
exports.seedEndpoint = async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const result = await seedCatalog(force);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const filter = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const categories = await Category.find(filter).sort({ name: 1 });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
    const category = isObjectId
      ? await Category.findById(id)
      : await Category.findOne({ slug: id });

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      image,
      hazardClassification,
      recyclingInstructions,
      safetyInformation,
      acceptedMaterialTypes,
      subcategories,
      isTest,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    const generatedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const existing = await Category.findOne({
      $or: [{ name: name.trim() }, { slug: generatedSlug }],
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Category with this name or slug already exists' });
    }

    const category = new Category({
      name: name.trim(),
      slug: generatedSlug,
      description,
      image,
      hazardClassification: hazardClassification || 'Low',
      recyclingInstructions,
      safetyInformation,
      acceptedMaterialTypes: acceptedMaterialTypes || [],
      subcategories: subcategories || [],
      isTest: Boolean(isTest || name.startsWith('test_')),
      isSeed: false,
      isActive: true,
    });

    await category.save();

    // Initialize pricing for any subcategories
    if (category.subcategories && category.subcategories.length > 0) {
      for (const sub of category.subcategories) {
        const pricing = new Pricing({
          categoryId: category._id,
          subcategoryId: sub._id,
          materialName: sub.name,
          categoryName: category.name,
          unit: sub.unit || 'kg',
          basePricePerUnit: sub.basePricePerUnit || 0,
          minPrice: sub.minPrice || 0,
          maxPrice: sub.maxPrice || 0,
          locationRates: [],
          recyclerRates: [],
          priceHistory: [
            {
              pricePerUnit: sub.basePricePerUnit || 0,
              effectiveDate: new Date(),
              changedBy: req.headers['x-user-email'] || 'Admin',
              note: 'Created with category',
            },
          ],
          isTest: category.isTest,
          isSeed: false,
          lastUpdated: new Date(),
        });
        await pricing.save();
      }
    }

    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    Object.assign(category, updateData);
    await category.save();

    res.json({ success: true, message: 'Category updated successfully', data: category });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Soft delete/deactivate
    category.isActive = false;
    await category.save();

    res.json({ success: true, message: 'Category deactivated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.addSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      description,
      unit,
      basePricePerUnit,
      minPrice,
      maxPrice,
      hazardLevel,
      recyclingInstructions,
      safetyInfo,
    } = req.body;

    if (!name || basePricePerUnit === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Subcategory name and basePricePerUnit are required',
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    const subSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newSub = {
      name: name.trim(),
      slug: subSlug,
      description,
      unit: unit || 'kg',
      basePricePerUnit: Number(basePricePerUnit),
      minPrice: Number(minPrice || basePricePerUnit * 0.7),
      maxPrice: Number(maxPrice || basePricePerUnit * 1.5),
      hazardLevel: hazardLevel || 'Low',
      recyclingInstructions,
      safetyInfo,
      isActive: true,
    };

    category.subcategories.push(newSub);
    await category.save();

    const addedSub = category.subcategories[category.subcategories.length - 1];

    // Create pricing record
    const pricing = new Pricing({
      categoryId: category._id,
      subcategoryId: addedSub._id,
      materialName: addedSub.name,
      categoryName: category.name,
      unit: addedSub.unit,
      basePricePerUnit: addedSub.basePricePerUnit,
      minPrice: addedSub.minPrice,
      maxPrice: addedSub.maxPrice,
      locationRates: [],
      recyclerRates: [],
      priceHistory: [
        {
          pricePerUnit: addedSub.basePricePerUnit,
          effectiveDate: new Date(),
          changedBy: req.headers['x-user-email'] || 'Admin',
          note: 'Initial subcategory pricing',
        },
      ],
      isTest: category.isTest,
      isSeed: false,
      lastUpdated: new Date(),
    });
    await pricing.save();

    res.status(201).json({ success: true, data: addedSub });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPricing = async (req, res) => {
  try {
    const { categoryId, search, city } = req.query;
    const filter = {};

    if (categoryId) filter.categoryId = categoryId;
    if (search) {
      filter.materialName = new RegExp(String(search), 'i');
    }

    const pricingList = await Pricing.find(filter).sort({ materialName: 1 });

    // If city is specified, calculate effective rate for each item
    const formatted = pricingList.map((p) => {
      const obj = p.toObject();
      let effectiveRate = obj.basePricePerUnit;
      let rateType = 'base';

      if (city && obj.locationRates && obj.locationRates.length > 0) {
        const locRate = obj.locationRates.find(
          (lr) => lr.city.toLowerCase() === String(city).toLowerCase()
        );
        if (locRate) {
          effectiveRate = locRate.pricePerUnit;
          rateType = 'location';
        }
      }

      return {
        ...obj,
        effectivePricePerUnit: effectiveRate,
        rateType,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getPricingBySubcategoryId = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    const pricing = await Pricing.findOne({ subcategoryId });
    if (!pricing) {
      return res.status(404).json({ success: false, error: 'Pricing not found for this subcategory' });
    }
    res.json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updatePricing = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      basePricePerUnit,
      minPrice,
      maxPrice,
      locationRates,
      recyclerRate,
      note,
    } = req.body;

    const pricing = await Pricing.findById(id);
    if (!pricing) {
      return res.status(404).json({ success: false, error: 'Pricing record not found' });
    }

    const userRole = req.headers['x-user-role'] || 'ADMIN';
    const userId = req.headers['x-user-id'];
    const userName = req.headers['x-user-name'] || req.headers['x-user-email'] || 'User';

    if (userRole === 'RECYCLER' && recyclerRate) {
      // Recycler updating their specific offered rate
      const existingIdx = pricing.recyclerRates.findIndex(
        (r) => r.recyclerId === String(userId || recyclerRate.recyclerId)
      );
      if (existingIdx >= 0) {
        pricing.recyclerRates[existingIdx].pricePerUnit = recyclerRate.pricePerUnit;
        pricing.recyclerRates[existingIdx].effectiveDate = new Date();
      } else {
        pricing.recyclerRates.push({
          recyclerId: String(userId || recyclerRate.recyclerId),
          recyclerName: String(userName || recyclerRate.recyclerName),
          pricePerUnit: Number(recyclerRate.pricePerUnit),
          effectiveDate: new Date(),
        });
      }
    } else {
      // Admin updating general baseline or location rates
      if (basePricePerUnit !== undefined) {
        pricing.basePricePerUnit = Number(basePricePerUnit);
        pricing.priceHistory.push({
          pricePerUnit: Number(basePricePerUnit),
          effectiveDate: new Date(),
          changedBy: userName,
          note: note || 'Base price adjustment',
        });
      }
      if (minPrice !== undefined) pricing.minPrice = Number(minPrice);
      if (maxPrice !== undefined) pricing.maxPrice = Number(maxPrice);
      if (locationRates && Array.isArray(locationRates)) {
        pricing.locationRates = locationRates;
      }
    }

    pricing.lastUpdated = new Date();
    await pricing.save();

    res.json({ success: true, message: 'Pricing updated successfully', data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.calculateValuation = async (req, res) => {
  try {
    const { categoryId, subcategoryId, weight, quantity, unit, city, recyclerId } = req.body;

    if (!categoryId && !subcategoryId) {
      return res.status(400).json({
        success: false,
        error: 'Either categoryId or subcategoryId must be provided',
      });
    }

    // Valuation check: non-numeric, negative, or zero input
    const numWeight = weight !== undefined ? Number(weight) : null;
    const numQuantity = quantity !== undefined ? Number(quantity) : null;

    if (
      (numWeight !== null && (isNaN(numWeight) || numWeight <= 0)) ||
      (numQuantity !== null && (isNaN(numQuantity) || numQuantity <= 0)) ||
      (numWeight === null && numQuantity === null)
    ) {
      return res.status(400).json({
        success: false,
        error: 'A valid positive numeric weight or quantity is required for valuation',
      });
    }

    // Find pricing
    let pricing = null;
    if (subcategoryId) {
      pricing = await Pricing.findOne({ subcategoryId });
    }
    if (!pricing && categoryId) {
      pricing = await Pricing.findOne({ categoryId });
    }

    if (!pricing) {
      return res.status(404).json({
        success: false,
        error: 'Pricing information not found for selected material',
      });
    }

    // Determine unit and quantity/weight
    const pricingUnit = pricing.unit || 'kg';
    const chosenUnit = unit || pricingUnit;

    let applicablePrice = pricing.basePricePerUnit;
    let rateSource = 'base';

    // Check recycler-specific rate
    if (recyclerId && pricing.recyclerRates && pricing.recyclerRates.length > 0) {
      const recRate = pricing.recyclerRates.find((r) => r.recyclerId === String(recyclerId));
      if (recRate) {
        applicablePrice = recRate.pricePerUnit;
        rateSource = 'recycler';
      }
    }

    // Check location-based rate
    if (rateSource === 'base' && city && pricing.locationRates && pricing.locationRates.length > 0) {
      const locRate = pricing.locationRates.find(
        (l) => l.city.toLowerCase() === String(city).toLowerCase().trim()
      );
      if (locRate) {
        applicablePrice = locRate.pricePerUnit;
        rateSource = 'location';
      }
    }

    // Amount calculation
    let amount = 0;
    if (pricingUnit === 'kg') {
      amount = numWeight !== null ? numWeight : (numQuantity || 0);
    } else {
      amount = numQuantity !== null ? numQuantity : (numWeight || 0);
    }

    const estimatedValue = Math.round(amount * applicablePrice * 100) / 100;
    const minEstimatedValue = Math.round(amount * (pricing.minPrice || applicablePrice * 0.8) * 100) / 100;
    const maxEstimatedValue = Math.round(amount * (pricing.maxPrice || applicablePrice * 1.2) * 100) / 100;

    res.json({
      success: true,
      data: {
        materialName: pricing.materialName,
        categoryName: pricing.categoryName,
        unit: chosenUnit,
        amount,
        basePricePerUnit: pricing.basePricePerUnit,
        applicablePricePerUnit: applicablePrice,
        rateSource,
        estimatedValue,
        minEstimatedValue,
        maxEstimatedValue,
        formula: `Estimated Value = ${amount} ${chosenUnit} × ₹${applicablePrice} per ${pricingUnit}`,
        lastUpdated: pricing.lastUpdated,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.seedCatalog = seedCatalog;
