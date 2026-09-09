# Migration du moteur vers la Coinche FFB

Date : 2026-09-09

## Résultat

Le mode `ffb` est désormais le ruleset canonique et le mode par défaut des nouvelles parties solo, multijoueur et des simulations lancées sans option explicite. Les modes `made-points` et `announced-points` restent lisibles et sélectionnables pour préserver les parties et statistiques historiques.

Référence principale : [Règles officielles de la Belote Coinchée — Fédération Française de Belote](https://www.ffbelote.org/wp-content/uploads/2015/11/REGLES-DE-LA-BELOTE-COINCHEE.pdf). La [page Coinche FFB](https://www.ffbelote.org/regles-coinche/) a été consultée comme référence secondaire.

## Ancienne règle et nouvelle règle

| Sujet | Avant | Maintenant |
| --- | --- | --- |
| Ruleset standard | Deux modes simplifiés | `ffb` canonique par défaut ; modes historiques conservés |
| Réussite | Atteindre le contrat suffisait | Atteindre le contrat **et** battre strictement la défense |
| Entame | Dernier enchérisseur | Partance de la donne (`startingPlayerId`) |
| Fin des enchères | Cas spécial centré sur le preneur après coinche | Trois vrais tours et trois passes après la dernière enchère/coinche |
| Validation | Le type TypeScript pouvait être contourné | Garde runtime sur 80–160 dans le moteur |
| Capot demandé | Absent | Action et contrat distincts, supérieurs à 160, montant 250 |
| Capot réalisé | Toujours 162 points | Dix de der à 100 et total de plis à 252 |
| Belote | Absente | État belote/rebelote explicite, 20 points imprenables |
| Annonces | Absentes | Tierce, cinquante, cent et carrés, comparaison FFB |
| Marque | Multiplicateur appliqué au seul contrat | Formules FFB complètes, base 160/250, transfert, ×2/×4 et arrondi |
| Égalité finale | Avantage implicite à l'équipe 0 | Donne supplémentaire à égalité exacte |
| Vue joueur | Main propre uniquement | Même protection, avec annonces publiques filtrées |

## Implémentation

### Moteur

- `engine/types.ts` : mode FFB, contrat capot, états d'annonces et de belote, ventilation complète de `RoundResult`.
- `engine/announcements.ts` : détection sans double emploi des cartes, comparaison interéquipes, résolution et belote/rebelote.
- `engine/bidding.ts` : validation runtime et disponibilité du capot.
- `engine/game.ts` : partance à l'entame, fenêtre de trois passes, actions capot, annonces au premier pli, résolution au deuxième, belote, capot réel et fin de partie FFB.
- `engine/scoring.ts` : réussite stricte, marque FFB normale/coinchée/surcoinchée, annonces, belote, capot et arrondi.
- `engine/rules.ts` : dix de der à 100 lors d'un capot.
- `engine/actions.ts` : action capot.
- `engine/views.ts` : projection défensive des nouveaux états publics et clonage des résultats.

### Client, serveur et persistance

- `components/BiddingPanel.tsx`, `GameTable.tsx`, `ScoreBoard.tsx`, `BotReviewPanel.tsx` : saisie et affichage du capot, des annonces, de la belote et de la ventilation FFB.
- `app/solo/SoloPageClient.tsx` : mode FFB par défaut et action capot.
- `app/multiplayer/MultiplayerPageClient.tsx`, `app/multiplayer/[roomId]/RoomPageClient.tsx` : création de salon FFB, libellé et action capot.
- `lib/roomTypes.ts`, `lib/server/roomIntentValidation.ts`, `lib/server/multiplayerGame.ts`, `lib/server/multiplayerService.ts` : types, validation serveur et application authoritative de l'action capot et du mode FFB.
- `lib/stats.ts` : libellé historique FFB.
- `supabase/migrations/20260909040000_ffb_scoring_mode.sql` : extension contrôlée des contraintes de mode des salons et parties multijoueur.
- `scripts/simulateBots.ts`, `scripts/benchmarkHumanDoctrineV2.ts` : mode CLI canonique et compatibilité de type avec la valeur 250.

### Documentation et tests

- `RULES.md` : ruleset réellement implémenté et séparation claire des modes historiques.
- `tests/announcements.test.ts` : annonces, conflits, non-cumul des cartes et belote/rebelote.
- `tests/scoring.test.ts` : grande matrice 80–160, normal/coinché/surcoinché, réussi/chuté, annonces, belote, capot demandé/réalisé et arrondi.
- `tests/ffbGame.test.ts` : intégration au fil des plis, résolution des annonces, belote, capot à 252 et seuil uniquement franchi par belote.
- `tests/engineRulesAudit.test.ts`, `game.test.ts`, `actions.test.ts`, `multiplayerServer.test.ts`, `views.test.ts` : anciennes caractérisations corrigées, frontières serveur, capot et anti-triche.
- `tests/botScenarios.test.ts` : attente déterministe adaptée au nouveau verdict de contrat ; aucun code de stratégie bot n'a été modifié.

## Choix et ambiguïtés

1. **Plage numérique 80–160.** Le PDF FFB principal exige 80 minimum et des multiples de 10 avant le capot sans donner ici une borne numérique explicite, tandis qu'une page web FFB plus ancienne mentionne une plage allant jusqu'à 650. Le mandat produit de cette migration impose explicitement 80–160 et le rejet runtime de 170, 200, etc. C'est donc la convention canonique retenue par ce projet.
2. **Déclarations automatiques.** La table FFB exige des déclarations verbales. Une interface numérique pourrait permettre d'oublier volontairement une annonce, mais cette variante ajouterait des actions et des délais sans valeur stratégique souhaitée ici. Le moteur choisit de toujours déclarer automatiquement une combinaison valide lors du jeu de la carte. La résolution et la marque restent FFB.
3. **Cent.** Une suite maximale de cinq cartes ou plus compte comme un seul cent ; elle n'est pas découpée artificiellement en plusieurs annonces. Une carte ne participe jamais à deux annonces simultanées.
4. **Information publique.** Avant résolution, seuls nature et montant sont exposés. Les détails des cartes ne deviennent publics que pour l'équipe gagnante, comme lors de la présentation réglementaire des annonces.
5. **Anciennes données.** `kind` reste optionnel pour les contrats numériques historiques sérialisés ; l'absence de `kind` signifie un contrat en points. Les anciens modes de score ne reçoivent pas rétroactivement la marque FFB.

## Compatibilité et invariants

- Les équipes, cartes, règles de légalité et profils bots sont inchangés.
- `OFFICIAL_BOT_PROFILE_ID` est inchangé.
- Les bots n'annoncent pas encore volontairement capot, mais comprennent un contrat capot existant et ne produisent pas d'action illégale.
- Le moteur reste déterministe pour une seed identique.
- Une donne conserve exactement 32 cartes, huit cartes par joueur et huit plis.
- Le total des plis est 162 sans capot et 252 avec capot.
- `PlayerGameView` ne contient aucune main adverse. Les nouveaux états publics ne contiennent aucune main complète.
- La migration SQL est additive sur les valeurs autorisées et ne réécrit aucune partie existante.

## Éléments volontairement non implémentés

- La variante optionnelle Sans Atout / Tout Atout.
- Les gestes physiques sans effet sur l'état numérique : coupe, paquets de distribution 3-2-3 et pénalités disciplinaires.
- La tolérance FFB d'un oubli verbal unique de « rebelote » : l'application automatise la déclaration valide.
- Une stratégie bot dédiée pour annoncer capot ou exploiter les annonces ; ce chantier garantit seulement la compatibilité et la légalité.

Ces exclusions ne modifient pas le résultat des règles de carte et de score du ruleset à quatre couleurs retenu.

## Tableau final

| Règle FFB | Implémentée ? | Testée ? | Écart restant ? |
| --- | --- | --- | --- |
| 32 cartes, 8 par joueur, équipes opposées | Oui | Oui | Aucun écart numérique |
| Ordre et valeur des cartes | Oui | Oui, exhaustif | Aucun |
| Fournir, couper, monter, surcouper, défausser | Oui | Oui, matrice exhaustive | Aucun |
| Partance et entame | Oui | Oui | Aucun |
| Passe réversible et trois passes | Oui | Oui | Aucun |
| Coinche à son tour, contrat figé | Oui | Oui | Aucun |
| Surcoinche par les preneurs, arrêt immédiat | Oui | Oui, deux positions preneuses | Aucun |
| Enchères 80–160 validées runtime | Oui | Oui, valeurs légales et forgées | Convention produit documentée |
| Capot demandé distinct et maximal | Oui | Oui | Aucun dans la plage retenue |
| Réussite : contrat atteint et défense battue | Oui | Oui, seuils 81–81 / 80–82 / 82–80 | Aucun |
| Belote/rebelote, 20 imprenables | Oui | Oui | Déclaration UI automatique |
| Tierce, cinquante, cent, carrés | Oui | Oui, chaque type et conflit | Déclaration UI automatique |
| Résolution des annonces au deuxième pli | Oui | Oui | Aucun |
| Dix de der normal, total 162 | Oui | Oui | Aucun |
| Capot réalisé, total 252 et transfert | Oui | Oui, preneur/défense | Aucun |
| Score normal FFB | Oui | Oui, 80–160 réussi/chuté | Aucun |
| Score coinché et surcoinché FFB | Oui | Oui, 80–160 réussi/chuté | Aucun |
| Annonces et belote dans la marque | Oui | Oui | Aucun |
| Arrondi à la dizaine | Oui | Oui, 84/85 | Aucun |
| Égalité au-dessus de la cible | Oui | Oui | Aucun |
| Cible franchie uniquement par belote après chute/capot subi | Oui | Oui | Aucun |
| Vue joueur sans mains adverses | Oui | Oui | Aucun |
| Bots fonctionnels et profil officiel stable | Oui | Oui | Pas de nouvelle stratégie capot |
| Sans Atout / Tout Atout | Non | Sans objet | Variante FFB optionnelle exclue |

## Validation

- `npm test` : réussi, 32 fichiers et 390 tests passés.
- `npm run lint` : réussi, aucune erreur.
- `npm run build` : réussi, compilation et génération des 11 pages terminées.
