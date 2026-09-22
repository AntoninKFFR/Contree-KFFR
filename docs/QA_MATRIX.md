# Matrice QA produit — Phase 9

Date d'audit : 14 septembre 2026. Référence : preset `contree-kffr` v1 et serveur authoritative actuel.

Statuts : ✅ couvert par un test automatisé ou une vérification reproductible ; ⚠️ partiel ou smoke manuel seulement ; ❌ non couvert. Les noms de fichiers indiquent la preuve principale, pas nécessairement toute la couverture transversale.

## A. Enchères

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Preset Contrée KFFR | Partance aléatoire, enchères 80–160 par 10, couleurs seules, Capot/Coinche/Surcoinche actifs, SA/TA/Générale inactifs | ✅ | `rulesets.test.ts`, `game.test.ts`, `gameInitialization.test.ts`, `contractModes.test.ts` | — |
| Quatre passes, répété puis nouvelle donne | Donne annulée, score nul, historique conservé, partance tournée, aucun blocage | ✅ | `game.test.ts`, `actions.test.ts`, `engineRulesAudit.test.ts` | — |
| Actions de bot | Action légale, modes désactivés jamais proposés, Coinche/Surcoinche selon la fenêtre légale | ✅ | `biddingStrategy*.test.ts`, `botHumanDoctrineV31.test.ts`, `engineRulesAudit.test.ts` | — |
| Enchère forgée en multijoueur | Refus côté serveur selon le Ruleset figé | ✅ | `multiplayerServer.test.ts`, `generaleMultiplayer.test.ts` | — |

## B. Jeu de carte

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Donne normale sur seeds déterministes | 32 cartes uniques, 8 par main, chaque carte jouée une fois, 8 plis, score fini entier | ✅ | `engineRulesAudit.test.ts` (32 seeds), `cards.test.ts`, `game.test.ts` | — |
| Fournir, couper, partenaire maître, surcouper, sous-couper | Les six options `cardPlay` sont appliquées indépendamment sur mains exactes | ✅ | `configurableCardPlay.test.ts`, `rules.test.ts`, `playerPreferencesGame.test.ts` | — |
| Tour et carte illégale | Hors-tour, carte absente ou illégale refusés sans mutation | ✅ | `game.test.ts`, `multiplayerServer.test.ts`, `engineRulesAudit.test.ts` | Validation du `currentPlayerId` stocké dans `gameStateValidation.test.ts` |
| Dernier pli couleur / SA / TA | Bonus appliqué exactement une fois, valeurs de mode correctes | ✅ | `rules.test.ts`, `contractModes.test.ts`, `scoring.test.ts` | — |
| Monte Carlo V1 | Termine, rend une carte légale en couleur/SA/TA/Générale/custom, décision indépendante des vraies mains cachées | ✅ | `monteCarloBot.test.ts`, `contractModes.test.ts`, `generaleBot.test.ts`, `botReview.test.ts`, `tournament.test.ts` | — |

## C. Contrats

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Couleur, Sans Atout, Tout Atout | Enchère, ordre, points, cartes légales, dernier pli, Capot, Coinche/Surcoinche, scoring et Bot Review cohérents | ✅ | `contractModes.test.ts` | — |
| Numérique / Capot / Générale × normal / coinché / surcoinché | Valeur et multiplicateur appliqués une seule fois | ✅ | `scoring.test.ts`, `configurableScoring.test.ts`, `generale.test.ts` | — |
| Contrat stocké impossible | Kind/status/mode/équipe/valeur incohérents refusés avant utilisation serveur | ✅ | `rulesets.test.ts`, `generaleMultiplayer.test.ts` | `gameStateValidation.test.ts` |
| Générale | Trois actifs, partenaire assis, 8 plis à trois, 8/8 requis, 7/8 chute, SA/TA explicites seulement | ✅ | `generale.test.ts`, `generaleMultiplayer.test.ts`, `generaleBot.test.ts` | Validation cartes/tours/deck renforcée |

