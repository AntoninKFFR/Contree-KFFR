# Enchères : harmonisation Solo / Multijoueur

Le Solo utilisait déjà `NativeBidding` dans `SoloScene`, exactement comme le Multijoueur. La seule différence était `showWaitingBids` : `true` par défaut pour le Solo, `false` explicitement en Multijoueur. Pendant le tour adverse, le Solo affichait donc le sélecteur désactivé et « Les autres joueurs annoncent… », alors que le Multijoueur dégageait le centre de la table.

Le correctif fait passer **ce seul défaut à `false`**, sans toucher au panneau de référence Multijoueur. La condition existante affiche toujours le panneau lorsque `currentPlayerId === viewerPlayerId`. Son activation reste contrôlée séparément par `human`, avec les protections existantes pendant une requête ou une synchronisation.

Les bulles d’annonce, les joueurs et l’indication du tour sont des éléments séparés dans `PlayerCell` : ils restent affichés pendant le tour des bots. `NativeBidding`, la géométrie, les confirmations, les animations, le rythme des bots, le transport et les règles ne changent pas. Aucun backend, Supabase, dépendance ou comportement métier modifié.

## Comparaisons rendues

Les colonnes montrent le **Solo avant** (`5b9d400`), le **Solo corrigé** et le **Multijoueur de référence**. La première ligne montre le tour adverse ; la seconde le retour au joueur humain. Ce sont les vraies routes et les vrais composants React Native rendus par **React Native Web**, avec les mêmes projections publiques et les mêmes insets (47 px de chaque côté, 21 px en bas). Il ne s’agit pas de nouvelles captures sur un iPhone physique.

- [568 × 320](captures/bidding-comparison-568.png)
- [844 × 390](captures/bidding-comparison-844.png)
- [932 × 430](captures/bidding-comparison-932.png)
- [Empreintes des projections et des captures source](captures/bidding-comparison.json)

Les trois planches ont été inspectées. La comparaison des pixels confirme : le Solo change uniquement pendant le tour adverse ; son rendu au tour humain est identique avant/après. Le Multijoueur reste identique avant/après dans les deux états, aux trois tailles.

## Validation exécutée

- `npm run typecheck` et `npm run lint` dans `apps/mobile` : réussis. Une erreur initiale de typage d'une fixture JSON a été corrigée dans le harnais de test avant validation.
- `npm test` : **40 tests unitaires + 26 tests UI/navigation réussis**.
- `npm run test:geometry -- bidding-turns.spec.ts solo-controls.spec.ts` : **20 réussis**. Les six nouveaux scénarios couvrent les deux modes aux trois tailles : panneau absent au tour adverse, annonces et main conservées, indicateur du bon joueur, retour du panneau au tour humain, confirmation/annulation de Coinche et intention unique. Le Solo traverse réellement le délai HTTP et le délai de présentation existants ; une seule intention `advance-bot` est envoyée. Les tests existants vérifient aussi SA/TA, Capot, Générale, Coinche/Surcoinche, paramètres et réactivité des cartes.
- `npm run test:geometry -- bidding-turns.spec.ts multiplayer.spec.ts --grep 'bidding|motion'` : **19 réussis**, dont les mêmes six nouveaux scénarios, les quatre places Multijoueur aux trois tailles et les animations partagées. Soit **33 tests géométriques distincts** entre les deux commandes.
- Le même nouveau test a également été exécuté **avant le correctif** avec `BIDDING_BASELINE=1` : **6 réussis**, panneau d’attente présent seulement en Solo. Les captures sources avant/après sont conservées localement sous `test-results/bidding-panel` ; les captures courantes sont aussi attachées au rapport Playwright/CI.

Pour reproduire la vérification actuelle, lancer les deux commandes géométriques ci-dessus. `BIDDING_CAPTURE_DIR` permet de conserver les PNG/JSON dans un dossier distinct du rapport ; `BIDDING_BASELINE=1` est réservé à l’ancien défaut `true`, pour reproduire l’état avant correction avec le même harnais. Les transports sont simulés et ne contactent aucune production. La fixture du tour adverse est l’enchère existante `coinche`, immédiatement avant le dernier passage du joueur 3.

La validation physique de ce correctif Solo reste distincte des tests automatisés. La PR #152 conserve son statut DRAFT et n’est pas fusionnée.
