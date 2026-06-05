const https = require("https");
const { URL } = require("url");

const VIGNETTE_DEV_BASE_URL =
  process.env.VIGNETTE_DEV_URL ||
  "https://devapivpc.ecash-guinee.com/api/paiementexterne";
const VIGNETTE_PROD_BASE_URL =
  process.env.VIGNETTE_PROD_URL ||
  "https://apivpccg.ecash-guinee.com/api/paiementexterne";
const VIGNETTE_SECRET = process.env.VIGNETTE_SECRET || "@@@cash!VGI12Q@/2023@!";
const VIGNETTE_INTERFACEID = process.env.VIGNETTE_INTERFACEID || "vcggnapi";
const VIGNETTE_BANQUE = process.env.VIGNETTE_BANQUE || "ECASH";
const VIGNETTE_TASK = process.env.VIGNETTE_TASK || "checkVignette";
const VIGNETTE_TOKEN =
  process.env.VIGNETTE_TOKEN ||
  "$2y$10$ysqlsrchTAnL11IYxu6tQe3na9ls392v7TAMnFKJicFKyqDXZdtSW";

function buildVignetteUrl(baseUrl, plaque) {
  const url = new URL(baseUrl);
  url.searchParams.set("secret", VIGNETTE_SECRET);
  url.searchParams.set("interfaceid", VIGNETTE_INTERFACEID);
  url.searchParams.set("banque", VIGNETTE_BANQUE);
  url.searchParams.set("task", VIGNETTE_TASK);
  url.searchParams.set("token", VIGNETTE_TOKEN);
  url.searchParams.set("plaque", plaque);
  return url.toString();
}

function fetchVignette(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20000 }, (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(body || "{}");
        } catch (error) {
          const parseError = new Error(
            "Réponse invalide de l'API vignette externe.",
          );
          parseError.response = body;
          return reject(parseError);
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          return resolve(parsed);
        }

        const externalError = new Error(
          `API externe a répondu ${res.statusCode}`,
        );
        externalError.statusCode = res.statusCode;
        externalError.response = parsed;
        return reject(externalError);
      });
    });

    req.on("error", (error) => reject(error));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Temps d'attente dépassé pour l'API vignette externe."));
    });
  });
}

function getVignetteBaseUrl(env) {
  return env === "prod" ? VIGNETTE_PROD_BASE_URL : VIGNETTE_DEV_BASE_URL;
}

async function callVignetteApi(env, plaque) {
  const baseUrl = getVignetteBaseUrl(env);
  const url = buildVignetteUrl(baseUrl, plaque);
  return await fetchVignette(url);
}

async function callDevVignetteApi(plaque) {
  return callVignetteApi("dev", plaque);
}

async function callProdVignetteApi(plaque) {
  return callVignetteApi("prod", plaque);
}

async function checkVignette(req, res) {
  const plaque = String(req.query.plaque || "").trim();
  const env = String(req.query.env || "dev").toLowerCase();

  if (!plaque) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Le numéro de plaque est requis.",
    });
  }

  if (!["dev", "prod"].includes(env)) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "L'environnement doit être 'dev' ou 'prod'.",
    });
  }

  try {
    const externalResponse = await callVignetteApi(env, plaque);
    const responseData = externalResponse?.result || externalResponse;

    return res.status(200).json({
      status: 200,
      success: true,
      message: `Vérification ${env.toUpperCase()} réussie.`,
      data: responseData,
      env,
      plaque,
    });
  } catch (error) {
    console.error("❌ Erreur vignette :", error.message);
    const statusCode = error.statusCode || 502;

    return res.status(statusCode).json({
      status: statusCode,
      success: false,
      message: "Erreur lors de l'appel à l'API vignette externe.",
      error: error.message,
      env,
      plaque,
      external: error.response || null,
    });
  }
}

module.exports = {
  callDevVignetteApi,
  callProdVignetteApi,
  checkVignette,
};
