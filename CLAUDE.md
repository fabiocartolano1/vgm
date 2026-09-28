# Video Game Masters

## Version de l'app

- La version affichée en bas à droite vient de `APP_VERSION` dans `version.js`.
- Règle : **chaque commit passe la version à +1 sur le dernier chiffre**
  (0.0.10 -> 0.0.11 -> 0.0.12...), dans le commit lui-même.
- C'est automatique via le hook `.githooks/pre-commit`, à activer une fois
  par clone : `git config core.hooksPath .githooks`.
- Si le hook n'est pas actif (nouveau clone, CI, commit fait autrement),
  incrémenter `version.js` à la main dans le commit.
- Ne pas incrémenter en plus pour un `git commit --amend` d'un commit qui a
  déjà son incrément (le hook se relance sur un amend : remettre la valeur).
