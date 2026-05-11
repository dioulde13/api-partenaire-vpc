const sql = require("mssql");

let pool = null;

async function getPool() {
  if (pool) {
    return pool;
  }

  const config = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === "true",
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === "true",
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 30000,
    requestTimeout: 30000,
  };

  try {
    pool = await sql.connect(config);
    console.log("✅ Connexion SQL Server établie avec succès !");
    return pool;
  } catch (error) {
    console.error("❌ Erreur de connexion SQL Server:", error.message);
    pool = null;
    throw error;
  }
}

async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
    console.log("🔌 Connexion SQL Server fermée.");
  }
}

module.exports = { getPool, closePool, sql };
