const RAWG_BASE = "https://api.rawg.io/api/games";

// Consoles autorisées (voir consoles.txt) -> IDs plateformes RAWG.
const ALLOWED_PLATFORMS = [
  4,   // PC
  27,  // PlayStation 1
  15,  // PlayStation 2
  16,  // PlayStation 3
  18,  // PlayStation 4
  187, // PlayStation 5
  80,  // Xbox
  14,  // Xbox 360
  1,   // Xbox One
  186, // Xbox Series S/X
  7,   // Switch
  9,   // DS
  8,   // 3DS
  19,  // PS Vita
  17,  // PSP
  10,  // Wii U
  11,  // Wii
  105, // GameCube
  83,  // N64
  43,  // Game Boy Color
  24,  // Game Boy Advance
];
const ALLOWED_PLATFORMS_PARAM = ALLOWED_PLATFORMS.join(",");

const CARDS_PER_PACK = 5;

// Rareté basée sur "added" (nb réel de joueurs ayant ajouté le jeu sur RAWG),
// l'équivalent jeu vidéo des vues mensuelles d'un article Wikipédia.
// packOdds = chance que la MEILLEURE carte du paquet soit de cette rareté.
const RARITIES = [
  { key: "c",  label: "C",  name: "Commune",     color: "#b8f2d5", min: 0,    packOdds: 0.575 },
  { key: "pc", label: "PC", name: "Peu commune", color: "#b1cff2", min: 20,   packOdds: 0.15 },
  { key: "r",  label: "R",  name: "Rare",        color: "#c6a7f2", min: 80,   packOdds: 0.14 },
  { key: "sr", label: "SR", name: "Super rare",  color: "#ed6fa3", min: 300,  packOdds: 0.08 },
  { key: "ur", label: "UR", name: "Ultra rare",  color: "#fa9931", min: 1200, packOdds: 0.04 },
  { key: "l",  label: "L",  name: "Légendaire",  color: "#ffe144", min: 6000, packOdds: 0.015 },
];
const RARITY_BY_KEY = Object.fromEntries(RARITIES.map((r) => [r.key, r]));
const RARITY_ORDER = Object.fromEntries(RARITIES.map((r, i) => [r.key, i]));

// Plus rare en premier ; à rareté égale, garde l'ordre d'arrivée (tri stable
// sur des cartes déjà triées par packedAt desc).
function sortByRarityDesc(cards) {
  return cards.slice().sort((a, b) => (RARITY_ORDER[b.rarityKey] ?? -1) - (RARITY_ORDER[a.rarityKey] ?? -1));
}

// Genres RAWG (slug -> libellé FR). Le slug est gardé sur la carte pour
// pouvoir filtrer la collection par catégorie plus tard.
const GENRE_LABELS = {
  action: "Action",
  adventure: "Aventure",
  "role-playing-games-rpg": "RPG",
  strategy: "Stratégie",
  shooter: "Tir",
  casual: "Casual",
  simulation: "Simulation",
  puzzle: "Puzzle",
  arcade: "Arcade",
  platformer: "Plateforme",
  "massively-multiplayer": "MMO",
  racing: "Course",
  sports: "Sport",
  fighting: "Combat",
  family: "Famille",
  "board-games": "Jeu de société",
  card: "Cartes",
  educational: "Éducatif",
  indie: "Indé",
};
const MAX_GENRES_PER_CARD = 3;

// Garantie : au moins une carte Rare (ou mieux) par paquet.
const GUARANTEED_TIER = RARITIES.findIndex((r) => r.key === "r");

// Chance par carte déduite de la chance par paquet :
// P(meilleure >= k) = 1 - (1 - p(carte >= k))^5
(function computeCardOdds() {
  let packAtLeast = 0;
  let cardAtLeastAbove = 0;
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    packAtLeast += RARITIES[i].packOdds;
    const cardAtLeast = 1 - Math.pow(1 - Math.min(packAtLeast, 1), 1 / CARDS_PER_PACK);
    RARITIES[i].cardOdds = cardAtLeast - cardAtLeastAbove;
    cardAtLeastAbove = cardAtLeast;
  }
})();

