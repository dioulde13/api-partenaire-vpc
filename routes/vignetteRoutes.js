const express = require("express");
const router = express.Router();
const vignetteController = require("../controllers/vignetteController");
const authMiddleware = require("../middleware/auth");

router.get("/check", authMiddleware, vignetteController.checkVignette);

module.exports = router;
