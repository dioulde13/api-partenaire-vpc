// ⚠️ dotenv DOIT être chargé en tout premier
require("dotenv").config();

const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");

const { getPool } = require("./config/database");

// ─── Import Routes ────────────────────────────────────────────────
const authRoutes = require("./routes/authRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const partnerRoutes = require("./routes/partnerRoutes");

const app = express();

// ─── Static Files ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ─── Body Parser ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Security & Middleware ────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// ─── CORS ────────────────────────────────────────────────────────
app.use(
  cors({
    origin: [
      "http://localhost:4200",
      "https://dev-vpcbackoffice-stat.ecash-guinee.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// ─── SSL Credentials ─────────────────────────────────────────────
const credentials = {
  key: fs.readFileSync(path.join(__dirname, "EcashSSL2025up.pem"), "utf8"),
  cert: fs.readFileSync(path.join(__dirname, "EcashSSL2025up.pem"), "utf8"),
  ca: fs.readFileSync(path.join(__dirname, "EcashSSL2025up.pem"), "utf8"),
};

// ─── Routes ──────────────────────────────────────────────────────

// Home
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Bienvenue sur l'API VPC Partenaire !",
    version: "1.0.0",
  });
});

// Health Check Route
app.get("/api/health", async (req, res) => {
  const health = {
    uptime: process.uptime(),
    message: "OK",
    timestamp: Date.now(),
    services: {
      database: "unknown",
      email: "unknown",
    },
  };

  try {
    // Check Database
    const { getPool } = require("./config/database");
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS status");
    health.services.database = "connected";

    // Check Email (transporter is exported from config/email)
    const { transporter } = require("./config/email");
    await transporter.verify();
    health.services.email = "connected";

    res.status(200).json(health);
  } catch (error) {
    health.message = "ERROR";
    health.error = error.message;
    res.status(503).json(health);
  }
});

// Test DB Connection
app.get("/api/test-db", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query("SELECT 1 AS status");
    return res.status(200).json({
      success: true,
      message: "Connexion à la base de données réussie !",
      data: result.recordset,
    });
  } catch (error) {
    console.error("❌ Erreur test-db:", error.message);
    return res.status(500).json({
      success: false,
      message: "Échec de la connexion à la base de données.",
      error: error.message,
    });
  }
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/partners", partnerRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route introuvable : ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Erreur globale:", err.message);
  res.status(500).json({
    success: false,
    message: "Erreur interne du serveur.",
    error: err.message,
  });
});

// ─── Start Server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3007;

https.createServer(credentials, app).listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Serveur HTTPS en écoute sur https://0.0.0.0:${PORT}`);
  console.log(`📌 DB_SERVER   : ${process.env.DB_SERVER}`);
  console.log(`📌 DB_DATABASE : ${process.env.DB_DATABASE}`);
});
