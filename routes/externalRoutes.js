const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transactionController");
const apiKeyAuth = require("../middleware/apiKeyAuth");

/**
 * ─── Routes Externes pour les Partenaires ─────────────────────────
 * Authentification via API Key fixe (header x-api-key)
 * Pas de JWT, pas d'expiration
 *
 * GET /api/external/transaction-status/:referencestatus
 */

router.get(
  "/transaction-status/:referencestatus",
  apiKeyAuth,
  transactionController.searchstatusTransaction
);

module.exports = router;