## D. Annonces / Belote

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Annonces OFF / ON | Détection et exposition seulement si activées ; `90`, `88 plis`, tierce `20` chute ou réussit selon `announcementsCount` | ✅ | `announcements.test.ts`, `scoring.test.ts`, `configurableScoring.test.ts`, `views.test.ts` | — |
| Annonces sur chute / capot | Perdues ou conservées selon règle, sans double comptage | ✅ | `configurableScoring.test.ts`, `scoring.test.ts` | — |
| Belote OFF / ON | Valeur configurable, réussite/échec selon les deux flags, jamais comptée deux fois | ✅ | `belote.test.ts`, `configurableScoring.test.ts`, `scoring.test.ts` | — |
| Belote couleur / SA / TA / Générale | Couleur conservée, SA désactivée, TA selon flag, partenaire inactif de Générale ne joue pas | ✅ | `contractModes.test.ts`, `generale.test.ts` | — |

## E. Scoring

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Baseline FFB | 162 ordinaires, Capot réalisé 252, arrondi et attribution réglementaires | ✅ | `scoring.test.ts`, `ffbGame.test.ts`, `engineRulesAudit.test.ts`, `rulesets.test.ts` | — |
| Coinche / Surcoinche | x2 / x4 dans KFFR, une seule multiplication ; multiplicateurs custom centralisés | ✅ | `scoring.test.ts`, `configurableScoring.test.ts`, `generale.test.ts` | — |
| `mustReachBid` × `mustBeatDefense` | Les quatre combinaisons distinguent 80–82 et 75–70 | ✅ | Couverture indépendante dans `configurableScoring.test.ts` | Matrice explicite dans `configurableScoring.test.ts` |
| Progression de contrat | Le statut provisoire utilise annonces/Belote et ne contredit pas le résultat final | ✅ | `playerPreferencesGame.test.ts`, `rulesetUi.test.ts` | Parité explicite progression/scoring sur les quatre combinaisons |
| Intégrité des scores persistés | Entiers finis, jamais négatifs ou NaN | ✅ | Invariants moteur dans `engineRulesAudit.test.ts` | Rejet serveur négatif/non fini dans `gameStateValidation.test.ts` |

## F. Fin de partie

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Une/deux équipes au-dessus de la cible, égalité exacte | Plus haut total gagne ; égalité prolonge | ✅ | `engineRulesAudit.test.ts`, `game.test.ts` | — |
| Cibles 500/1000/1500/2000/custom | Normalisation, solo, room et snapshot d'historique gardent la cible | ✅ | `customRuleset.test.ts`, `soloRules.test.ts`, `roomRules.test.ts`, `gameHistoryRules.test.ts`, `generaleHistory.test.ts` | — |
| Victoire normale / Belote / forfeit | Fin et vainqueur corrects, forfeit cohérent et immutable pendant évaluation | ✅ | `game.test.ts`, `forfeitHost.test.ts`, `multiplayerHistory.test.ts` | — |
| Rematch | Ancienne archive immutable, nouvel id, ready/takeover/deadline remis à zéro | ✅ | `multiplayerHistory.test.ts` | — |

## G. Solo

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| KFFR et parties déterministes | Donne jouable jusqu'à une fin valide avec invariants de cartes et score | ✅ | `engineRulesAudit.test.ts`, `ffbGame.test.ts`, `game.test.ts` | — |
| Annonces, SA, TA, Générale, règles carte custom | Même moteur, actions légales et fin de donne valide sur scénarios ciblés | ✅ | `contractModes.test.ts`, `generale.test.ts`, `configurableCardPlay.test.ts`, `configurableScoring.test.ts` | — |
| Contract-only / points-only / Coinche / Surcoinche | Résultat final conforme sans benchmark de force | ✅ | `configurableScoring.test.ts`, `scoring.test.ts` | — |
| Parcours UI solo complet au navigateur | Création et démarrage utilisables aux viewports cibles | ✅ | Tests de rendu `rulesetUi.test.ts`, `settingsPolish.test.ts` | `e2e/smoke.spec.ts` exécuté en Chromium local |

