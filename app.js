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

// Plage de rangs [start, end) de la rareté d'index i sur une console.
function tierRange(platformId, i) {
  const t = TIER_RANKS[platformId];
  return [t[i + 1] ?? 0, t[i]];
}

function rarityForAdded(added) {
  let result = RARITIES[0];
  for (const r of RARITIES) {
    if (added >= r.min) result = r;
  }
  return result;
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

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function renderHome() {
  counterEl.textContent = `${packState.count} / ${MAX_PACKS} paquets disponibles`;
  if (packState.count < MAX_PACKS && packState.nextRegenAt) {
    regenEl.textContent = `Prochain dans ${fmtTime(packState.nextRegenAt - Date.now())}`;
  } else {
    regenEl.textContent = "";
  }
  openBtn.disabled = packState.count <= 0 || !poolsReady;
}

setInterval(tickRegen, 1000);

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
  // TIER_RANKS a été calculé DLC compris : un rang en fin de liste peut
  // désormais dépasser la dernière page (404) -> on retente.
  if (res.status === 404) return null;
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
    if (drawn) return drawn;
  }
  return null;
}

async function drawPack() {
  const tiers = Array.from({ length: CARDS_PER_PACK }, rollTierIndex);
  const drawn = (await Promise.all(tiers.map(drawOneGame))).filter(Boolean);
  const games = drawn.map((d) => d.game);
  const details = drawn.map((d) => d.detail);

  const cards = games.map((g, i) => {
    const detail = details[i] || g;
    const added = g.added || 0;
    const rarity = rarityForAdded(added);
    const atk = detail.metacritic ?? Math.round((detail.rating || 0) * 20);
    const def = Math.min(100, Math.round(Math.log10(added + 1) * 40));
    const platforms = (detail.platforms || g.platforms || [])
      .map((p) => p.platform.name)
      .join(" · ");
    return {
      name: g.name,
      image: g.background_image,
      platforms: platforms || "Plateforme inconnue",
      added,
      summary: truncate(detail.description_raw, 160),
      rarity,
      atk,
      def,
    };
  });

  cards.sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
  return cards;
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

function renderCard(index) {
  const card = currentCards[index];
  cardCounterEl.textContent = `Carte ${index + 1} / ${CARDS_PER_PACK}`;

  cardEl.style.setProperty("--rarity-color", card.rarity.color);
  cardEl.querySelector(".card-face-top").style.backgroundImage = card.image
    ? `url('${card.image}')`
    : "none";
  cardEl.querySelector(".card-title").textContent = card.name;
  cardEl.querySelector(".card-platforms").textContent = card.platforms;
  cardEl.querySelector(".card-popularity").textContent =
    `${card.added.toLocaleString("fr-FR")} joueur${card.added > 1 ? "s" : ""} RAWG (popularité réelle → rareté)`;
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
  if (packState.count <= 0 || !poolsReady) return;
  openBtn.disabled = true;
  packEl.classList.add("shake");

  let cards;
  try {
    const prevText = openBtn.textContent;
    openBtn.textContent = "Ouverture…";
    cards = await drawPack();
    openBtn.textContent = prevText;
  } catch (e) {
    console.error(e);
    packEl.classList.remove("shake");
    openBtn.disabled = false;
    counterEl.textContent = "Erreur RAWG : " + e.message;
    return;
  }

  packEl.classList.remove("shake");
  consumePack();

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

renderHome();
checkApi();
