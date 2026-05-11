const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transactionController");
const authMiddleware = require("../middleware/auth");

/**
 * Transaction Routes (all protected)
 *
 * GET  /api/transactions          - List transactions with filters
 * GET  /api/transactions/stats    - Get dashboard statistics
 * GET  /api/transactions/export   - Export transactions as CSV
 * GET  /api/transactions/search/:reference - Search by reference
 */

// All routes require authentication
router.use(authMiddleware);

router.get("/", transactionController.getTransactions);
router.get("/stats", transactionController.getStats);
router.get("/export", transactionController.exportTransactions);
router.get("/search/:reference", transactionController.searchTransaction);

module.exports = router;