## H. Multijoueur

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Room → sièges → ready → règles → reset ready → start | Host et CAS seuls autorisent les transitions, règles figées au start | ✅ | `multiplayerServer.test.ts`, `atomicSeatMove.test.ts`, `atomicRoomRules.test.ts`, `roomRules.test.ts` | — |
| Bidding / carte / round / fin / history / rematch | Action authoritative, archive idempotente et rematch indépendant | ✅ | `multiplayerServer.test.ts`, `multiplayerHistory.test.ts` | — |
| Refresh / reconnexion / takeover | Vue reconstruite, présentation non rejouée, identité gardée et takeover host-only | ✅ | `presence.test.ts`, `trickPresentation.test.ts`, `multiplayerServer.test.ts`, `forfeitHost.test.ts` | — |
| Timer bidding / carte / Générale / course humaine | Deadline absolue, action légale, nouvelle deadline, ancien tick/CAS rejeté | ✅ | `turnTimer.test.ts`, `generaleMultiplayer.test.ts` | — |
| Deux actions même `state_version` | Une seule écriture ; stale action/refetch sans double carte/score | ✅ | `multiplayerServer.test.ts`, `turnTimer.test.ts`, `atomicSeatMove.test.ts`, `atomicRoomRules.test.ts` | — |
| Cycle réel à quatre navigateurs contre Supabase | Même cycle vérifié avec quatre sessions réseau simultanées | ⚠️ | `e2e/multiplayer.spec.ts` implémente quatre BrowserContext, room/join/seats/ready/rules/start/bids/pli/reconnect | Test implémenté mais réellement skipped le 14/09/2026 : les 8 variables de credentials sont absentes |

## I. Sécurité

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Membre, siège, tour et carte forgés | Non-membre, autre siège, hors-tour, carte absente/illégale refusés côté serveur | ✅ | `multiplayerServer.test.ts`, `views.test.ts` | — |
| Règles/start/takeover non-host ou après start | Refus avant écriture | ✅ | `multiplayerServer.test.ts`, `forfeitHost.test.ts`, `atomicRoomRules.test.ts` | — |
| Confidentialité des mains | Player view = propre main + compteurs + public ; aucune main adverse, y compris Bot Review et history | ✅ | `views.test.ts`, `botReview.test.ts`, `multiplayerHistory.test.ts`, `biddingStrategyV2.test.ts` | — |
| Confidentialité sur vraies réponses HTTP | Deux clients inspectent les payloads room ; `hands`, identifiants internes ou plusieurs mains font échouer le test | ⚠️ | Moniteur réseau dans `e2e/helpers/room.ts` | Implémenté, non exécuté sans les quatre comptes |
| État authoritative chargé depuis la base | Deck complet unique, cartes/plis formés, scores finis, contrat/règles/tour cohérents | ✅ | `rulesets.test.ts`, `generaleMultiplayer.test.ts` | `gameStateValidation.test.ts` |

## J. Historique

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| KFFR/custom/SA/TA/Générale/annonces/scoring/cible | Snapshot immutable reproduit les règles réellement jouées | ✅ | `gameHistoryRules.test.ts`, `multiplayerHistory.test.ts`, `generaleHistory.test.ts`, `contractModes.test.ts` | — |
| Sécurité et idempotence | Aucun GameState/main/carte dans payload public, lectures limitées aux participants, insert stable | ✅ | `multiplayerHistory.test.ts` | — |

## K. Preferences

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Deux clients aux préférences différentes | Vitesse/thème/taille/audio restent locaux ; Ruleset, GameState, view et timer identiques | ✅ | `playerPreferencesMultiplayer.test.ts`, `playerPreferences.test.ts` | — |
| Stockages rules/preference séparés | Clés versionnées, JSON corrompu/ancien sûr, reset/reload sans mélange | ✅ | `soloRules.test.ts`, `playerPreferences.test.ts`, `settingsPolish.test.ts` | — |
| Confirmations Coinche/Surcoinche/Capot/Générale | Gating ON/OFF centralisé et texte exact | ✅ | `settingsPolish.test.ts` | — |
| Interaction réelle annuler/confirmer/Échap/backdrop | Focus et fermeture accessibles, aucune double action | ⚠️ | Structure/gating dans `settingsPolish.test.ts` ; pas de runner DOM interactif permanent | Restitution du focus ajoutée et vérifiée au clavier ; backdrop reste smoke uniquement |
| Auto-collect ON/OFF, 4 cartes / Générale 3 cartes | File de présentation sans rejouer ni double progression, vitesse purement locale | ✅ | `trickPresentation.test.ts`, `playerPreferencesGame.test.ts`, `playerPreferences.test.ts` | — |

