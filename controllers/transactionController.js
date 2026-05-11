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

// ─── Helper: build WHERE clause from filters ──────────────────────
function buildWhereClause(filters) {
  let where = " WHERE 1=1";
  const params = {};

  // ✅ Filtre par partenaire connecté (obligatoire)
  if (filters.partnerName) {
    where += " AND vcModeAchat = @partnerName";
    params.partnerName = { type: sql.NVarChar, value: filters.partnerName };
  }

  if (filters.startDate) {
    where += " AND CAST(dtCreated AS DATE) >= @startDate";
    params.startDate = { type: sql.Date, value: new Date(filters.startDate) };
  }
  if (filters.endDate) {
    where += " AND CAST(dtCreated AS DATE) <= @endDate";
    params.endDate = { type: sql.Date, value: new Date(filters.endDate) };
  }
  if (filters.reference) {
    where +=
      " AND (vcReference LIKE @reference OR ReferencePartenaire LIKE @reference)";
    params.reference = {
      type: sql.NVarChar,
      value: `%${filters.reference}%`,
    };
  }
  if (filters.phone) {
    where += " AND vcMsisdn LIKE @phone";
    params.phone = { type: sql.NVarChar, value: `%${filters.phone}%` };
  }

  return { where, params };
}

const SELECTED_COLUMNS = `
  id, vcType, dtCreated, vcMsisdn, mMontant, vcReference,
  ReferencePartenaire, vcChassi, vcPlaque, vcDescription,
  vcStatut, vcPlaqueNonFormat, vcNumVignetteComplet, vcModeAchat`;

// ─── GET /api/transactions ────────────────────────────────────────
// ✅ OPTIMISATION : pagination SQL (OFFSET/FETCH) au lieu de slice JS
async function getTransactions(req, res) {
  try {
    const {
      startDate,
      endDate,
      reference,
      phone,
      page = 1,
      limit = 10,
    } = req.query;

    // ✅ Récupère le nom du partenaire depuis le token JWT
    const partnerName = req.user?.partnerName || null;

    const { where, params } = buildWhereClause({
      partnerName,
      startDate,
      endDate,
      reference,
      phone,
    });

    const pageInt = Math.max(1, parseInt(page));
    const limitInt = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageInt - 1) * limitInt;

    // ── Count query ──────────────────────────────────────────────
    const countResult = await executeQuery(
      `SELECT COUNT(*) as total FROM viewTransactionsPartners${where}`,
      params,
    );
    const total = countResult.recordset[0].total;

    // ── Data query with SQL-level pagination ─────────────────────
    const dataParams = {
      ...params,
      offset: { type: sql.Int, value: offset },
      fetchLimit: { type: sql.Int, value: limitInt },
    };

    const dataResult = await executeQuery(
      `SELECT ${SELECTED_COLUMNS}
       FROM viewTransactionsPartners${where}
       ORDER BY dtCreated DESC
       OFFSET @offset ROWS FETCH NEXT @fetchLimit ROWS ONLY`,
      dataParams,
    );

    return res.status(200).json({
      status: 200,
      data: {
        transactions: dataResult.recordset,
        pagination: {
          total,
          page: pageInt,
          limit: limitInt,
          totalPages: Math.ceil(total / limitInt),
        },
      },
    });
  } catch (error) {
    console.error("❌ Erreur getTransactions:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur lors de la récupération des transactions.",
    });
  }
}

// ─── GET /api/transactions/search/:reference ──────────────────────
async function searchTransaction(req, res) {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(404).json({
        status: 404,
        message: "Référence requise.",
      });
    }

    // ✅ Filtre par partenaire connecté + recherche sur références
    const partnerName = req.user?.partnerName || null;
    const searchParams = {
      reference: { type: sql.NVarChar, value: reference },
    };

    let partnerFilter = '';
    if (partnerName) {
      partnerFilter = ' AND vcModeAchat = @partnerName';
      searchParams.partnerName = { type: sql.NVarChar, value: partnerName };
    }

    const result = await executeQuery(
      `SELECT * FROM viewTransactionsPartners 
       WHERE (vcReference = @reference OR ReferencePartenaire = @reference)${partnerFilter}`,
      searchParams,
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 404,
        message: `Aucune transaction trouvée pour la référence « ${reference} ».`,
      });
    }

    return res.status(200).json({
      status: 200,
      data: result.recordset[0],
    });
  } catch (error) {
    console.error("❌ Erreur searchTransaction:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur lors de la recherche de la transaction.",
    });
  }
}