// Par console, nb de jeux (triés par -added, pagination RAWG plafonnée à 10 000)
// ayant added >= [20, 80, 300, 1200, 6000], précalculé le 2026-09-27.
// Format : [accessibles, >=20, >=80, >=300, >=1200, >=6000]
const TIER_RANKS = {
  4:   [10000, 10000, 10000, 6950, 2267, 290],
  27:  [1699, 586, 258, 100, 33, 1],
  15:  [3151, 967, 534, 235, 76, 9],
  16:  [3209, 1940, 1442, 938, 486, 102],
  18:  [7050, 4656, 3505, 2236, 1083, 189],
  187: [1565, 1116, 804, 453, 183, 27],
  80:  [881, 435, 280, 143, 61, 9],
  14:  [2834, 1837, 1411, 901, 481, 110],
  1:   [5750, 3929, 3101, 2062, 1064, 192],
  186: [1301, 965, 732, 432, 171, 21],
  7:   [5807, 3546, 2570, 1502, 652, 98],
  9:   [2507, 447, 245, 104, 33, 3],
  8:   [1682, 468, 275, 130, 51, 3],
  19:  [1462, 781, 580, 340, 143, 23],
  17:  [1457, 409, 226, 102, 26, 0],
  10:  [1114, 533, 368, 208, 84, 15],
  11:  [2238, 743, 440, 201, 62, 4],
  105: [673, 342, 202, 83, 28, 2],
  83:  [363, 146, 73, 32, 10, 1],
  43:  [431, 117, 49, 23, 6, 0],
  24:  [967, 358, 185, 69, 14, 0],
};

// TIER_RANKS a été calculé avec les DLC/extensions inclus dans le total de
// chaque console ; exclude_additions (voir drawOneGameAttempt) réduit le
// nombre réel de pages disponibles, surtout sur les consoles récentes très
// chargées en DLC (PC, PS4/5, Xbox One/Series, Switch). Le plafond appris
// via platformAccessible corrige ça une fois qu'on a détecté un dépassement,
// pour ne plus retomber sur des rangs hors limites (404 en boucle).
const platformAccessible = {};

// Plage de rangs [start, end) de la rareté d'index i sur une console.
function tierRange(platformId, i) {
  const t = TIER_RANKS[platformId];
  const cap = Math.min(t[0], platformAccessible[platformId] ?? Infinity);
  const end = Math.min(t[i] ?? 0, cap);
  const start = Math.min(t[i + 1] ?? 0, end);
  return [start, end];
}

// Lit le nombre réel de jeux (hors DLC) pour une console via le champ
// "count" de RAWG, et met à jour le plafond pour tous les tirages suivants.
async function learnAccessibleCount(platformId) {
  try {
    const url = `${RAWG_BASE}?key=${RAWG_API_KEY}&page_size=1&page=1&platforms=${platformId}&ordering=-added&exclude_additions=true`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (typeof data.count === "number") platformAccessible[platformId] = data.count;
  } catch (e) {
    console.error("Comptage RAWG impossible pour la plateforme " + platformId, e);
  }
}

// ---------- Pack storage (en mémoire seulement pour le POC) ----------
// Pas de persistance volontairement : un refresh remet les 10 paquets à disposition.

const MAX_PACKS = 10;
const REGEN_MS = 10 * 60 * 1000;

let packState = { count: MAX_PACKS, nextRegenAt: null };

function tickRegen() {
  const now = Date.now();
  while (packState.count < MAX_PACKS && packState.nextRegenAt && now >= packState.nextRegenAt) {
    packState.count++;
    packState.nextRegenAt = packState.count < MAX_PACKS ? packState.nextRegenAt + REGEN_MS : null;
  }
  renderHome();
}

function consumePack() {
  packState.count--;
  if (packState.nextRegenAt === null) {
    packState.nextRegenAt = Date.now() + REGEN_MS;
  }
}

// ---------- DOM refs ----------

const homeEl = document.getElementById("home");
const packEl = document.getElementById("pack");
const openBtn = document.getElementById("open-btn");
const counterEl = document.getElementById("counter");
const regenEl = document.getElementById("regen");
const howLink = document.getElementById("how-link");
const howModal = document.getElementById("how-modal");
const howClose = document.getElementById("how-close");

const revealEl = document.getElementById("reveal");
const cardCounterEl = document.getElementById("card-counter");
const cardStageEl = document.getElementById("card-stage");
const cardEl = document.getElementById("card");
const fireworksEl = document.getElementById("fireworks");
const dotsEl = document.getElementById("dots");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const continueBtn = document.getElementById("continue-btn");