## L. Mobile / desktop

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| Navigation/settings/règles responsive | Navigation mobile/desktop, dialogues labellisés, contrôles accessibles | ✅ | `settingsPolish.test.ts`, `rulesetUi.test.ts` | — |
| 375×667, 390×844, landscape, 768, 1366×768, 1920×1080 | Pas d'overflow bloquant, commandes atteignables, dialogues scrollables | ⚠️ | Aucun test visuel pixel/viewport automatisé | Smoke manuel Phase 9 consigné ci-dessous |
| Tab/focus/Escape/trap/restore, reduced motion, contraste, grand texte | Clavier et préférences d'accessibilité utilisables | ⚠️ | Réduced motion et sémantique statique testés dans `playerPreferencesGame.test.ts` / `settingsPolish.test.ts` | Smoke manuel Phase 9 consigné ci-dessous |
| Console React | Pas d'hydration, duplicate key, nesting ou erreur aria sur pages smokées | ✅ | Build/rendus SSR + `e2e/smoke.spec.ts` avec collecte `console.error`/`pageerror` | Smoke Playwright local exécuté |

## M. Legacy compatibility

| État / scénario | Attendu | Statut | Test automatisé existant | Test ajouté Phase 9 |
|---|---|---:|---|---|
| GameState sans Ruleset, ancien `trump: Suit`, anciens scoring modes | Charge, normalise et reste jouable sans crash | ✅ | `rulesets.test.ts`, `contractModes.test.ts`, `botReview.test.ts` | Legacy conservé dans `gameStateValidation.test.ts` |
| Room/history sans snapshot | Colonnes legacy normalisées ; archive lisible | ✅ | `roomRules.test.ts`, `multiplayerHistory.test.ts`, `productMode.test.ts` | — |
| Préférences/règles locales anciennes ou corrompues | Migration ou retour sûr aux valeurs par défaut | ✅ | `playerPreferences.test.ts`, `soloRules.test.ts`, `settingsPolish.test.ts` | — |

## Vérifications d'intégration Phase 9

| Vérification | Résultat |
|---|---|
| Suite complète | ✅ `npm test` — 64 fichiers, 751 tests ; aucune commande de benchmark/tournoi lancée séparément (les suites historiques incluses par `npm test` restent vertes) |
| Supabase remote | ✅ `supabase migration list` — les 12 migrations locales et distantes correspondent, dont custom rules, atomic room rules et Générale history |
| Lint | ✅ `npm run lint` |
| Build production | ✅ `npm run build` — 11 pages générées, routes statiques et dynamiques compilées |
| Smoke local responsive/accessibilité/console | ✅ build production local : `/`, `/solo`, `/multiplayer`, `/history`, `/profile`, `/rules` aux 6 viewports demandés, 36 contrôles sans overflow horizontal ; solo playing vérifié en paysage ; focus trap avant/arrière, Escape et restore focus vérifiés ; 0 warning/erreur console |
| Smoke Vercel/prod | ⚠️ aucune URL de déploiement déclarée dans le dépôt ; ne bloque pas la livraison selon le cahier des charges |

## Vérifications E2E Phase 10

| Vérification | Résultat réel |
|---|---|
| Playwright | ✅ `@playwright/test` est une devDependency explicite ; Chromium installé localement |
| Smoke public local | ✅ `npm run test:e2e` — 4 tests publics passés, vrai serveur HTTP local et vrai Chromium |
| Quatre comptes / quatre contextes | ⚠️ suite implémentée et listée ; `npm run test:e2e:multiplayer` = 1 skipped, car aucun des huit credentials n'est présent |
| Preview / production | ⚠️ non exécuté : `E2E_BASE_URL` absent ; aucune URL distante n'est codée en dur |
| CI | ✅ workflow public non-auth ajouté, sans secret ; exécution GitHub à confirmer après push |

## Risques résiduels explicites

