# Table mobile immersive V2

Base : `f3242de` (dernier `main`, PR #138). Branche : `codex/mobile-table-immersive-v2`.

## Géométrie cardinale après fusion de #139

Ce suivi repart de `8946ecf`, après fusion de #139, sur la même branche. Un seul fichier applicatif change : `app/globals.css`, exclusivement dans le breakpoint mobile paysage existant. Les sections suivantes décrivent les passes précédentes.

- Nord est centré en haut ; Ouest et Est partagent l’axe horizontal médian ; Moi reste en bas à gauche. Pendant les enchères, Nord utilise le rail supérieur et les joueurs latéraux restent hors du panneau. Les informations, P inline et contrôles flottants sont conservés.
- Main de jeu : hauteurs nominales 76 / 90 / 94 / 102 px au lieu de 89 / 107 / 111 / 122 px, aux quatre tailles avec safe areas haut 8, gauche 44, bas 34. Éventail sobre de −9,45° à +9,45° avec huit cartes, obtenu à partir des variables de présentation déjà présentes. Le bas dépasse de 18 px le bord inférieur utile de la table (8 px pendant les enchères), puis est coupé par son overflow existant. Le focus et le survol soulèvent la carte ; la surface tactile visible est vérifiée par hit-testing, y compris sous les chevauchements.
- Pli : taille indépendante de la main (89 / 107 / 111 / 116 px), ancrages fixes par siège, centre séparé de Nord et de la main. Aucune clé, animation, logique de présentation ou valeur de z-index n’est modifiée. L’arrivée des cartes 1→4 conserve les nœuds et les coordonnées des cartes déjà posées, sans relancer leurs animations.
- Portrait : invitation existante à tourner le téléphone, rotation sans remise à zéro. Tablette 1024×768 et desktop 1440×900 : header 56 px, éventail original et main entièrement visible. Aucun moteur, backend, score, flux de jeu ou fichier PWA modifié.

Les tests existants de main sont adaptés à la coupe volontaire : ils contrôlent une surface visible et non obstruée d’au moins 44×44 px, plutôt que l’inclusion de toute la carte dans le viewport. Captures et mesures locales : `.playwright/validation/cardinal/` et `.playwright/validation/immersive-polish/`.

Validation finale : 72 contrôles Playwright ciblés + 2 scènes Training après une vraie question, tous passés sur Chromium et WebKit, sans retries. Build production, TypeScript, lint ciblé et `git diff --check` passés. Paysages 568×320, 667×375, 844×390, 932×430 ; rotations vers 390×844 et 430×932 ; safe areas et viewport réduit ; tablette 1024×768 et desktop 1440×900. Pas de nouvelle suite globale locale ni de validation sur téléphone physique.

## Affinement après la V2 initiale

Le suivi repart de `d3690a0`, dans la même PR. Quatre fichiers applicatifs sont ajustés : `BiddingPanel`, `GameTable`, `PlayerPanel` et les styles. Les mesures et captures des sections suivantes documentent la V2 initiale ; ce suivi réduit légèrement sa main et stabilise les ancrages du pli.

- Enchères centrées dans l’espace entre les contrôles et la main. Capot suit 160 dans la grille des valeurs, sur mobile et desktop. Les quatre couleurs occupent une grille 2×2 ; SA/TA gardent une colonne séparée. Espacement de 4 px entre choix, 8 px entre valeurs et modes, cibles ≥44×44 px.
- Main de jeu réduite d’environ 11–15 % : hauteurs nominales 89 / 107 / 111 / 122 px sur les quatre paysages avec les insets comparables. Le pli utilise 94 % de cette hauteur et une typographie proportionnelle : le passage de la main à la table garde des proportions proches.
- Ancrages fixes Nord/Est/Ouest/Sud, y compris avec une seule carte : suppression de l’exception qui recentrait la première carte. Les clés et animations existantes sont conservées ; le calque du pli est placé au-dessus de la main, sous les actions et overlays. Test sans rechargement de 1→4 cartes : mêmes nœuds, mêmes coordonnées à 0,1 px près, aucune animation relancée sur une carte déjà posée.
- Ouest/Sud restent à gauche, Nord/Est à droite. Blocs compacts de 60 px ; P directement à droite du nom, hauteur de ligne réservée indépendamment de sa présence. Les emblèmes restent dans le bloc, les noms longs conservent une zone visible.
- Dernier pli : badge visuel de 24 px dans une cible de 44 px, espacé du joueur du bas. Les mini-cartes affichent uniquement leur ordre 1–4 ; le gagnant et les points restent dans le résumé.
- Score live « Direct — Nous/Eux » en haut à droite, alimenté par `getPublicRoundPoints` et orienté selon l’équipe du spectateur ; préférence existante conservée. Le score cumulé et le contrat gardent leur HUD.
- Flèche de sortie, poignée bois, aide Training, confirmations et focus conservés. Aucun changement moteur, backend, auth ou PWA.

Validation du suivi : 69 tests Vitest ciblés, build production, lint et TypeScript passés. Playwright sur production : 168 tests de scènes de jeu, 6 tests d’accessibilité/viewport réduit, 4 tests Training enchères (Chromium + WebKit), et 9 smoke ciblés passés. Le statut CI du SHA est consigné dans la PR. Captures locales de revue : `.playwright/validation/immersive-polish/`.

Ce chantier est limité à la présentation de la table partagée Solo / Multiplayer / Training. Aucun fichier moteur, bot, transport, API, RPC, schéma, migration, scoring, présence, matchmaking ou PWA n’est modifié. Les screenshots de référence évoqués dans le brief n’étaient pas joints : les proportions et affordances décrites ont guidé le travail, avec les composants et le tapis KFFR existants.

## Choix UX

- **Mode immersif mobile** : header sans hauteur réservée, logo masqué, contrôles flottants dans les safe areas. L’audio et le drawer restent en haut à droite ; le thème passe dans le menu de partie. Les insets restent réservés une fois par le shell, avec un fond bois sombre dans ces marges. Le portrait conserve l’invitation existante à tourner le téléphone.
- **Retour en haut à gauche** : confirmation via `AccessibleDialog`, puis navigation vers `/`. Solo avertit de la perte d’une partie non connectée ; Training avertit de la fermeture de la séance et de son bilan. En Multi, c’est une sortie de l’écran : elle ne déclare aucun forfait, et conserve les mécanismes existants de présence/remplacement. Le forfait et la redistribution gardent leurs entrées et confirmations existantes.
- **Flèche sur le bord droit** : le bouton du menu de partie existant devient une poignée de bois, placée dans le rail droit à côté de la main. Elle conserve son nom accessible « Menu Partie », `aria-controls`, `aria-expanded`, Escape et la restitution du focus. Elle donne accès aux scores en direct, préférences, règles Solo et actions Multi déjà existantes. Ce choix réutilise une entrée utile, sans inventer une nouvelle navigation ni dupliquer les actions.
- **`?` en bas à gauche** : uniquement Training. Rappel des axes/niveaux de la séance et du déroulement des questions, avec réutilisation de `ValueGuide`. Même aide accessible depuis le menu de partie. La planification, la correction et les pauses pédagogiques restent inchangées.
- **Main** : hauteur distincte entre enchères et jeu, largeur proportionnelle, chevauchement calculé en conservant au moins 44 px exposés par carte. Les tailles restent grandes à 5, 4, 3 et 1 carte. Les préférences, clics, dimming, surbrillance, animations et callbacks existants sont conservés.
- **Pli** : cartes agrandies, cluster par provenance et ordre de rendu inchangés ; une carte seule est centrée. Le ramassage et le dernier pli conservent leurs actions.
- **Enchères** : surface sombre flottante, largeur plafonnée à 560 px, titre hors du corps de la grille sur paysage court. Toutes les grilles de valeurs/modes restent disponibles et les cibles sont ≥44 px.
- **Actions seules** : si les permissions existantes ne permettent plus de choisir valeur/mode/capot/générale, les contrôles indisponibles sont masqués sur mobile. Passer / Contrer / Surcontrer restent reliés aux mêmes callbacks et confirmations ; aucun recalcul métier n’est introduit. Le panneau est plafonné à 360 px.
- **Annonces** : l’existant sélectionne déjà la dernière annonce de chaque joueur puis le contrat final. Cette sélection est conservée ; chips et positions sont allégées, sans ajouter de pile d’historique.
- **HUD / résultat** : HUD flottant dans l’espace entre les contrôles ; backdrop du résultat renforcé, composition en deux colonnes en paysage court, CTA et détails conservés.

## Mesures avant / après

Captures comparables sur une copie isolée de `main` et sur la branche, fixtures identiques, animations désactivées. Safe areas : haut 8, gauche 44, droite 0, bas 34 px. Les dimensions de pli sont les rectangles rendus (rotation comprise). Le header avant inclut les 8 px de safe area ; le gain net de table est bien 44 px.

| Écran | Hauteur table | Carte de main (largeur × hauteur) | Carte du pli (largeur × hauteur) |
| --- | --- | --- | --- |
| 568×320 | 234 → 278 | 48×50 → 68×100 | 29×42 → 52×76 |
| 667×375 | 289 → 333 | 48×56 → 82×120 | 43×63 → 63×91 |
| 844×390 | 304 → 348 | 48×56 → 85×125 | 43×63 → 66×95 |
| 932×430 | 344 → 388 | 48×56 → 95×140 | 43×63 → 68×99 |

Sur 1024×768, 1120×800, 1440×900 et 1280×450 : **écart géométrique mesuré de 0 px** pour table, mains, joueurs et cartes du pli. Le header reste à 56 px. Données exactes : [measurements.json](mobile-immersive-v2/measurements.json).

## Captures

| État | Avant | Après |
| --- | --- | --- |
| Enchères 844×390 | ![Avant enchères](mobile-immersive-v2/before-844-bidding.png) | ![Après enchères](mobile-immersive-v2/after-844-bidding.png) |
| Pli / main 844×390 | ![Avant jeu](mobile-immersive-v2/before-844-playing.png) | ![Après jeu](mobile-immersive-v2/after-844-playing.png) |
| Pli / main 568×320 | ![Avant petit paysage](mobile-immersive-v2/before-568-playing.png) | ![Après petit paysage](mobile-immersive-v2/after-568-playing.png) |

![Training à 568×320](mobile-immersive-v2/training-568-bidding.png)

![Résultat et détails à 568×320](mobile-immersive-v2/result-568.png)

## Validation

- Vitest complet : **191 fichiers, 1948 tests passés**.
- Lint et TypeScript : passés.
- Suite ciblée Chromium finale sur production : **66 tests passés** (nouvelle suite de 17 tests comprise, dont un contrôle du dernier pli Training après une vraie question).
- Suite ciblée WebKit finale sur production : **65 tests passés**, sans crash.
- Suite smoke complète sur production : **89 tests passés**. Les attentes suivent le thème dans le menu mobile et la nouvelle surface sombre des enchères ; les assertions desktop sont conservées.
- Comparaisons avant / après : 8 scénarios par version, les quatre paysages et quatre références desktop/tablette.
- Build production isolé : passé.
- Suite mobile Chromium complète en production : 362 scénarios passés au premier run ; le dernier test a été corrigé pour attendre le chargement de la partie avant de changer le thème. Ce scénario repasse dans la suite finale **66/66**, avec le nouveau test du dernier pli Training. Aucun échec local Chromium restant ; les workflows du SHA final sont détaillés dans la PR.

La matrice inclut les quatre paysages demandés, portraits 390×844 / 430×932, rotation, safe areas des deux côtés et réduction du viewport dynamique, thèmes clair/sombre, texte agrandi, contraste renforcé, mouvement réduit, focus, enchères extrêmes, confirmations, mains 8→1, plis 1→4, ramassage, dernier pli, Training et résultats avec détails.

Les fixtures UI passent par les vraies pages et les composants, sans écrire de données backend. Les sorties vérifient explicitement l’absence d’intention de jeu. Les tests Training existants exercent également une vraie question, sa correction et la reprise du moteur local.

Limites : safe areas / standalone sont simulés ; les captures et moteurs automatisés ne remplacent pas une prise en main sur iPhone/Android physiques. Les scénarios authentifiés réels avec DB sont exécutés par les workflows existants lorsqu’ils sont déclenchés.
