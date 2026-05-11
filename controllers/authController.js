const { getPool, sql } = require("../config/database");
const { sendOtpEmail } = require("../config/email");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const otpStore = new Map();

function generateOtp(length = 4) {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10).toString();
  }
  return otp;
}

async function executeQuery(query, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  for (const [key, { type, value }] of Object.entries(params)) {
    request.input(key, type, value);
  }
  return request.query(query);
}

// ─── Helper : appel usp_updateUserOTPParteners ────────────────────
// isValid : null (lors de la génération) | 1 (lors de la validation)
async function updateUserOTP(email, otp, isValid = null) {
  const pool = await getPool();
  await pool
    .request()
    .input("email", sql.NVarChar(255), email)
    .input("vcOTP", sql.NVarChar(10), otp)
    .input("isValid", sql.Bit, isValid)
    .execute("usp_updateUserOTPParteners");
}

// ─── LOGIN ────────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(404).json({
        status: 404,
        message: "Email et mot de passe requis.",
      });
    }

    const result = await executeQuery(
      `SELECT * FROM viewUsersPartners WHERE email = @email`,
      { email: { type: sql.NVarChar, value: email } },
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Email ou mot de passe incorrect.",
      });
    }

    const user = result.recordset[0];

    let passwordValid = false;
    const storedPassword = user.password || "";
    try {
      passwordValid = await bcrypt.compare(password, storedPassword);
    } catch {
      passwordValid = password === storedPassword;
    }

    if (!passwordValid) {
      return res.status(404).json({
        status: 404,
        message: "Email ou mot de passe incorrect.",
      });
    }

    if (user.btEnabled === false || user.btEnabled === 0) {
      return res.status(404).json({
        status: 404,
        message: "Votre compte est désactivé. Contactez l'administrateur.",
      });
    }

    const otpLength = parseInt(process.env.OTP_LENGTH, 10) || 4;
    const otpExpiry = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
    const otpCode = generateOtp(otpLength);

    otpStore.set(email.toLowerCase(), {
      code: otpCode,
      expiresAt: Date.now() + otpExpiry * 60 * 1000,
      userId: user.id,
      attempts: 0,
    });

    // ✅ Enregistre l'OTP en base avec isValid = null (non encore validé)
    await updateUserOTP(email, otpCode, null);

    const userName = user.name || "Partenaire";
    const emailResult = await sendOtpEmail(email, otpCode, userName);

    if (!emailResult.success) {
      console.error("⚠️ Erreur envoi OTP:", emailResult.error);
      return res.status(500).json({
        status: 500,
        message: "Échec de l'envoi de l'email OTP. Veuillez réessayer.",
        error: emailResult.error,
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Un code OTP a été envoyé à votre adresse email.",
      data: { email, otpExpiryMinutes: otpExpiry },
    });
  } catch (error) {
    console.error("❌ Erreur login:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur interne du serveur.",
      error: error.message,
    });
  }
}

// ─── VERIFY OTP ───────────────────────────────────────────────────
async function verifyOtp(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(404).json({
        status: 404,
        message: "Email et code OTP requis.",
      });
    }

    const storedOtp = otpStore.get(email.toLowerCase());

    if (!storedOtp) {
      return res.status(404).json({
        status: 404,
        message: "Aucun code OTP trouvé. Veuillez vous reconnecter.",
      });
    }

    if (Date.now() > storedOtp.expiresAt) {
      otpStore.delete(email.toLowerCase());
      return res.status(404).json({
        status: 404,
        message: "Le code OTP a expiré. Veuillez vous reconnecter.",
      });
    }

    if (storedOtp.attempts >= 5) {
      otpStore.delete(email.toLowerCase());
      return res.status(404).json({
        status: 404,
        message: "Trop de tentatives. Veuillez vous reconnecter.",
      });
    }

    if (storedOtp.code !== otp) {
      storedOtp.attempts += 1;
      return res.status(404).json({
        status: 404,
        message: "Code OTP incorrect.",
        attemptsRemaining: 5 - storedOtp.attempts,
      });
    }

    const result = await executeQuery(
      `SELECT * FROM viewUsersPartners WHERE email = @email`,
      { email: { type: sql.NVarChar, value: email } },
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Utilisateur introuvable.",
      });
    }

    const user = result.recordset[0];

    // ✅ OTP validé → on met isValid = 1 en base
    await updateUserOTP(email, otp, 1);

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      msisdn: user.msisdn,
      idBanqueExterne: user.idBanqueExterne,
      partnerName: user.Partenaire || null,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    });

    otpStore.delete(email.toLowerCase());

    return res.status(200).json({
      status: 200,
      message: "Connexion réussie.",
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          msisdn: user.msisdn,
          idBanqueExterne: user.idBanqueExterne,
          btEnabled: user.btEnabled,
          partnerName: user.Partenaire || null,
        },
      },
    });
  } catch (error) {
    console.error("❌ Erreur verify-otp:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur interne du serveur.",
      error: error.message,
    });
  }
}

