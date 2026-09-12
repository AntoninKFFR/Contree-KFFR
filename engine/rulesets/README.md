# Architecture des rulesets

- **Core Engine** : `game.ts`, `bidding.ts`, `rules.ts` et `scoring.ts` appliquent les règles reçues sans dupliquer le moteur.
- **Ruleset** : `GameRulesetSnapshot` regroupe les domaines partie, enchères, jeu de la carte, annonces, Belote, réussite du contrat et score.
- **Preset** : `CONTREE_KFFR_RULESET` est aujourd'hui le seul preset de production actif.
- **Snapshot** : chaque nouvelle partie conserve dans `settings.ruleset` une copie complète, versionnée et gelée de ses règles. Une évolution future du preset ne modifiera donc pas les parties existantes.
- **Custom ruleset** : la structure et la validation acceptent un snapshot explicite, mais aucune interface utilisateur de personnalisation n'est exposée en phase 1.
- **Legacy normalization** : `normalizeGameSettings` convertit les anciens couples `scoringMode`/`targetScore` en snapshot. `ffb` devient `contree-kffr`; les anciens modes `made-points` et `announced-points` restent lisibles via des snapshots de compatibilité.

Les flags Sans Atout, Tout Atout, Générale et annonces classiques sont seulement représentés et désactivés dans le preset actuel. Leur gameplay n'est pas implémenté dans cette phase.

Le multijoueur conserve ce même snapshot dans le `GameState` autoritaire déjà sérialisé dans `room_game_states.state`. Aucune colonne ni migration SQL supplémentaire n'est nécessaire pour cette phase.
