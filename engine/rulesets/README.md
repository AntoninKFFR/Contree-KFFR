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

### Jeu de la carte

- `mustFollowSuit` : avec un trèfle demandé et un trèfle en main, seuls les trèfles sont légaux. À `false`, toute la main est légale; cette permission prend donc le pas sur `mustRaiseAtTrump`.
- `mustTrumpWhenVoid` : sans la couleur demandée mais avec de l'atout, le joueur doit couper. À `false`, il peut se défausser; s'il choisit volontairement l'atout et que `mustOvertrump` est actif, il doit néanmoins employer un atout supérieur lorsqu'il en possède un.
- `allowDiscardWhenPartnerWinning` : sans la couleur demandée, un joueur dont le partenaire tient le pli peut se défausser. À `false`, `mustTrumpWhenVoid` l'oblige à jouer un atout, mais jamais à surcouper son partenaire.
- `mustOvertrump` : lorsqu'une autre couleur était demandée et qu'un adversaire a déjà coupé, un atout supérieur disponible est obligatoire. À `false`, n'importe quel atout est légal si la coupe reste obligatoire.
- `allowDiscardWhenCannotOvertrump` : face à la coupe adverse, si aucun atout supérieur n'existe, le joueur peut jeter n'importe quelle carte. À `false`, il doit fournir un atout inférieur. Cette option n'agit que lorsque `mustTrumpWhenVoid` et `mustOvertrump` sont actifs.
- `mustRaiseAtTrump` : lorsque l'atout est directement demandé, un atout supérieur disponible est obligatoire. À `false`, tout atout de la main est légal.

Les combinaisons `mustOvertrump=true` avec `mustTrumpWhenVoid=false` et `mustRaiseAtTrump=true` avec `mustFollowSuit=false` sont volontairement valides. Dans le premier cas, la coupe est facultative mais un atout volontaire doit surcouper si possible. Dans le second, la permission de ne pas fournir rend la montée facultative. Le validateur ne normalise donc aucun de ces couples silencieusement.

## Scoring

- `ffb` conserve la formule actuelle de Contrée KFFR.
- `contract-only` attribue seulement la valeur du contrat au preneur en réussite ou à la défense en chute.
- `contract-only-160-failure` attribue la valeur du contrat en réussite et une base fixe de 160 à la défense en chute, avant le coefficient Coinche/Surcoinche.
- `points-only` conserve la compatibilité de l'ancien mode `made-points` : points réalisés et contrat en réussite, base de chute et contrat en échec.
- Le coefficient Coinche/Surcoinche est appliqué après la formule du mode. Avec `doubleAllPointsOnCoinche`, le score complet des deux équipes est multiplié; sinon la formule historique propre au mode est conservée.
- `roundToTen` applique une seule fois l'arrondi historique (5 vers la dizaine supérieure), à la sortie du calcul.
- `announcementsLostOnFailure` transfère les annonces du preneur chuté à la défense. `announcementsLostOnCapot` transfère les annonces de l'équipe capotée à l'équipe qui réalise les huit plis. Sans ces options, chaque équipe conserve ses annonces.

Les annonces et la Belote restent désactivables indépendamment du mode de score. Les modes `contract-only` n'intègrent volontairement aucun point annexe dans `roundScore`, même si ces points restent présents dans le résultat de la donne et peuvent participer à la qualification du contrat.

## Modes de contrat

Le moteur représente explicitement le contrat par un `ContractMode` discriminé : couleur (`{ kind: "suit", suit }`), Sans Atout ou Tout Atout. Les anciens objets portant seulement `trump: Suit` sont normalisés logiquement en contrat couleur, sans migration de base de données. Le preset `contree-kffr` conserve strictement `allowNoTrump=false` et `allowAllTrump=false`.

- En **couleur**, l'ordre, les points, la coupe, la surcoupe et la montée restent inchangés.
- En **Sans Atout**, les quatre couleurs emploient l'ordre et les valeurs hors-atout. Il faut fournir si `mustFollowSuit` l'exige; en chicane, la défausse est libre et les règles de coupe ne s'appliquent pas.
- En **Tout Atout**, les quatre couleurs emploient l'ordre et les valeurs d'atout. La couleur demandée reste la seule famille qui puisse remporter le pli : il faut fournir et, si `mustRaiseAtTrump` est actif, monter dans cette couleur. En chicane, la défausse est libre; il n'existe aucun atout global.

Les totaux de cartes sont dérivés du barème : 162 en couleur, 130 en Sans Atout et 258 en Tout Atout avec le bonus de dernier pli du preset. Le capot reste défini par huit plis et emploie le bonus de dernier pli capot configuré pour calculer le total du mode.

La Belote/Rebelote est impossible en Sans Atout. En Tout Atout, `belote.allowInAllTrump` autorise séparément chaque paire Roi+Dame d'une couleur, donc plusieurs couleurs peuvent être comptées. Pour les annonces, aucune séquence n'a l'avantage « à l'atout » en Sans Atout; en Tout Atout toutes les couleurs sont équivalentes, donc aucune ne reçoit d'avantage de départage.

Le flag Générale reste représenté mais non implémenté.

Le multijoueur conserve ce même snapshot dans le `GameState` autoritaire déjà sérialisé dans `room_game_states.state`. Aucune colonne ni migration SQL supplémentaire n'est nécessaire pour cette phase.
