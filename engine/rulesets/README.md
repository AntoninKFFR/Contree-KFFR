# Architecture des rulesets

- **Core Engine** : `game.ts`, `bidding.ts`, `rules.ts` et `scoring.ts` appliquent les règles reçues sans dupliquer le moteur.
- **Ruleset** : `GameRulesetSnapshot` regroupe les domaines partie, enchères, jeu de la carte, annonces, Belote, réussite du contrat et score.
- **Preset** : `CONTREE_KFFR_RULESET` est aujourd'hui le seul preset de production actif.
- **Snapshot** : chaque nouvelle partie conserve dans `settings.ruleset` une copie complète, versionnée et gelée de ses règles. Une évolution future du preset ne modifiera donc pas les parties existantes.
- **Custom ruleset** : la structure et la validation acceptent un snapshot explicite, mais aucune interface utilisateur de personnalisation n'est encore exposée.
- **Legacy normalization** : `normalizeGameSettings` convertit les anciens couples `scoringMode`/`targetScore` en snapshot. `ffb` devient `contree-kffr`; les anciens modes `made-points` et `announced-points` restent lisibles via des snapshots de compatibilité.

## Règles configurables actives

- Les annonces sont détectées uniquement si `announcements.enabled` vaut `true`. `tierce`, `fifty`, `hundred` et `squares` filtrent ensuite chaque famille indépendamment. Une carte n'est retenue que dans une annonce; la meilleure annonce départage les équipes par valeur, nature, hauteur puis atout. Une égalité stricte ne rapporte rien.
- `contractSuccess.announcementsCount` choisit si les annonces participent à la qualification du contrat, indépendamment de leur présence dans le score.
- `belote.enabled`, `points`, `countsForContractSuccess` et `countsForContractFailure` pilotent respectivement la détection, la valeur, l'aide du preneur pour atteindre son contrat et l'aide de la défense dans la course aux points.
- `mustReachBid` et `mustBeatDefense` sont deux conditions indépendantes.

## Scoring

- `ffb` conserve la formule actuelle de Contrée KFFR.
- `contract-only` attribue seulement la valeur du contrat au preneur en réussite ou à la défense en chute.
- `contract-only-160-failure` attribue la valeur du contrat en réussite et une base fixe de 160 à la défense en chute, avant le coefficient Coinche/Surcoinche.
- `points-only` conserve la compatibilité de l'ancien mode `made-points` : points réalisés et contrat en réussite, base de chute et contrat en échec.
- Le coefficient Coinche/Surcoinche est appliqué après la formule du mode. Avec `doubleAllPointsOnCoinche`, le score complet des deux équipes est multiplié; sinon la formule historique propre au mode est conservée.
- `roundToTen` applique une seule fois l'arrondi historique (5 vers la dizaine supérieure), à la sortie du calcul.
- `announcementsLostOnFailure` transfère les annonces du preneur chuté à la défense. `announcementsLostOnCapot` transfère les annonces de l'équipe capotée à l'équipe qui réalise les huit plis. Sans ces options, chaque équipe conserve ses annonces.

Les annonces et la Belote restent désactivables indépendamment du mode de score. Les modes `contract-only` n'intègrent volontairement aucun point annexe dans `roundScore`, même si ces points restent présents dans le résultat de la donne et peuvent participer à la qualification du contrat.

Les flags Sans Atout, Tout Atout et Générale sont seulement représentés et désactivés dans le preset actuel. Leur gameplay n'est pas implémenté dans cette phase.

Le multijoueur conserve ce même snapshot dans le `GameState` autoritaire déjà sérialisé dans `room_game_states.state`. Aucune colonne ni migration SQL supplémentaire n'est nécessaire pour cette phase.