const userSelectEl = document.getElementById("user-select");
const tabPackBtn = document.getElementById("tab-pack-btn");
const tabCollectionBtn = document.getElementById("tab-collection-btn");
const tabPackEl = document.getElementById("tab-pack");
const tabCollectionEl = document.getElementById("tab-collection");
const collectionHintEl = document.getElementById("collection-hint");
const collectionFiltersEl = document.getElementById("collection-filters");
const collectionStatusEl = document.getElementById("collection-status");
const collectionGridEl = document.getElementById("collection-grid");
const toastEl = document.getElementById("toast");

// ---------- Utilisateur (POC : pas d'authentification, juste une étiquette
// choisie dans le menu et gardée sur cet appareil pour ne pas la redemander) ----------

const USERS = ["fabio", "raph", "thibaut", "zaven"];

let currentUser = localStorage.getItem("vgm_user") || "";
if (!USERS.includes(currentUser)) currentUser = "";
userSelectEl.value = currentUser;

userSelectEl.addEventListener("change", () => {
  currentUser = userSelectEl.value;
  localStorage.setItem("vgm_user", currentUser);
  renderHome();
  if (activeTab === "collection") loadCollection();
});

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function renderHome() {
  if (!currentUser) {
    counterEl.textContent = "Choisis ton pseudo pour ouvrir un paquet";
    regenEl.textContent = "";
  } else {
    counterEl.textContent = `${packState.count} / ${MAX_PACKS} paquets disponibles`;
    regenEl.textContent =
      packState.count < MAX_PACKS && packState.nextRegenAt
        ? `Prochain dans ${fmtTime(packState.nextRegenAt - Date.now())}`
        : "";
  }
  openBtn.disabled = packState.count <= 0 || !poolsReady || !currentUser;
}

setInterval(tickRegen, 1000);

// ---------- Onglets Ouvrir / Collection ----------

let activeTab = "pack";

function setActiveTab(tab) {
  activeTab = tab;
  tabPackBtn.classList.toggle("active", tab === "pack");
  tabPackBtn.setAttribute("aria-selected", String(tab === "pack"));
  tabCollectionBtn.classList.toggle("active", tab === "collection");
  tabCollectionBtn.setAttribute("aria-selected", String(tab === "collection"));
  tabPackEl.classList.toggle("hidden", tab !== "pack");
  tabCollectionEl.classList.toggle("hidden", tab !== "collection");
  if (tab === "collection") loadCollection();
}

tabPackBtn.addEventListener("click", () => setActiveTab("pack"));
tabCollectionBtn.addEventListener("click", () => setActiveTab("collection"));

// ---------- Toast (erreurs de sauvegarde/chargement Firestore) ----------

let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 4000);
}

// ---------- RAWG fetching ----------

let poolsReady = false;

async function checkApi() {
  try {
    const res = await fetch(`${RAWG_BASE}?key=${RAWG_API_KEY}&page_size=1&platforms=${ALLOWED_PLATFORMS_PARAM}`);
    if (!res.ok) throw new Error(res.status);
    poolsReady = true;
  } catch (e) {
    console.error("RAWG indisponible", e);
    counterEl.textContent = "Erreur de connexion à RAWG.";
  }
  renderHome();
}

async function fetchGameDetail(id) {
  const res = await fetch(`${RAWG_BASE}/${id}?key=${RAWG_API_KEY}`);
  if (!res.ok) return null;
  return res.json();
}

// Les images RAWG (media.rawg.io) sont souvent en pleine résolution (plusieurs
// centaines de Ko à quelques Mo) : sur mobile, en charger plusieurs dizaines
// d'un coup (paquet, collection) est ce qui rend l'app lente à charger. Le CDN
// de RAWG accepte un redimensionnement à la volée via un segment /resize/<w>/-/
// dans l'URL (utilisé par rawg.io lui-même pour ses vignettes) : on l'utilise
// à l'affichage, sans toucher à l'URL d'origine stockée sur la carte/Firestore.
// Si l'URL n'a pas la forme attendue, on retombe simplement sur l'originale.
function rawgThumbnail(url, width) {
  if (!url) return url;
  const m = /^https:\/\/media\.rawg\.io\/media\/(games\/.*)$/.exec(url);
  return m ? `https://media.rawg.io/media/resize/${width}/-/${m[1]}` : url;
}
const REVEAL_IMAGE_WIDTH = 640;
const MINI_CARD_IMAGE_WIDTH = 300;

