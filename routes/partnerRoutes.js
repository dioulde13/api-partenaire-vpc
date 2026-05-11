const express = require('express');
const router = express.Router();
const partnerController = require('../controllers/partnerController');
const authMiddleware = require('../middleware/auth');

/**
 * Partner Routes (all protected)
 * 
 * GET /api/partners/profile  - Get partner profile for authenticated user
 * GET /api/partners          - List all partners
 */

router.use(authMiddleware);

router.get('/profile', partnerController.getPartnerProfile);
router.get('/', partnerController.getAllPartners);

module.exports = router;
