# Réservation et position des places — PR #152

## Cause du retour au sud, reproduite puis validée sur iPhone

Sur la base `9b914d9`, le lobby utilisait `tableSeatsFor` avec
`viewerPlayerId = room.viewerSeatIndex`. Cette projection convient à la **partie**
(joueur local en bas), mais pas au lobby : chaque réservation réussie faisait
tourner les quatre cases et ramenait le joueur au sud. Le web garde ses positions
fixes : 0 bas, 1 droite, 2 haut, 3 gauche.

Les anciens tests vérifiaient que la case portant le bon identifiant contenait
« Moi », sans vérifier où elle était affichée. Ils passaient malgré ce défaut.
L'ajout d'une comparaison des coordonnées avant/après a échoué avant la correction :
la place de droite passait de `(701, 141.5)` à `(387.5, 220)` sur 844 × 390,
alors que le serveur de test confirmait bien cette place.

`NativeLobby` utilise désormais les quatre positions fixes du web. La projection
de la table de jeu, les animations, le tri et le gameplay restent inchangés.
Le propriétaire a rechargé le bundle Expo et répondu **« yes all good ! »** au
test haut → quitter → droite. Il signale encore un petit délai de confirmation.
Cela valide ce scénario physique, sans prétendre valider tous les cas réseau
ou toutes les places sur matériel.

## Défauts de transport supplémentaires démontrés

Trois tests échouaient également avant le correctif du contrôleur :

1. `requiresSync` provoquait un refus silencieux, sans POST ni explication.
2. Un HTTP 200 avec version supérieure mais sans la place demandée était accepté.
3. Un GET démarré avant le POST pouvait annuler la place confirmée, même à version
   égale. Les lectures serveur du salon et des joueurs sont indépendantes ; le
   client ne doit pas publier une ancienne lecture après sa mutation.

La réservation possède maintenant des phases explicites : actualisation,
envoi, confirmation ou échec. Le verrou est pris avant toute attente ; les doubles
appuis n'envoient pas de deuxième POST. Une synchronisation nécessaire précède
l'envoi. Un succès exige une version supérieure et `viewerSeatIndex === seatIndex`.
Les GET/heartbeats antérieurs sont écartés ; les rafraîchissements demandés pendant
le POST reprennent après sa réponse. Les autres intentions gardent leur chemin.

Après refus, 409 ou réponse ambiguë, un nouveau GET réconcilie la vue sans rejouer
le POST. Une réservation déjà enregistrée peut être confirmée par ce GET ; sinon
le message reste visible malgré les lectures de présence, jusqu'à fermeture ou
nouvel essai explicite. « Moi » provient uniquement de la vue serveur confirmée.

Les traces `[lobby-seat]` ne fonctionnent qu'en développement : appui, blocage,
synchronisation, envoi HTTP, statut/code filtré, versions, place avant/après,
réconciliation et confirmation. Aucun token, identifiant de compte, nom, URL,
corps de réponse ou donnée de jeu n'est journalisé.

## Délai de confirmation

Sur une vue synchronisée, `move(join-seat)` appelle immédiatement `fetch`, dans
le même tour JavaScript, sans timer, debounce, GET préalable ou attente Realtime.
Les quatre tests de réservation vérifient cet envoi avant toute résolution de
promesse. L'affichage confirmé utilise directement la réponse POST.
Il reste l'aller-retour réseau et le traitement autoritaire du serveur ; aucune
mesure de latence matérielle ni amélioration chiffrée n'est revendiquée.
Le backend n'a pas été modifié pour cette demande.

## Tests et preuves

- 20 tests purs dédiés : quatre places, actualisation nécessaire/en cours,
  version obsolète, 200 correct/incorrect, réseau/503, conflit et reprise explicite,
  réponse perdue, anciens GET/heartbeat, arrière-plan, session et diagnostic filtré.
- 6 tests supplémentaires avec le vrai routeur et les composants React Native :
  réussite, synchronisation, conflit, mauvaise confirmation, HTTP et arrière-plan.
- Deux contrôleurs/API natifs face au serveur de test en mémoire : deux comptes
  visent simultanément la même place, un seul gagne, le perdant réconcilie puis
  choisit explicitement une autre place. Ce test ne remplace pas la CI PostgreSQL.
- Quatre refus tactiles avec les vrais composants RN Web : 200 incorrect, 503,
  réseau, 409. Un POST, message persistant après rafraîchissement, puis un deuxième
  POST uniquement au nouvel appui, avec vérification de la place autoritaire.
- Les quatre cases gardent exactement leurs coordonnées aux trois tailles
  568 × 320, 844 × 390 et 932 × 430, encoche des deux côtés : **24 réservations**.
- Haut → gauche → quitter → droite, puis actualisation : coordonnées inchangées,
  état serveur vérifié et exactement trois réservations plus une libération.

Captures **des composants RN Web réels avec transport de test**, pas d'iPhone :
[avant](seat-reservation/fixed-positions-before.png),
[haut confirmé](seat-reservation/fixed-positions-confirmed-2.png),
[gauche confirmée](seat-reservation/fixed-positions-confirmed-3.png),
[droite après libération](seat-reservation/fixed-positions-rejoin-1.png).
[Coordonnées et intentions](seat-reservation/fixed-positions.json).
[Refus HTTP](seat-reservation/http-refused.png),
[nouvel essai confirmé](seat-reservation/http-confirmed.png).
Les quatre fichiers `*-trace.json` fournissent les diagnostics non sensibles.
Les logs `baseline-controller.log` et `spatial-baseline.log` montrent les échecs
avant correction ; `spatial-fixed.log` montre les 11 cas ciblés réussis.

Validation locale : typecheck/lint racine et mobile ; **1 967 tests racine**,
**60 tests purs mobiles + 32 UI/navigation**, **205 tests géométrie/interactions**,
**110 E2E de parité web/natif et crossplay** ; export iOS avec source maps et
graphe Metro **1 778 sources**, sans serveur, moteur de transition, bots ou fixtures.
Les contrôles CI au SHA poussé sont rapportés dans la PR, sans réutiliser l'état
vert de l'ancien commit. `git diff --check` réussit.

## Recharger Expo Go

Le serveur existant du worktree reste ouvert via `npm run tunnel` :
`exp://hkl3cpu-antoninkffr-8081.exp.direct`. Le manifeste iOS SDK 57 et le bundle
HTTP 200 ont été vérifiés avec les positions fixes et le contrôleur corrigé.
Recharger dans Expo Go, rejoindre le lobby et choisir une place libre.

Aucun backend, SQL, RLS, Auth ou fichier d'animation/tri n'a été modifié ; aucune
mutation automatique de production, migration, fusion ou publication n'est faite.
La PR #152 reste DRAFT. Les autres scénarios physiques réseau/multiappareils
restent distincts de la validation haut/quitter/droite rapportée ci-dessus.