// ---------- Bonus rareté Wikipédia ----------
// RAWG sous-estime les classiques trop vieux pour être "ajoutés" par la
// communauté RAWG (ex. Space Invaders : quasi toujours tiré en Commune côté
// RAWG, alors que son article Wikipédia reste massivement consulté). On ne
// touche pas au tirage (quelle carte sort, avec quelle probabilité) : on
// vérifie juste, une fois le jeu tiré, si Wikipédia le traite comme un
// classique, et si oui on relève l'étiquette de rareté affichée.
// Best-effort : Wikipédia hors service, jeu introuvable, ou trop lent ->
// on ne bonifie simplement rien, la carte garde sa rareté RAWG normale.
//
// Seuil choisi à vue de nez (~1000 vues/jour en moyenne sur 60 jours) faute
// de pouvoir tester en conditions réelles depuis cet environnement (accès à
// Wikipédia bloqué ici) ; à ajuster si trop/pas assez de cartes en profitent.
const WIKIPEDIA_FAME_THRESHOLD = 60000;
const WIKIPEDIA_TIMEOUT_MS = 4000;

function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

async function fetchWikipediaViews(name) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&prop=pageviews&generator=search&gsrlimit=1` +
    `&gsrsearch=${encodeURIComponent(name + " video game")}&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return 0;
  const data = await res.json();
  const views = data?.query?.pages?.[0]?.pageviews;
  if (!views) return 0;
  return Object.values(views).reduce((sum, v) => sum + (v || 0), 0);
}

async function isWikipediaClassic(name) {
  try {
    const views = await withTimeout(fetchWikipediaViews(name), WIKIPEDIA_TIMEOUT_MS, 0);
    return views >= WIKIPEDIA_FAME_THRESHOLD;
  } catch (e) {
    console.error("Wikipédia indisponible pour " + name, e);
    return false;
  }
}

function truncate(text, max) {
  if (!text) return "Pas de description disponible.";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trim() + "…" : clean;
}

function rollTierIndex() {
  let r = Math.random();
  for (let i = RARITIES.length - 1; i > 0; i--) {
    r -= RARITIES[i].cardOdds;
    if (r < 0) return i;
  }
  return 0;
}

// Console au hasard (chance égale) parmi celles qui ont des jeux de cette rareté,
// puis un jeu au hasard dans la tranche du classement correspondante.
// Les DLC / extensions sont exclus : exclude_additions côté liste, et
// parents_count côté détail en filet de sécurité (un DLC a un jeu parent).
const MAX_DRAW_ATTEMPTS = 5;

async function drawOneGameAttempt(tierIndex) {
  const eligible = ALLOWED_PLATFORMS.filter((p) => {
    const [start, end] = tierRange(p, tierIndex);
    return end > start;
  });
  const platformId = eligible[Math.floor(Math.random() * eligible.length)];
  const [start, end] = tierRange(platformId, tierIndex);
  const rank = start + Math.floor(Math.random() * (end - start));
  const url = `${RAWG_BASE}?key=${RAWG_API_KEY}&page_size=1&page=${rank + 1}&platforms=${platformId}&ordering=-added&exclude_additions=true`;
  const res = await fetch(url);
  if (res.status === 404) {
    // Rang au-delà du total réel (hors DLC) -> on apprend le vrai plafond
    // pour cette console (une seule fois) et on retente avec une plage corrigée.
    if (!(platformId in platformAccessible)) await learnAccessibleCount(platformId);
    return null;
  }
  if (!res.ok) throw new Error("RAWG error " + res.status);
  const data = await res.json();
  const game = (data.results || [])[0];
  if (!game) return null;
  const detail = await fetchGameDetail(game.id);
  if (detail && detail.parents_count > 0) return null;
  return { game, detail };
}

async function drawOneGame(tierIndex) {
  for (let i = 0; i < MAX_DRAW_ATTEMPTS; i++) {
    const drawn = await drawOneGameAttempt(tierIndex);
    if (drawn) return { ...drawn, tierIndex };
  }
  return null;
}

// Charge et décode l'image avant l'affichage de la carte (false si absente,
// en erreur ou plus lente que timeoutMs : la carte affichera le logo).
const IMAGE_PRELOAD_TIMEOUT_MS = 8000;
const preloadedImages = [];

