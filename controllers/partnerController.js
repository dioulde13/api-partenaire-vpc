const { getPool, sql } = require("../config/database");
require("dotenv").config();

// ─── Helper executeQuery ──────────────────────────────────────────
async function executeQuery(query, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  for (const [key, { type, value }] of Object.entries(params)) {
    request.input(key, type, value);
  }
  return request.query(query);
}

// ─── GET /api/partners/profile ────────────────────────────────────
async function getPartnerProfile(req, res) {
  try {
    const { email } = req.user;

    const userResult = await executeQuery(
      `SELECT * FROM viewUsersPartners WHERE email = @email`,
      { email: { type: sql.NVarChar, value: email } },
    );

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Utilisateur introuvable.",
      });
    }

    const user = userResult.recordset[0];

    // ✅ Récupérer le partenaire via idBanqueExterne → viewPartners.id
    let partner = null;
    if (user.idBanqueExterne) {
      const partnerResult = await executeQuery(
        `SELECT id, vcNom FROM viewPartners WHERE id = @id`,
        { id: { type: sql.Int, value: user.idBanqueExterne } },
      );
      if (partnerResult.recordset.length > 0) {
        partner = partnerResult.recordset[0];
      }
    }

    return res.status(200).json({
      status: 200,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          msisdn: user.msisdn,
          idBanqueExterne: user.idBanqueExterne,
          btEnabled: user.btEnabled,
          partnerName: user.Partenaire || null,
        },
        partner: partner
          ? {
            id: partner.id,
            vcNom: partner.vcNom, // ✅ colonne correcte
          }
          : null,
      },
    });
  } catch (error) {
    console.error("❌ Erreur getPartnerProfile:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur lors de la récupération du profil.",
    });
  }
}

// ─── GET /api/partners ────────────────────────────────────────────
async function getAllPartners(req, res) {
  try {
    // ✅ Sélectionner uniquement les colonnes existantes
    const result = await executeQuery(
      `SELECT id, vcNom FROM viewPartners ORDER BY vcNom ASC`,
    );

    return res.status(200).json({
      status: 200,
      data: {
        total: result.recordset.length,
        partners: result.recordset,
      },
    });
  } catch (error) {
    console.error("❌ Erreur getAllPartners:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur lors de la récupération des partenaires.",
    });
  }
}

module.exports = {
  getPartnerProfile,
  getAllPartners,
};
