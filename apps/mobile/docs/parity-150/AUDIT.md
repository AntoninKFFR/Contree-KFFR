# Audit de fidélité Solo web / iPhone — correction de #150

Référence iOS rejetée : `3097e6b1127af16446c8c67f6d80a317bb55d5fa`.
Référence web : fichiers présents dans cette branche, identiques à `origin/main`
(`41c81000b136f2ecce517219e66748c218656ca1`) pour les sources Solo auditées.
`GameTable.tsx` est aussi identique sur `origin/codex/mobile-table-immersive-v2`.
La PR #147 reste ouverte en draft, base `382fa24`. Aucune modification locale
suivie n’était présente avant cet audit ; les fichiers non suivis du checkout
principal sont préservés. Toute correction appartient à la PR #150 existante.

La priorité du propriétaire est une reproduction native fidèle. Elle remplace
les suggestions génériques du guide de migration qui proposent une WebView ou
une nouvelle composition native. Aucun DOM/WebView ne sera ajouté à l’application.
Les comparaisons demandées utilisent les vrais composants web et React Native Web,
avec données de test identiques, sans revendiquer une validation matérielle iOS.

## Matrice initiale et corrections à démontrer

| Fonctionnalité | Référence source | Web observé dans le code | iOS à 3097e6b | Correction prévue / preuve attendue |
| --- | --- | --- | --- | --- |
| Surface de jeu | `GameTable.tsx`, `globals.css:1994–2130` | Scène paysage occupant tout le rectangle sûr, header de jeu à zéro, commandes flottantes | Petit ovale à gauche et gros panneau d’actions à droite | Scène native plein rectangle sûr ; captures de proportions aux trois tailles |
| Feutrine | `globals.css:686–719`, `public/TapisKFFR.png` | Asset KFFR existant, dégradés et vignette ; quatre thèmes | Texture Club Émeraude distincte | Utiliser le tapis web pour Solo, conserver Accueil/Profil et leurs assets |
| Places | `GameTable.tableSeatsFor` | Bas = observateur 0 ; droite = 1 ; haut = 2 ; gauche = 3 | Droite/gauche inversées | Partager un sélecteur pur de places ; tests sur les quatre observateurs |
| Panneaux joueurs | `PlayerPanel.tsx` | Noms, marque P du joueur ayant la main, contour de tour ; pas de mains adverses affichées en Solo | Directions et dos de cartes ajoutés arbitrairement | Même panneau compact ; noms complets accessibles, aucune main adverse |
| Cartes | `CardView.tsx`, CSS cartes | Ivoire #fffef9, rang en haut à gauche et en bas à droite, enseigne centrale, ratio ~0,68 | Rang unique, proportions et taille différentes | Composant RN de mêmes détails et proportions ; comparer boîtes et couleurs |
| Main | `HumanHand.tsx`, CSS 2032–2051 | Éventail intégré au bas de la scène, cartes 74–96 px, pas de bande séparée | Ligne de cartes sous la petite table | Même placement/éventail, hitbox utile >=44 pt mesurée dans la partie visible |
| Tri | `preferences/handSorting.ts` | Tri couleur/force, alternance rouge/noir, atout et préférences | Ordre brut serveur | Réutiliser le module pur, tester les mêmes mains pour les trois modes |
| Cartes légales | `solo/publicState.ts`, `engine/rules.ts` | `getLegalCards` sur main publique + pli + règles ; surbrillance, atténuation et blocage selon préférences | Toutes sélectionnables, refus serveur après envoi | Même fonction pure et même explication, serveur toujours décisionnaire ; tests de parité |
| Toucher une carte | `HumanHand`, `CardView` | Un appui sur carte légale la pose ; feedback local si clic illégal autorisé | Sélection puis bouton « Poser » | Appui direct, état pending et annulation des réponses obsolètes conservés |
| Valeurs d’enchère | `BiddingPanel`, `engine/bidding.ts` | Uniquement les valeurs supérieures autorisées ; sélection directe en grille | +/-10 entre 80 et 160 sans contrat courant | Grille native utilisant `getAvailableBidValues` ; mêmes états vide/coinché/capot/générale |
| Modes et enchères avancées | `BiddingPanel`, règles publiques | Quatre couleurs, SA/TA si autorisés, Capot/Générale, Contrer/Surcontrer selon équipe et statut | Couleurs et passer seulement | Réutiliser permissions pures ; tester intentions et état UI pour chaque action |
| Mode préféré | `BiddingPanel.preferredBidMode` | Dernière couleur du joueur puis partenaire, sinon cœur ; réinitialisation par tour | Pique et ancienne valeur conservés | Extraire/partager le helper pur sans importer de composant DOM |
| Confirmations | `BiddingPanel`, `playerPreferences.ts` | Coinche/Surcoinche/Capot/Générale selon préférences ; draft maintenu pendant confirmation | Absentes pour actions avancées | Même texte, annulation et retour au déclencheur ; jamais de double POST |
| Bulles d’annonce | `GameTable` | Dernière annonce de chaque joueur en enchères, contrat final auprès du preneur ensuite | Journal dans une modale | Bulles aux mêmes places et statuts ; contrat conservé en objet typé |
| Pli | `trickPresentation.ts`, `GameTable.TrickCenter` | Ordre de jeu, couches stables, placement par joueur, cartes plus grandes | Petit groupe au centre de l’ovale | Réutiliser sélecteurs/couches purs, mêmes positions et ordre Z |
| Ramassage | `GameTable`, `soloBotPacing.ts` | Affichage du pli complet puis collecte vers gagnant, automatique ou bouton ; prochain bot attend délai et collecte visuelle | Dernier pli affiché indéfiniment, bots à 600 ms | Même politique de délai et gate, bouton manuel, vainqueur/points serveur |
| Dernier pli | `LastTrickTable` | Bouton après collecte, overlay avec quatre cartes, ordre, gagnant et points | Pli précédent remplace implicitement le pli courant | Overlay natif explicite, sans confondre pli précédent et pli actif |
| Dernière carte forcée | `soloLastTrick.ts` | Dernier pli complet : unique carte humaine légale jouée après délai | Toujours manuelle | Réutiliser les conditions pures, envoyer seulement une intention serveur |
| HUD / points | `GameHud`, `contractProgress.ts` | Petit score en haut à gauche, contrat ; points publics en haut à droite si activés | Gros bloc de score dans panneau droit | HUD compact de mêmes données, pas de calcul indépendant des résultats |
| Fin de manche/partie | `RoundCompletionCard.tsx` | Overlay, contrat et preneur, score manche/partie, détails plis/belote/annonces/multiplicateur, action suivante | Texte et bouton, détails réduits en chaîne | Overlay natif et données riches validées ; scénarios victoire/défaite/tous passent |
| Préférences | `playerPreferences.ts`, `PlayerSettingsPanel.tsx` | Vitesses/délais, collecte, confirmations, aides, tri, styles, thèmes, animations, accessibilité et audio | Aucun panneau dédié | Même modèle/defaults/normalisation, stockage natif ; contrôles réellement branchés et écarts techniques documentés |
| Règles de partie | `SoloPageClient`, `RulesetConfigurator` | Règles prochaine partie ; nouvelle partie confirmée si changement pendant une donne | Preset fixe | Configurateur natif utilisant modèle/presets/validation existants, payload API inchangé |
| Reprise | `sessionApi.ts`, `useSoloGameLoop` | Identifiant par utilisateur dans localStorage ; chargement automatique dans Solo ; pas de découverte interappareil | Identifiant AsyncStorage par utilisateur, bouton de reprise | Même continuité serveur et reprise, sans affirmer une liste de parties absente |
| Sécurité réseau | `soloService`, `server/soloGame`, client iOS | Bearer, propriétaire et versions serveur | Nonces durables, sérialisation et fences déjà implémentés | Conserver ces protections ; aucune migration, RPC/RLS/Auth ou production modifiée |
| Modèle public | `engine/views.ts`, `contract.ts` | PlayerGameView riche sans mains adverses | Contrat, enchères et résultat réduits en textes ; règles et historique perdus | Validation structurée et projection publique complète, tests de rejet des mains privées |

## Points de méthode

- Les fonctions pures de règles/tri/présentation déjà utilisées par le web peuvent
  être partagées. Les transitions `engine/game.ts`, `engine/actions.ts`, les bots
  et les modules serveur restent hors bundle natif. Le serveur valide chaque POST.
- Les captures de référence doivent précéder la nouvelle composition native :
  enchères, début de manche, pli en cours, fin de manche à 844×390, 568×320, 932×430.
  Les captures natives utiliseront les mêmes projections serveur et les mêmes insets.
- Les tests n’emploient que fixtures et serveur/moteur en mémoire. Aucun démarrage
  de partie réelle en production pour une capture ou un test automatisé.
- La découverte interappareil exige un endpoint de lecture des sessions du compte,
  absent actuellement. Une proposition précise sera documentée ; aucune modification
  de backend en production n’est autorisée dans ce chantier.

Ce document décrit l’audit initial, pas une parité déjà acquise. La matrice de
livraison devra remplacer chaque intention par son résultat et ses preuves.
