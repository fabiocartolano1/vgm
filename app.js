const RAWG_BASE = "https://api.rawg.io/api/games";

// Consoles autorisées (voir consoles.txt) -> IDs plateformes RAWG.
// PC a ~560k jeux sur RAWG contre quelques centaines/milliers pour les consoles
// rétro : si on pioche sur l'ensemble des plateformes réunies, PC écrase tout le
// reste. On tire donc une plateforme au hasard (chance égale) AVANT de piocher
// un jeu, pour que chaque console de la liste ait vraiment sa chance.
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
const RAWG_PAGE_CAP = 10000; // pagination max imposée par RAWG, quel que soit le filtre

const platformCountCache = {};

async function getPlatformCount(platformId) {
  if (platformCountCache[platformId]) return platformCountCache[platformId];
  const res = await fetch(`${RAWG_BASE}?key=${RAWG_API_KEY}&page_size=1&platforms=${platformId}`);
  const data = await res.json();
  const count = Math.min(data.count || 1, RAWG_PAGE_CAP);
  platformCountCache[platformId] = count;
  return count;
}

// Rareté basée sur "added" (nb réel de joueurs ayant ajouté le jeu sur RAWG),
// l'équivalent jeu vidéo des vues mensuelles d'un article Wikipédia.
// Seuils calibrés sur un échantillon réel du tirage par plateforme (voir notes de
// session) pour que Légendaire reste réservé aux jeux vraiment connus (~1,5% des tirages).
const RARITIES = [
  { key: "c",  label: "C",  name: "Commune",     color: "#b8f2d5", min: 0 },
  { key: "pc", label: "PC", name: "Peu commune", color: "#b1cff2", min: 20 },
  { key: "r",  label: "R",  name: "Rare",        color: "#c6a7f2", min: 80 },
  { key: "sr", label: "SR", name: "Super rare",  color: "#ed6fa3", min: 300 },
  { key: "ur", label: "UR", name: "Ultra rare",  color: "#fa9931", min: 1200 },
  { key: "l",  label: "L",  name: "Légendaire",  color: "#ffe144", min: 6000 },
];

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

async function drawOneGame(platformId) {
  const count = await getPlatformCount(platformId);
  const page = 1 + Math.floor(Math.random() * count);
  const url = `${RAWG_BASE}?key=${RAWG_API_KEY}&page_size=1&page=${page}&platforms=${platformId}&ordering=name`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("RAWG error " + res.status);
  const data = await res.json();
  return (data.results || [])[0];
}

async function drawPack() {
  // Une plateforme au hasard par carte, à chance égale, pour ne pas laisser
  // le catalogue PC (bien plus fourni) écraser les consoles rétro demandées.
  const chosenPlatforms = Array.from(
    { length: CARDS_PER_PACK },
    () => ALLOWED_PLATFORMS[Math.floor(Math.random() * ALLOWED_PLATFORMS.length)]
  );
  const games = (await Promise.all(chosenPlatforms.map(drawOneGame))).filter(Boolean);

  const details = await Promise.all(games.map((g) => fetchGameDetail(g.id)));

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
