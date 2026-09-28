// Calcule les seuils de rareté et TIER_RANKS (utilisés dans app.js) à partir
// du classement RAWG. Lancé par .github/workflows/compute-tiers.yml, qui
// fournit RAWG_API_KEY. Usage : RAWG_API_KEY=... node scripts/compute-tiers.mjs
//
// Principe : une rareté = une tranche du classement mondial (toutes consoles
// autorisées confondues, DLC exclus) par nombre de joueurs RAWG ("added").
// GLOBAL_RANKS = [limite des jeux tirables, R, SR, UR, L] : Légendaire = top
// GLOBAL_RANKS[4], Ultra rare = jusqu'au top GLOBAL_RANKS[3]..., Commune =
// jusqu'au top GLOBAL_RANKS[0], au-delà le jeu n'est pas tiré. On lit le
// "added" du jeu à chacun de ces rangs, qui devient le seuil ; puis, pour
// chaque console, on compte combien de ses jeux dépassent chaque seuil
// (recherche dichotomique sur le classement).

const KEY = process.env.RAWG_API_KEY;
if (!KEY) throw new Error("RAWG_API_KEY manquant");

const BASE = "https://api.rawg.io/api/games";
const PLATFORMS = [4, 27, 15, 16, 18, 187, 80, 14, 1, 186, 7, 9, 8, 19, 17, 10, 11, 105, 83, 43, 24];
// Rangs mondiaux : limite des jeux tirables (Commune), puis R, SR, UR, L.
const GLOBAL_RANKS = [15000, 2000, 800, 300, 50];
const MAX_ACCESSIBLE = 10000; // RAWG ne pagine pas au-delà

let calls = 0;
async function page(platforms, n, size = 1) {
  const url = `${BASE}?key=${KEY}&page_size=${size}&page=${n}&platforms=${platforms}&ordering=-added&exclude_additions=true`;
  for (let attempt = 0; attempt < 4; attempt++) {
    calls++;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error("RAWG en erreur pour " + url);
}

async function addedAt(platforms, rank) {
  // Pages de 40 (le max RAWG) pour atteindre les rangs au-delà de 10 000.
  const size = rank > MAX_ACCESSIBLE ? 40 : 1;
  const data = await page(platforms, Math.ceil(rank / size), size);
  return data?.results?.[(rank - 1) % size]?.added ?? null;
}

// Nombre de jeux (rangs 1..n) ayant added >= threshold.
async function countAtLeast(platforms, n, threshold) {
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const a = await addedAt(platforms, mid);
    if (a !== null && a >= threshold) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const all = PLATFORMS.join(",");
const thresholds = [];
for (const rank of GLOBAL_RANKS) thresholds.push(await addedAt(all, rank));
console.log("Seuils (added) aux rangs mondiaux", GLOBAL_RANKS, "=>", thresholds);
if (thresholds.includes(null)) throw new Error("Rang mondial inaccessible chez RAWG");

const tierRanks = {};
for (const p of PLATFORMS) {
  const first = await page(p, 1);
  const accessible = Math.min(first?.count ?? 0, MAX_ACCESSIBLE);
  const row = [];
  let prev = accessible;
  for (const t of thresholds) {
    prev = await countAtLeast(p, prev, t); // tranches emboîtées : on cherche sous la précédente
    row.push(prev);
  }
  tierRanks[p] = row;
  console.log(p, JSON.stringify(row));
}

console.log("RESULT_JSON " + JSON.stringify({ globalRanks: GLOBAL_RANKS, thresholds, tierRanks, calls, date: new Date().toISOString() }));