function preloadImage(src, timeoutMs = IMAGE_PRELOAD_TIMEOUT_MS) {
  if (!src) return Promise.resolve(false);
  const img = new Image();
  preloadedImages.push(img); // garde une référence pour que le cache reste chaud
  if (preloadedImages.length > CARDS_PER_PACK * 2) preloadedImages.shift();
  const loaded = new Promise((resolve) => {
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(true));
    img.onerror = () => resolve(false);
  });
  img.src = src;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([loaded, timeout]);
}

async function drawPack() {
  const tiers = Array.from({ length: CARDS_PER_PACK }, rollTierIndex);
  // Pas de Rare ou mieux -> une carte passe Rare. Les chances de SR/UR/L ne
  // changent pas, seul le cas "meilleure carte C/PC" devient "meilleure carte R".
  if (Math.max(...tiers) < GUARANTEED_TIER) tiers[tiers.length - 1] = GUARANTEED_TIER;
  const drawn = (await Promise.all(tiers.map(drawOneGame))).filter(Boolean);
  const games = drawn.map((d) => d.game);
  const details = drawn.map((d) => d.detail);

  const cards = games.map((g, i) => {
    const detail = details[i] || g;
    const added = g.added || 0;
    // Rareté = tranche tirée (et non recalculée depuis "added") : les tranches
    // de TIER_RANKS incluaient les DLC, un recalcul pourrait casser la garantie.
    const rarity = RARITIES[drawn[i].tierIndex];
    const atk = detail.metacritic ?? Math.round((detail.rating || 0) * 20);
    const def = Math.min(100, Math.round(Math.log10(added + 1) * 40));
    const platforms = (detail.platforms || g.platforms || [])
      .map((p) => p.platform.name)
      .join(" · ");
    const genres = (detail.genres || g.genres || [])
      .slice(0, MAX_GENRES_PER_CARD)
      .map((genre) => ({ slug: genre.slug, label: GENRE_LABELS[genre.slug] || genre.name }));
    return {
      name: g.name,
      image: g.background_image,
      platforms: platforms || "Plateforme inconnue",
      genres,
      summary: truncate(detail.description_raw, 160),
      rarity,
      atk,
      def,
    };
  });

  await Promise.all([
    ...cards.map(async (card) => {
      card.imageReady = await preloadImage(rawgThumbnail(card.image, REVEAL_IMAGE_WIDTH));
    }),
    ...cards.map(async (card) => {
      if (card.rarity.key === "l") return; // déjà au maximum, rien à vérifier
      if (await isWikipediaClassic(card.name)) card.rarity = RARITIES[RARITIES.length - 1];
    }),
  ]);

  cards.sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
  return cards;
}

// ---------- Collection (Firestore) ----------
// users/{user}/cards/{id} : append-only (voir firestore.rules), une carte
// par jeu obtenu. Pas d'authentification : "user" n'est qu'une étiquette.

// Ne doit jamais faire planter openPack() : une erreur ici (Firestore mal
// initialisé, SDK bloqué par un ad-blocker...) ne doit pas empêcher la
// révélation d'un paquet déjà tiré et décompté.
function saveCardsToFirestore(cards, user) {
  if (!window.db || !user) return;
  try {
    const ref = db.collection("users").doc(user).collection("cards");
    const packedAt = firebase.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    for (const card of cards) {
      batch.set(ref.doc(), {
        name: card.name,
        image: card.image || null,
        platforms: card.platforms,
        genres: card.genres,
        summary: card.summary,
        rarityKey: card.rarity.key,
        atk: card.atk,
        def: card.def,
        packedAt,
      });
    }
    batch.commit().catch((e) => {
      console.error("Sauvegarde Firestore impossible", e);
      showToast("Paquet ouvert, mais la sauvegarde a échoué. Vérifie ta connexion.");
    });
  } catch (e) {
    console.error("Sauvegarde Firestore impossible", e);
    showToast("Paquet ouvert, mais la sauvegarde a échoué. Vérifie ta connexion.");
  }
}

let collectionCache = { user: null, cards: null };
const activeGenreFilters = new Set();

