# Captures de parité

Les PNG sont des rendus des vrais composants React Native Web et des clients web Next.js. Les tailles désignent le viewport, pas un modèle d’iPhone physique.

| Preuve | Fichiers dans captures/ |
| --- | --- |
| Catalogue, calcul, correction identiques en seed/progression | native-catalogue / native-number / native-correction et web-catalogue / web-number / web-correction, suffixes 568, 844, 932 ; paramètres complets comparison-*.json |
| Quatre axes mémoire | native-master-cards, native-master-in-hand, native-played-cards, native-trick-recall aux trois tailles |
| Déduction et annonces | native-opponent-voids, native-bidding, native-bid-reading aux trois tailles |
| Autres modes | native-conventions, native-pile-count, native-challenge, native-game aux trois tailles |
| Duo natif hôte / web invité | duo-native-web-*-question / correction / result |
| Duo web hôte / natif invité | duo-web-native-*-question / correction / result |
| Vraie table native / bots locaux | native-game-paused-844 et native-game-correction-844 |

Les contrôles Playwright font défiler les contenus pour exercer les actions ; une capture du haut de page ne présente pas toutes les corrections ou les longues conventions. Les preuves JSON détaillent le parcours complet.
