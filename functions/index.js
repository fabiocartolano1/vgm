// Proxy RAWG : la clé RAWG_API_KEY (secret Firebase, jamais dans le code ni
// livrée au navigateur) reste entièrement côté serveur. Le client (app.js)
// appelle cette fonction via functions.httpsCallable("rawgProxy") au lieu
// d'appeler api.rawg.io directement.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const RAWG_API_KEY = defineSecret("RAWG_API_KEY");
const RAWG_BASE = "https://api.rawg.io/api/games";

// Surface volontairement restreinte : seuls la liste des jeux et le détail
// d'un jeu par id sont exposés, avec seulement les paramètres dont app.js a
// besoin. On ne proxifie pas un chemin/paramètre arbitraire de l'API RAWG.
const ALLOWED_QUERY_KEYS = ["page_size", "page", "platforms", "ordering", "exclude_additions"];

function buildRawgUrl(path, query, key) {
  if (path !== "" && !/^\/\d+$/.test(path)) {
    throw new HttpsError("invalid-argument", "Chemin RAWG non autorisé.");
  }
  const params = new URLSearchParams();
  for (const k of ALLOWED_QUERY_KEYS) {
    const v = query?.[k];
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  params.set("key", key);
  return `${RAWG_BASE}${path}?${params.toString()}`;
}

// invoker "public" : l'appel HTTP doit pouvoir atteindre la fonction depuis
// n'importe quel navigateur ; la vraie vérification d'identité se fait juste
// en dessous via request.auth (jeton Firebase). Explicite pour que chaque
// déploiement réapplique ce droit (un déploiement raté l'avait laissé absent).
exports.rawgProxy = onCall({ secrets: [RAWG_API_KEY], region: "us-central1", invoker: "public" }, async (request) => {
  // Le proxy consomme le quota RAWG du projet : réservé aux comptes connectés
  // (voir aussi firestore.rules, même logique côté base de données).
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Connecte-toi pour ouvrir un paquet.");
  }

  const path = request.data?.path ?? "";
  const query = request.data?.query ?? {};
  const url = buildRawgUrl(path, query, RAWG_API_KEY.value());

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    logger.error("RAWG injoignable", e);
    throw new HttpsError("unavailable", "RAWG injoignable.");
  }

  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) {
    logger.error("RAWG a répondu " + res.status, { path, query });
    return { status: res.status, body: null };
  }

  return { status: 200, body: await res.json() };
});
