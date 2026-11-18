const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({
    service: 'ai',
    status: 'running',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// AI Material & Quality Analysis Endpoint
app.post('/api/ai/analyze-material', (req, res) => {
  const { materialType, condition, description, weight } = req.body;

  let conditionScore = 0.5;
  if (condition === 'Working') conditionScore = 0.9;
  else if (condition === 'Fair') conditionScore = 0.7;
  else if (condition === 'Non-Working') conditionScore = 0.4;
  else if (condition === 'Scrap') conditionScore = 0.3;

  const estimatedPreciousMetalsYieldGrams =
    materialType && materialType.toLowerCase().includes('phone')
      ? Math.round(Number(weight || 1) * 0.02 * 100) / 100
      : Math.round(Number(weight || 1) * 0.005 * 100) / 100;

  res.json({
    success: true,
    data: {
      recyclabilityScore: Math.round(conditionScore * 100),
      conditionAssessment: condition || 'Standard Scrap',
      hazardWarnings:
        materialType && (materialType.toLowerCase().includes('battery') || materialType.toLowerCase().includes('lead'))
          ? ['Risk of chemical burns or thermal discharge. Ensure terminal insulation.']
          : ['General e-waste handling. Wear protective gloves.'],
      estimatedPreciousMetalsYieldGrams,
      recommendedProcess: 'Dismantle PCB components first; segregate high-grade copper cables.',
    },
  });
});

// AI Pricing Advice & Fairness Assessment
app.post('/api/ai/pricing-advice', (req, res) => {
  const { category, subcategory, basePrice, offeredPrice } = req.body;

  const base = Number(basePrice || 100);
  const offered = Number(offeredPrice || base);
  const deviation = Math.round(((offered - base) / base) * 100);

  let recommendation = 'FAIR_MARKET_RATE';
  if (deviation < -20) recommendation = 'LOW_OFFER';
  else if (deviation > 20) recommendation = 'PREMIUM_OFFER';

  res.json({
    success: true,
    data: {
      marketFairnessRating: deviation >= -10 ? 'High' : 'Medium',
      priceDeviationPercentage: deviation,
      recommendation,
      adviceText:
        deviation < -15
          ? 'This offer is significantly below transparent market value. You may want to wait for higher bids.'
          : 'This offer is competitive with prevailing formal recycler rates in your region.',
    },
  });
});

// Route aliases
app.post('/analyze-material', (req, res) => res.redirect(307, '/api/ai/analyze-material'));
app.post('/pricing-advice', (req, res) => res.redirect(307, '/api/ai/pricing-advice'));

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`AI service is running on port ${PORT}`);
  });
}

module.exports = app;