// ─── GET /api/transactions/stats ──────────────────────────────────
// ✅ OPTIMISATION : agrégation SQL avec filtres (startDate, endDate)
async function getStats(req, res) {
  try {
    const { startDate, endDate } = req.query;

    // ✅ Récupère le nom du partenaire depuis le token JWT
    const partnerName = req.user?.partnerName || null;

    const { where, params } = buildWhereClause({
      partnerName,
      startDate,
      endDate,
    });

    const result = await executeQuery(
      `
      SELECT 
        ISNULL(SUM(CAST(mMontant AS FLOAT)), 0) AS totalMontant,
        COUNT(*)                                 AS totalTransactions,
        SUM(CASE 
          WHEN LOWER(vcStatut) LIKE '%valid%'
            OR LOWER(vcStatut) LIKE '%réussi%'
            OR LOWER(vcStatut) LIKE '%reussi%'
            OR LOWER(vcStatut) LIKE '%success%'
            OR LOWER(vcStatut) LIKE '%confirmé%'
            OR LOWER(vcStatut) LIKE '%confirme%'
          THEN 1 ELSE 0 END)                     AS reussies,
        SUM(CASE 
          WHEN LOWER(vcStatut) LIKE '%attente%'
            OR LOWER(vcStatut) LIKE '%pending%'
            OR LOWER(vcStatut) LIKE '%en cours%'
          THEN 1 ELSE 0 END)                     AS enAttente,
        SUM(CASE 
          WHEN LOWER(vcStatut) LIKE '%échec%'
            OR LOWER(vcStatut) LIKE '%echec%'
            OR LOWER(vcStatut) LIKE '%echoue%'
            OR LOWER(vcStatut) LIKE '%échoué%'
            OR LOWER(vcStatut) LIKE '%fail%'
            OR LOWER(vcStatut) LIKE '%annul%'
          THEN 1 ELSE 0 END)                     AS echecs
      FROM viewTransactionsPartners (NOLOCK)
      ${where}`,
      params,
    );

    const stats = result.recordset[0];

    return res.status(200).json({
      status: 200,
      data: {
        totalMontant: stats.totalMontant,
        reussies: stats.reussies,
        enAttente: stats.enAttente,
        echecs: stats.echecs,
        totalTransactions: stats.totalTransactions,
      },
    });
  } catch (error) {
    console.error("❌ Erreur getStats:", error.message);
    return res.status(500).json({
      status: 500,
      message: "Erreur lors de la récupération des statistiques.",
    });
  }
}

// ─── GET /api/transactions/export ────────────────────────────────
async function exportTransactions(req, res) {
  try {
    const { startDate, endDate, reference, phone } = req.query;

    // ✅ Récupère le nom du partenaire depuis le token JWT
    const partnerName = req.user?.partnerName || null;

    const { where, params } = buildWhereClause({
      partnerName,
      startDate,
      endDate,
      reference,
      phone,
    });

    const result = await executeQuery(
      `SELECT ${SELECTED_COLUMNS}
       FROM viewTransactionsPartners${where}
       ORDER BY dtCreated DESC`,
      params,
    );

    const transactions = result.recordset;

    if (transactions.length === 0) {
      return res.status(200).send("Aucune transaction à exporter.");
    }

    // ✅ En-têtes CSV avec les vrais noms de colonnes
    const headers = [
      "id",
      "vcType",
      "dtCreated",
      "vcMsisdn",
      "mMontant",
      "vcReference",
      "ReferencePartenaire",
      "vcChassi",
      "vcPlaque",
      "vcDescription",
      "vcStatut",
      "vcPlaqueNonFormat",
      "vcNumVignetteComplet",
      "vcModeAchat",
    ];

    const csvRows = [
      headers.join(";"),
      ...transactions.map((tx) =>
        headers
          .map((h) => {
            let val = tx[h];
            if (val instanceof Date) val = val.toLocaleString("fr-FR");
            return `"${(val ?? "").toString().replace(/"/g, '""')}"`;
          })
          .join(";"),
      ),
    ];

    const csvContent = "\uFEFF" + csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=transactions_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("❌ Erreur exportTransactions:", error.message);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de l'export des transactions.",
    });
  }
}

module.exports = {
  getTransactions,
  searchTransaction,
  getStats,
  exportTransactions,
};