- ⚠️ L'orchestration quatre navigateurs est maintenant codée, mais ne peut pas devenir ✅ avant une exécution réelle avec les quatre comptes E2E. Les credentials étaient absents lors de cette phase et aucun compte production n'a été créé.
- ⚠️ Le smoke distant reste non exécuté tant que `E2E_BASE_URL` n'est pas fourni. Le même projet Playwright est prêt pour preview/staging/prod sans modification de code.
- Aucun scénario critique moteur, autorité serveur, confidentialité, score ou compatibilité legacy n'est marqué ❌.

## N. Elo V1 — clôture PR E (22/09/2026)

Cette section distingue les tests présents dans le dépôt de leur exécution réelle. Les scénarios `@rating` modifient durablement les comptes E2E et sont skipped tant que les huit variables de comptes et `E2E_RATING_MUTATION=1` ne sont pas fournis sur un environnement de test/staging approuvé.

| Scénario | Couverture | État |
|---|---|---|
| Formule, K, coefficients, seuils, forfeit | `tests/ratingFormulaV1.test.ts`, `lib/rating/formulaV1.ts` | ✅ tests unitaires locaux |
| Audit des droits distants en lecture seule | Catalogue PostgreSQL : RPC de lecture accordées à `authenticated`, `public`/`anon` refusés, `apply_rating_match` refusée, cinq tables Elo RLS sans accès direct, `profiles` limité au propriétaire | ✅ vérifié sans mutation le 22/09/2026 |
| Schéma, RLS, suppression/anonymisation, absence d'accès direct Elo | `scripts/testRatingDb.mjs` avec JWT locaux ; cinq tables, écritures refusées | ✅ CI Supabase locale PR #30 |
| Snapshot, fin atomique `pending`, forfeit autoritaire | `scripts/testRatingLifecycleDb.ts` | ✅ CI Supabase locale PR #30 |
| Erreur d'application, room finie, pending conservé, retry | `scripts/testRatingLifecycleDb.ts` ; rollback de tous les ratings/participants | ✅ CI Supabase locale PR #30 |
| Premier `applied`, second `already_applied`, rating/compteurs/ledger inchangés | `scripts/testRatingLifecycleDb.ts` renforcé dans PR E | ✅ CI Supabase locale PR #30 |
| Deux matchs au même snapshot, deltas ajoutés au courant sans lost update | `scripts/testRatingLifecycleDb.ts` renforcé dans PR E | ✅ CI Supabase locale PR #30 |
| API lecture, placement, position, confidentialité leaderboard | `scripts/testRatingReadDb.mjs`, `tests/ratingQueries.test.ts` | ✅ CI Supabase locale et tests unitaires |
| UI profil, progression, pending, leaderboard responsive | `tests/ratingUi.test.ts`, `tests/ratingProgress.test.ts`, `e2e/smoke.spec.ts` | ✅ couvert localement |
| Multijoueur générique, takeover/reconnexion/history/rematch sans Elo | `e2e/multiplayer.spec.ts` en ruleset `custom`, comparaison avant/après | ⚠️ implémenté ; exécution authentifiée non faite ici |
| Quatre humains, forfeit, redistribution, compteurs et classement | `e2e/rating.spec.ts` | ⚠️ implémenté mais non exécuté : garde/credentials absents |
| Un humain + trois bots, fiabilité 0,20 et aucun transfert | `e2e/rating.spec.ts` | ⚠️ implémenté mais non exécuté : garde/credentials absents |
| Comptes supprimés et historiques des autres joueurs | `scripts/testRatingDb.mjs`, `scripts/testRatingReadDb.mjs` | ✅ CI Supabase locale PR #30 |

Sur cette machine, `supabase start` échoue car Docker et Podman sont absents ; `npm run test:db:rating` s'arrête avant les tests faute de base locale. Le workflow `rating-db.yml` a exécuté ces tests sur une Supabase locale jetable dans la CI de la PR #30, avec résultat ✅ le 22/09/2026. La suite Elo authentifiée ne devient ✅ qu'après une vraie exécution sans skip. Jusque-là, la PR E est implémentée mais le chantier Elo n'est pas déclaré définitivement terminé.