async function loadCollection() {
  if (!currentUser) {
    collectionHintEl.textContent = "Choisis ton pseudo pour voir ta collection.";
    collectionHintEl.classList.remove("hidden");
    collectionFiltersEl.classList.add("hidden");
    collectionStatusEl.classList.add("hidden");
    collectionGridEl.innerHTML = "";
    return;
  }
  collectionHintEl.classList.add("hidden");

  if (!window.db) {
    collectionStatusEl.textContent = "Firestore indisponible.";
    collectionStatusEl.classList.remove("hidden");
    return;
  }

  if (collectionCache.user === currentUser) {
    renderCollection();
    return;
  }

  activeGenreFilters.clear();
  collectionFiltersEl.classList.add("hidden");
  collectionGridEl.innerHTML = "";
  collectionStatusEl.textContent = "Chargement de la collection…";
  collectionStatusEl.classList.remove("hidden");

  try {
    const snap = await db
      .collection("users")
      .doc(currentUser)
      .collection("cards")
      .orderBy("packedAt", "desc")
      .get();
    collectionCache = { user: currentUser, cards: sortByRarityDesc(snap.docs.map((d) => d.data())) };
  } catch (e) {
    console.error("Chargement de la collection impossible", e);
    collectionStatusEl.textContent = "Erreur de chargement de la collection.";
    collectionCache = { user: currentUser, cards: [] };
    return;
  }

  renderCollection();
}

function buildGenreFilters(cards) {
  const genres = new Map();
  for (const card of cards) {
    for (const g of card.genres || []) if (!genres.has(g.slug)) genres.set(g.slug, g.label);
  }

  collectionFiltersEl.innerHTML = "";
  collectionFiltersEl.classList.toggle("hidden", genres.size === 0);
  for (const [slug, label] of genres) {
    const chip = document.createElement("button");
    chip.className = "filter-chip" + (activeGenreFilters.has(slug) ? " active" : "");
    chip.textContent = label;
    chip.addEventListener("click", () => {
      if (activeGenreFilters.has(slug)) activeGenreFilters.delete(slug);
      else activeGenreFilters.add(slug);
      renderCollection();
    });
    collectionFiltersEl.appendChild(chip);
  }
}

// Charge l'image d'une mini-carte seulement quand elle approche de l'écran :
// avec des dizaines de cartes dans la collection, tout charger d'un coup en
// pleine résolution est ce qui rendait l'onglet très lent sur mobile.
function handleMiniCardIntersect(entries, observer) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    // On observe le conteneur (.mini-card-img), pas l'<img> : celle-ci est en
    // display:none tant qu'elle n'a pas chargé (voir CSS "no-image"), donc
    // sans box elle n'entre jamais en intersection.
    const img = entry.target.querySelector("img");
    if (img && img.dataset.src) img.src = img.dataset.src;
    observer.unobserve(entry.target);
  }
}

function buildMiniCard(card, imgObserver) {
  const rarity = RARITY_BY_KEY[card.rarityKey];
  const el = document.createElement("div");
  el.className = "mini-card";
  el.style.setProperty("--rarity-color", rarity ? rarity.color : "#888");

  const badge = document.createElement("div");
  badge.className = "mini-card-badge";
  badge.style.background = rarity ? rarity.color : "#888";
  badge.textContent = rarity ? rarity.label : "?";
  el.appendChild(badge);

  const imgWrap = document.createElement("div");
  imgWrap.className = "mini-card-img no-image";
  const logo = document.createElement("div");
  logo.className = "pack-logo card-logo";
  logo.textContent = "VGM";
  imgWrap.appendChild(logo);
  if (card.image) {
    const img = document.createElement("img");
    img.alt = "";
    img.addEventListener("load", () => imgWrap.classList.remove("no-image"));
    img.addEventListener("error", () => img.remove());
    const thumb = rawgThumbnail(card.image, MINI_CARD_IMAGE_WIDTH);
    if (imgObserver) {
      img.dataset.src = thumb;
      imgObserver.observe(imgWrap);
    } else {
      img.src = thumb; // pas d'IntersectionObserver disponible -> chargement immédiat
    }
    imgWrap.appendChild(img);
  }
  el.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "mini-card-body";
  const name = document.createElement("div");
  name.className = "mini-card-name";
  name.textContent = card.name;
  body.appendChild(name);
  el.appendChild(body);

  return el;
}

