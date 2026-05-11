const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.post("/login", authController.login);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.post("/add-user", authController.addUser);

// Protected routes
router.get("/me", authMiddleware, authController.getMe);
router.get("/users", authMiddleware, authController.getAllUsersPartners);

module.exports = router;
