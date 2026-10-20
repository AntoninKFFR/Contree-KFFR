# Solo iPhone — port natif du Solo web (#150)

La correction remplace la petite table et son panneau latéral par la scène du
Solo web : feutrine KFFR existante, quatre places, main en éventail intégrée en
bas, cartes au centre, enchères et HUD dans la table. Les composants sont en
React Native, sans WebView. Accueil, Profil, Auth et navigation restent ceux de
la PR #147, sans barre inférieure.

Le [bilan de parité](docs/parity-150/PARITY.md) distingue les équivalences
vérifiées et les différences restantes. L'[audit initial](docs/parity-150/AUDIT.md)
conserve les références étudiées avant le port. Les [comparaisons](docs/parity-150/comparison.html)
montrent le code web et React Native Web aux mêmes états publics et dimensions.
Elles ne constituent pas des captures matérielles iOS.

## Jeu et autorité serveur

Les endpoints existants de `https://contree-kffr.vercel.app/api/solo/sessions`
restent l'unique autorité de transition et de résultat. Le jeton Bearer vient de
l'AccountProvider existant ; propriétaire, `expectedVersion`, nonces durables,
annulation, sérialisation et réconciliation sont conservés. Aucune mutation
automatique n'est réessayée après un résultat réseau incertain.

Le modèle conserve une projection structurée et validée de `PlayerGameView` :
contrat, enchères, règles, plis, annonces et résultats. Il rejette les mains
adverses. Seuls les helpers TypeScript purs déjà employés par le web sont partagés
pour les permissions d'enchère, le tri, les cartes légales, leurs explications,
les places et la présentation. Aucun moteur de transition, bot ou module serveur
n'est inclus dans le bundle iOS ; `npm run bundle:check` contrôle sa vraie source map.

Un appui sur une carte légale envoie directement l'intention de jeu. Les aides,
blocages et explications des cartes illégales suivent les préférences web. Le
serveur revalide chaque action ; le client n'avance la main qu'après sa réponse.
Les modes SA/TA, Capot, Générale, Coinche et Surcoinche n'apparaissent que lorsque
les règles et permissions publiques les autorisent. Les confirmations partagent
les mêmes fonctions et textes que le web.

Les plis gardent l'ordre et les couches du web, un ramassage automatique ou
manuel, le dernier pli et son vainqueur. Les délais des bots attendent aussi la
présentation du pli. Distribution, pose, annonces et collecte respectent les
préférences et Reduce Motion. Les scores et la progression viennent du serveur.

## Sauvegarde et cycle de vie

L'enregistrement AsyncStorage `kffr-native-solo:v1:<userId>` contient l'UUID de
partie et la clé de création ; pendant une création incertaine, les règles
initiales restent associées à cette même clé. Aucun jeton ou main n'y est stocké.
Ouvrir Solo sans sauvegarde ne crée rien. Ouvrir une sauvegarde connue la recharge
par GET puis reprend le jeu, comme le web. Seul un 404 confirmé efface son UUID.

Le compte/jeton, la sortie de Solo, le portrait et l'arrière-plan suspendent les
intentions automatiques. Les requêtes obsolètes sont invalidées. Au retour actif,
le compte existant est vérifié et un GET réconcilie la version avant de continuer.
La musique s'arrête à la sortie ou à l'arrière-plan.

L'[audit de continuité](docs/parity-150/CONTINUITY.md) confirme la configuration
publique du même projet Supabase et décrit la limite réelle : **pas de découverte
automatique d'une partie commencée sur un autre appareil**. L'endpoint proposé
pour la résoudre n'est pas implémenté. Aucun changement SQL, RPC, RLS, Auth,
historique, progression ou production n'est introduit.

## Préférences et dépendances SDK 57

Les préférences utilisent le schéma, les valeurs par défaut et la normalisation
web, avec stockage natif : délais, confirmations, collecte, tri, aides, thèmes,
styles, contraste, taille du texte, animations, sons et musique. Les règles de
prochaine partie utilisent les presets et la validation existants. Sans partie,
elles sont sauvegardées pour le prochain démarrage ; pendant une partie,
« Appliquer et nouvelle partie » crée volontairement son remplacement, comme
sur le web, sans changer les règles de l'ancienne sauvegarde serveur.
Seules les feuilles secondaires défilent.

`@expo/ui` fournit les véritables contrôles natifs Switch/Picker/Slider/Host ;
`expo-blur` le fond du résultat ; `expo-audio` les sons équivalents et la playlist
publique existante. `expo-asset` est la dépendance nécessaire de chargement.
Versions sélectionnées par `expo install`, sans changer SDK 57. Aucune permission
microphone, lecture audio d'arrière-plan ou compilation payante n'est ajoutée.
`expo-crypto` conserve les UUID sûrs. Expo Go SDK 57 reste la cible d'essai.

## Validation et essai physique

Les tests utilisent exclusivement des fixtures, transports simulés et un moteur
serveur en mémoire, sans parties de production. Les captures RN Web utilisent les
vrais composants et Reanimated, sans remplacement visuel. Le banc Vite installe
le vrai polyfill Expo avant le chargement de l'application ; son build groupé
évite l'épuisement des sockets Windows observé en mode développement.

Commandes : `npm run check`, `npm test`, `npm run test:geometry`,
`npm run native:check`, `npx expo install --check`, `npx expo-doctor`,
`npm run export:ios -- --source-maps`, `npm run bundle:check`.
À la racine : typecheck, lint, Vitest, build, smoke et configuration
`playwright.solo-parity.config.ts`. La CI vérifie aussi le projet iOS généré et
les navigateurs Chromium/WebKit.

Pour l'iPhone : lancer `npm run tunnel -- --port 8088` avec la configuration
publique existante du [README](README.md), puis ouvrir le QR dans Expo Go SDK 57.
Tester les deux paysages, un démarrage volontaire, les enchères, la pose directe,
le dernier pli, les paramètres, le résultat/manche suivante, puis sortie/reprise
et arrière-plan. Vérifier VoiceOver, Reduce Motion et audio sur le matériel.
La nouvelle table n'a pas encore reçu cette QA physique ; l'ancienne validation
du prototype ne doit pas être réutilisée comme preuve.
