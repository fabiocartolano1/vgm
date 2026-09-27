# Architecture du TCG Jeux Vidéo

## Concept
- Jeu TCG style WikiMasters, mais avec des jeux vidéo au lieu d'articles Wikipedia
- Ouverture de packs contenant des cartes de jeux
- Rareté basée sur les données réelles (ventes, score, popularité)
- **Inspiré par WikiMasters** : lancé mars 2026, atteint 215k joueurs/jour en 6 mois via viralité + streamers

## Stack technologique
- **Frontend** : webapp (React/Vue)
- **Backend** : Firebase (Firestore + Cloud Functions + Auth)
- **API externes** : RAWG pour les métadonnées de jeux
- **Hosting** : Firebase Hosting (gratuit)

## Choix de l'API : RAWG

### Comparaison RAWG vs IGDB
| Critère | RAWG | IGDB |
|---------|------|------|
| Coût | Gratuit (20k req/mois) | Gratuit (illimité) |
| Taille DB | 500k+ jeux | ~300k jeux |
| Images | Bonnes | Très bonnes |
| Rate limit | 20k/mois | 4 req/sec |
| Attribution | Obligatoire | Oui (logo) |
| Commercial | Oui (avec limites) | Non (free tier) |
| Facilité setup | Clé API simple | OAuth Twitch |

### Pourquoi RAWG
- ✅ Gratuit jusqu'à 100k MAU (Monthly Active Users)
- ✅ Permet la monétisation (vente de packs à 1€)
- ✅ Setup simple avec clé API
- ✅ Pas besoin de Twitch account
- ⚠️ Condition : attribution (logo RAWG) obligatoire
- 💰 Au-delà 100k MAU : contacter RAWG pour tarifs commerciaux

## Architecture de la base de données

### Firestore (données légères)