// ─── RESEND OTP ───────────────────────────────────────────────────
async function resendOtp(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(404).json({
        status: 404,
        message: "Email requis.",
      });
    }

    const result = await executeQuery(
      `SELECT * FROM viewUsersPartners WHERE email = @email`,
      { email: { type: sql.NVarChar, value: email } },
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Utilisateur introuvable.",
      });
    }

    const user = result.recordset[0];
    const otpLength = parseInt(process.env.OTP_LENGTH, 10) || 4;
    const otpExpiry = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
    const otpCode = generateOtp(otpLength);

    otpStore.set(email.toLowerCase(), {
      code: otpCode,
      expiresAt: Date.now() + otpExpiry * 60 * 1000,
      userId: user.id,
      attempts: 0,
    });

    // ✅ Nouvel OTP généré → isValid = null
    await updateUserOTP(email, otpCode, null);

    const userName = user.name || "Partenaire";
    const emailResult = await sendOtpEmail(email, otpCode, userName);

    if (!emailResult.success) {
      return res.status(500).json({
        status: 500,
        message: "Échec du renvoi de l'email OTP.",
        error: emailResult.error,
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Un nouveau code OTP a été envoyé.",
      data: { email, otpExpiryMinutes: otpExpiry },
    });
  } catch (error) {
    console.error("❌ Erreur resend-otp:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur interne du serveur.",
      error: error.message,
    });
  }
}

// ─── GET ME ───────────────────────────────────────────────────────
async function getMe(req, res) {
  try {
    const { email } = req.user;

    const result = await executeQuery(
      `SELECT * FROM viewUsersPartners WHERE email = @email`,
      { email: { type: sql.NVarChar, value: email } },
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Utilisateur introuvable.",
      });
    }

    const user = result.recordset[0];

    return res.status(200).json({
      status: 200,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        msisdn: user.msisdn,
        idBanqueExterne: user.idBanqueExterne,
        btEnabled: user.btEnabled,
        partnerName: user.Partenaire || null,
      },
    });
  } catch (error) {
    console.error("❌ Erreur getMe:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur interne du serveur.",
      error: error.message,
    });
  }
}

// ─── ADD USER ─────────────────────────────────────────────────────
async function addUser(req, res) {
  try {
    const { email, password, name, msisdn, idBanqueExterne } = req.body;

    if (!email || !password || !name || !msisdn || !idBanqueExterne) {
      return res.status(404).json({
        status: 404,
        message:
          "Tous les champs sont obligatoires : email, password, name, msisdn, idBanqueExterne.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const pool = await getPool();
    const result = await pool
      .request()
      .input("email", sql.NVarChar(255), email)
      .input("name", sql.NVarChar(100), name)
      .input("password", sql.NVarChar(255), hashedPassword)
      .input("msisdn", sql.NVarChar(50), msisdn)
      .input("idBanqueExterne", sql.Int, parseInt(idBanqueExterne))
      .execute("usp_addUserPartner");

    const procResult = result.recordset?.[0] ?? null;
    console.log("📦 Résultat procédure:", procResult);

    return res.status(201).json({
      status: 200,
      message: procResult?.message ?? "Utilisateur créé avec succès.",
      data: procResult ?? { email, name, msisdn, idBanqueExterne },
    });
  } catch (error) {
    console.error("❌ Erreur addUser:", error.message);

    if (
      error.message.includes("EMAIL_ALREADY_EXISTS") ||
      error.message.includes("duplicate") ||
      error.message.includes("Violation of UNIQUE")
    ) {
      return res.status(404).json({
        status: 404,
        message: "Un utilisateur avec cet email existe déjà.",
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Erreur lors de la création de l'utilisateur.",
      error: error.message,
    });
  }
}

// ─── GET ALL USERS ────────────────────────────────────────────────
async function getAllUsersPartners(req, res) {
  try {
    const result = await executeQuery(
      `SELECT 
        id,
        email,
        name,
        msisdn,
        idBanqueExterne,
        btEnabled,
        dtCreated,
        Partenaire AS partnerName
       FROM viewUsersPartners
       ORDER BY dtCreated DESC`,
    );

    return res.status(200).json({
      status: 200,
      data: {
        total: result.recordset.length,
        users: result.recordset,
      },
    });
  } catch (error) {
    console.error("❌ Erreur getAllUsersPartners:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur lors de la récupération des utilisateurs.",
      error: error.message,
    });
  }
}

module.exports = {
  login,
  verifyOtp,
  resendOtp,
  getMe,
  addUser,
  getAllUsersPartners,
};