function renderCollection() {
  const cards = collectionCache.cards || [];
  buildGenreFilters(cards);

  if (cards.length === 0) {
    collectionStatusEl.textContent = "Aucune carte pour l'instant. Ouvre un paquet !";
    collectionStatusEl.classList.remove("hidden");
    collectionGridEl.innerHTML = "";
    return;
  }

  const filtered = activeGenreFilters.size
    ? cards.filter((c) => (c.genres || []).some((g) => activeGenreFilters.has(g.slug)))
    : cards;

  if (filtered.length === 0) {
    collectionStatusEl.textContent = "Aucune carte pour cette catégorie.";
    collectionStatusEl.classList.remove("hidden");
    collectionGridEl.innerHTML = "";
    return;
  }

  collectionStatusEl.classList.add("hidden");
  collectionGridEl.innerHTML = "";
  const imgObserver = window.IntersectionObserver
    ? new IntersectionObserver(handleMiniCardIntersect, { rootMargin: "400px 0px" })
    : null;
  for (const card of filtered) collectionGridEl.appendChild(buildMiniCard(card, imgObserver));
}

// ---------- Reveal UI ----------

let currentCards = [];
let currentIndex = 0;

function buildDots() {
  dotsEl.innerHTML = "";
  for (let i = 0; i < CARDS_PER_PACK; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    dotsEl.appendChild(d);
  }
}

function updateDots() {
  [...dotsEl.children].forEach((d, i) => {
    d.classList.toggle("done", i < currentIndex);
    d.classList.toggle("current", i === currentIndex);
  });
}

function spawnFireworks() {
  fireworksEl.innerHTML = "";
  const flash = document.createElement("div");
  flash.className = "fw-flash";
  fireworksEl.appendChild(flash);
  setTimeout(() => flash.remove(), 1400);

  const colors = ["#ffe144", "#fa9931", "#fff", "#ffd166"];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("div");
    p.className = "fw-particle";
    const angle = Math.random() * 360;
    const dist = 80 + Math.random() * 160;
    const delay = Math.random() * 0.2;
    p.style.setProperty("--crfs-angle", `${angle}deg`);
    p.style.setProperty("--crfs-dist", `${dist}px`);
    p.style.setProperty("--crfs-delay", `${delay}s`);
    p.style.setProperty("--fw-color", colors[Math.floor(Math.random() * colors.length)]);
    fireworksEl.appendChild(p);
    setTimeout(() => p.remove(), 1600);
  }
}

// Pas d'image (ou image cassée) -> logo VGM à la place.
// Image préchargée à l'ouverture du paquet -> affichée tout de suite.
// Sinon (pas d'image, erreur, trop lente) logo, puis l'image si elle finit par arriver.
function setCardImage(card) {
  const top = cardEl.querySelector(".card-face-top");
  const src = rawgThumbnail(card.image, REVEAL_IMAGE_WIDTH);
  if (card.imageReady) {
    top.style.backgroundImage = `url('${src}')`;
    top.classList.remove("no-image");
    return;
  }
  top.style.backgroundImage = "none";
  top.classList.add("no-image");
  if (!card.image) return;
  const img = new Image();
  img.onload = () => {
    if (currentCards[currentIndex] !== card) return; // la carte affichée a changé entre-temps
    top.style.backgroundImage = `url('${src}')`;
    top.classList.remove("no-image");
  };
  img.src = src;
}

function renderCard(index) {
  const card = currentCards[index];
  cardCounterEl.textContent = `Carte ${index + 1} / ${CARDS_PER_PACK}`;

  cardEl.style.setProperty("--rarity-color", card.rarity.color);
  setCardImage(card);
  cardEl.querySelector(".card-title").textContent = card.name;
  cardEl.querySelector(".card-platforms").textContent = card.platforms;
  const tagsEl = cardEl.querySelector(".card-tags");
  tagsEl.innerHTML = "";
  for (const genre of card.genres) {
    const tag = document.createElement("span");
    tag.className = "card-tag";
    tag.dataset.genre = genre.slug;
    tag.textContent = genre.label;
    tagsEl.appendChild(tag);
  }
  tagsEl.hidden = card.genres.length === 0;
  cardEl.querySelector(".card-summary").textContent = card.summary;
  cardEl.querySelector(".card-badge").textContent = card.rarity.label;
  cardEl.querySelector(".card-badge").style.background = card.rarity.color;
  cardEl.querySelector(".atk-val").textContent = card.atk;
  cardEl.querySelector(".def-val").textContent = card.def;
  cardEl.querySelector(".card-fav").classList.remove("active");

  cardStageEl.className = "card-stage glow-" + card.rarity.key;

  const isLegendary = card.rarity.key === "l";
  cardEl.classList.toggle("legendary", isLegendary);
  cardEl.classList.remove("flip-in", "flip-in-legendary");
  void cardEl.offsetWidth; // restart animation
  cardEl.classList.add(isLegendary ? "flip-in-legendary" : "flip-in");
  cardEl.style.transform = "";

  if (isLegendary) spawnFireworks();

  updateDots();
  prevBtn.disabled = index === 0;
  const remaining = CARDS_PER_PACK - index - 1;
  continueBtn.textContent = remaining > 0 ? `Encore ${remaining} carte${remaining > 1 ? "s" : ""}` : "Continuer";
}

