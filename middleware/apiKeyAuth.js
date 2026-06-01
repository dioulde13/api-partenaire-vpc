/**
 * Middleware d'authentification par API Key fixe
 * Pour les partenaires externes - le token ne change jamais et n'expire pas
 */
function apiKeyAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({
      status: 401,
      success: false,
      message: "API Key manquante. Veuillez fournir 'x-api-key' dans les headers.",
    });
  }

  const VALID_API_KEY = "VPC-EXT-789-TOKEN-FIXED-2024";

  if (apiKey !== VALID_API_KEY) {
    return res.status(403).json({
      status: 403,
      success: false,
      message: "API Key invalide.",
    });
  }

  req.isExternal = true;
  next();
}

module.exports = apiKeyAuth;
