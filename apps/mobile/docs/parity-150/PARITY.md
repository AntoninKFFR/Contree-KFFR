# Bilan de fidélité — correction de la PR #150

Référence : vrai Solo web KFFR à `41c8100`, sur le socle natif validé #147
(`382fa24`). Correction de #150, conservée en draft, sans fusion ni production.
L'[audit initial](AUDIT.md) décrit le rendu rejeté et les sources étudiées.

## Preuves visuelles

Douze états capturés sur le vrai `/solo` web avant comparaison native : enchères,
début de manche, pli en cours et résultat, à 844×390, 568×320 et 932×430.
Les états proviennent du moteur existant, puis de sa projection publique ; aucune
main adverse ni état de jeu inventé pour embellir les images. Les douze captures
React Native Web utilisent la même projection, vérifiée par SHA-256, et les mêmes
insets gauche/droite/bas (47/47/21 px). Aucun serveur réel n'est muté.

| Taille | Planche des quatre états | Comparaison |
| --- | --- | --- |
| 844×390 | [Web / natif](captures/comparison-844.png) | Gauche : vrai web ; droite : composants RN Web |
| 568×320 | [Web / natif](captures/comparison-568.png) | Idem, petit paysage |
| 932×430 | [Web / natif](captures/comparison-932.png) | Idem, grand paysage |

L'[outil HTML](comparison.html) permet de filtrer les tailles. Les 24 PNG sources
et métadonnées se trouvent dans `captures/`. Les placements de la table, des
places, des cartes de la main, des enchères et de la zone de pli sont comparés
automatiquement à un pixel près ; ce seuil ne prétend pas mesurer les polices
ou l'équivalence de chaque pixel. Les trois planches ont été inspectées.

## Matrice réellement portée

| Fonctionnalité | Référence partagée ou portée | Résultat et preuve |
| --- | --- | --- |
| Scène immersive | `GameTable`, CSS paysage, `SoloScene` | Même feutrine, rectangle sûr et composition ; 12 paires, gros panneau supprimé |
| Places et joueurs | `tableSeatsFor`, `PlayerPanel` | Sud 0, Est 1, Nord 2, Ouest 3 ; noms, marque P et tour ; tests/captures |
| Cartes et main | `CardView`, `HumanHand`, `handSorting` | Ivoire, deux rangs, enseigne, ratio, éventail et tri partagés ; mesures des cartes et hitboxes utiles |
| Légalité et pose | `publicState`, `engine/rules`, `ruleDebug` | Même aide/explication ; appui direct ; refus local selon préférences puis validation finale serveur ; tests carte illégale et vraie partie mémoire |
| Enchères | `engine/bidding`, `biddingPresentation` | Valeurs/modes/permissions/confirmations partagés ; SA/TA, Capot/Générale, Coinche/Surcoinche, passer ; tests des payloads versionnés et annulations |
| Bulles et HUD | `tableAnnouncements`, `contractProgress` | Annonces et contrat structurés, points publics et statut dans la scène ; captures + projection testée |
| Pli et ordre | `trickPresentation`, `presentation-store` | Couches stables, dernières cartes seulement animées, pas de replay à la reprise ; tests de présentation et captures |
| Ramassage et bots | `soloBotPacing` | Collecte automatique/manuelle, attente du pli et du délai, arrêt hors Solo ; tests navigation/présentation |
| Dernier pli | `soloLastTrick`, cartes publiques | Overlay demandé, ordre, vainqueur, points et dernière carte forcée selon helper existant ; tests |
| Résultat | `RoundCompletionCard`, résultat serveur | Contrat/preneur, score manche/partie, détails plis/belote/annonces/multiplicateur, manche suivante et fin ; captures + tests moteur/transport |
| Préférences | `playerPreferences`, `presentation` | Même modèle/defaults/normalisation ; contrôles reliés et persistance, 4 thèmes, tri, aides, délais, animations, accessibilité, sons/musique ; tests réels Expo UI |
| Règles suivantes | presets/merge/validation du moteur | Brouillon jusqu'à sauvegarde ; « Appliquer et nouvelle partie » remplace volontairement une partie active comme web, nonce/règles liés si réponse incertaine ; tests UI et contrôleur |
| Reprise et compte | API Solo existante | GET local connu et reprise comme web ; propriétaire/versions/fences/annulation conservés ; tests contrôleur, navigation et transport |
| Modèle public | `PlayerGameView`, parseur natif | Contrats/résultats/règles/historique conservés en objets validés ; champs inconnus filtrés, mains adverses rejetées ; tests de parité et malformations |
| Autorité | API et moteur serveur inchangés | Aucune transition/bot natif ; source map iOS auditée, tests complets moteur/actions ; aucune modification Supabase |

## Différences et limites explicites

- Les polices, ombres, flous et contrôles de formulaire suivent leur plateforme.
  Les captures sont **RN Web, pas iOS matériel** ; aucun objectif de pixel perfect
  ou de fluidité mesurée sur iPhone n'est affirmé.
- À 568 px, la grille web possède un débordement horizontal dû à ses minima.
  Le port contient la grille et déplace SA/TA dans la rangée d'actions quand
  nécessaire. Les commandes restent les mêmes et le plateau ne défile pas.
- Les paramètres et confirmations utilisent des feuilles natives accessibles,
  avec défilement secondaire. Le bouton inférieur ouvre le menu Partie ; le
  tiroir global du site n'est pas reproduit, pour préserver les routes natives
  Accueil/Profil et les autres modes.
- La préférence `cardSize` reste conservée. Comme le CSS paysage web de référence,
  la table utilise ses clamps de hauteur ; elle ne promet pas un agrandissement
  supplémentaire qui ferait sortir la main de l'écran.
- La même playlist publique est disponible dans Solo, avec les mêmes métadonnées
  et pistes. L'audio est limité à Solo au premier plan ; le lecteur global du
  site sur les autres pages n'est pas porté. Son et musique nécessitent encore
  une écoute réelle dans Expo Go.
- La découverte interappareil est absente des deux clients actuels : UUID stocké
  localement. Voir la [proposition backend précise, non appliquée](CONTINUITY.md).
- Le natif reste réservé aux comptes connectés, comme la fondation existante.
  Le Solo anonyme local du web n'est pas porté : il utilise un moteur côté client,
  exclu de cette PR où les transitions restent exclusivement sur le serveur.
- QA physique encore nécessaire sur iPhone 15 : deux sens paysage, animations et
  ramassage avec/sans Reduce Motion, VoiceOver, clavier des règles, son, musique,
  arrière-plan/reprise et absence de double action. Aucune nouvelle validation
  physique n'est revendiquée ; aucun build signé, achat ou simulateur payant.

## Outils et contrôles

Skills officiels Expo présents localement : 26 répertoires sous
`C:/Users/Antonin/.agents/skills`. Le plugin Expo avait été installé lors du
chantier précédent ; cette correction ne réinstalle aucun outil. Guides lus et
appliqués : `expo-overview`, `expo-native-ui`, `expo-router`, `expo-animation`,
`expo-design-system`, `expo-ui`, `expo-web-to-native`, `expo-data-fetching` et
`expo-upgrade`. La consigne de fidélité du propriétaire prime sur les conseils
génériques proposant une nouvelle composition ou une WebView.

Résultats locaux et CI : voir [suivi de livraison](migration-progress.md).
Les tests verts sont des preuves ciblées, pas une déclaration que toute
l'expérience matérielle iPhone est terminée.