function goTo(index) {
  if (index < 0 || index >= CARDS_PER_PACK) return;
  currentIndex = index;
  renderCard(currentIndex);
}

function endReveal() {
  revealEl.classList.add("hidden");
  homeEl.classList.remove("hidden");
  renderHome();
}

async function openPack() {
  if (packState.count <= 0 || !poolsReady || !currentUser) return;
  openBtn.disabled = true;
  packEl.classList.add("loading");

  let cards;
  try {
    const prevText = openBtn.textContent;
    openBtn.textContent = "Ouverture…";
    cards = await drawPack();
    openBtn.textContent = prevText;
  } catch (e) {
    console.error(e);
    packEl.classList.remove("loading");
    openBtn.disabled = false;
    counterEl.textContent = "Erreur RAWG : " + e.message;
    return;
  }

  packEl.classList.remove("loading");
  consumePack();
  saveCardsToFirestore(cards, currentUser);
  collectionCache = { user: null, cards: null }; // le paquet ouvert invalide le cache

  currentCards = cards;
  currentIndex = 0;
  homeEl.classList.add("hidden");
  revealEl.classList.remove("hidden");
  buildDots();
  renderCard(0);
}

// ---------- 3D tilt + drag-to-swipe ----------

let dragging = false;
let dragStartX = 0;

function applyTilt(clientX, clientY) {
  const rect = cardEl.getBoundingClientRect();
  const px = (clientX - rect.left) / rect.width - 0.5;
  const py = (clientY - rect.top) / rect.height - 0.5;
  const rotateY = px * 22;
  const rotateX = -py * 22;
  cardEl.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
}

function resetTilt() {
  cardEl.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg)";
}

cardEl.addEventListener("mousemove", (e) => {
  if (dragging) return;
  applyTilt(e.clientX, e.clientY);
});
cardEl.addEventListener("mouseleave", () => {
  if (!dragging) resetTilt();
});

cardEl.addEventListener("mousedown", (e) => {
  dragging = true;
  dragStartX = e.clientX;
});
window.addEventListener("mouseup", (e) => {
  if (!dragging) return;
  dragging = false;
  const delta = e.clientX - dragStartX;
  resetTilt();
  if (delta < -80) goTo(currentIndex + 1);
  else if (delta > 80) goTo(currentIndex - 1);
});

cardEl.addEventListener(
  "touchmove",
  (e) => {
    const t = e.touches[0];
    applyTilt(t.clientX, t.clientY);
  },
  { passive: true }
);
cardEl.addEventListener("touchstart", (e) => {
  dragStartX = e.touches[0].clientX;
});
cardEl.addEventListener("touchend", (e) => {
  const delta = e.changedTouches[0].clientX - dragStartX;
  resetTilt();
  if (delta < -80) goTo(currentIndex + 1);
  else if (delta > 80) goTo(currentIndex - 1);
});

cardEl.querySelector(".card-fav").addEventListener("click", (e) => {
  e.target.classList.toggle("active");
});

// ---------- Event bindings ----------

openBtn.addEventListener("click", openPack);
packEl.addEventListener("click", () => {
  if (!openBtn.disabled) openPack();
});

prevBtn.addEventListener("click", () => goTo(currentIndex - 1));
nextBtn.addEventListener("click", () => goTo(currentIndex + 1));
continueBtn.addEventListener("click", () => {
  if (currentIndex < CARDS_PER_PACK - 1) goTo(currentIndex + 1);
  else endReveal();
});

howLink.addEventListener("click", () => howModal.classList.remove("hidden"));
howClose.addEventListener("click", () => howModal.classList.add("hidden"));
howModal.addEventListener("click", (e) => {
  if (e.target === howModal) howModal.classList.add("hidden");
});

setActiveTab("pack");
renderHome();
checkApi();
