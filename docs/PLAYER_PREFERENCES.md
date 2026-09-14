# Préférences joueur

Les préférences joueur sont distinctes des règles de partie.

- Le `GameRulesetSnapshot` est partagé, figé au début d'une donne et appliqué par le moteur ou le serveur.
- Les `PlayerPreferences` ne concernent que l'interface du navigateur courant. Elles ne sont jamais ajoutées à une room, un `GameState`, un `PlayerGameView` ou une action réseau.

## Architecture et stockage

Le type, les valeurs par défaut, la normalisation et la persistance se trouvent dans `lib/preferences/playerPreferences.ts`. Le stockage principal est `localStorage`, sous la clé versionnée `coinche:player-preferences:v1`. Une clé absente, un JSON corrompu, une version inconnue ou une valeur incorrecte revient à une copie saine des valeurs par défaut sans faire planter l'application.

L'abstraction `PreferenceStorage` garde la lecture et l'écriture indépendantes de `window`. Elle constitue aussi le point d'extension pour une éventuelle fusion future avec les préférences d'un profil cloud, sans changer les types du moteur ou de la room.

`PlayerPreferencesProvider` lit le stockage une fois côté client, conserve les valeurs en mémoire et expose `usePlayerPreferences()`. Le même `PlayerSettingsPanel` est utilisé en solo, dans le lobby multijoueur et pendant une partie multijoueur.

## Jeu et vitesse

Les quatre presets utilisent le mapping central `GAME_SPEED_PRESETS` :

| Vitesse | Bot | Pli terminé | Enchère bot |
| --- | ---: | ---: | ---: |
| Lente | 1200 ms | 1800 ms | 800 ms |
| Normale | 700 ms | 1200 ms | 500 ms |
| Rapide | 300 ms | 650 ms | 250 ms |
| Instantanée | 0 ms | 0 ms | 0 ms |

Le mode **Personnalisée** apparaît dès que l'un des trois délais fins est modifié : réflexion visuelle des bots (0–2000 ms), affichage du pli (0–3000 ms) ou délai entre enchères (0–1500 ms). Un preset n'est jamais affiché si les valeurs persistées ne lui correspondent pas.

Ces délais sont uniquement visuels. En solo, la décision du bot est calculée immédiatement puis appliquée après le délai choisi. Les simulations et le moteur ne connaissent pas ces délais. En multijoueur, les timers et les bots autoritaires du serveur ne lisent jamais les préférences d'un client.

Le ramassage automatique attend la durée du pli. S'il est désactivé, l'état autoritaire continue d'avancer mais la présentation conserve localement les trois cartes d'une Générale ou les quatre cartes d'un pli normal jusqu'au bouton **Continuer**.

## Aides

La mise en évidence, l'atténuation et le clic sur une carte interdite sont indépendants. Désactiver le blocage du clic affiche une explication issue de `explainIllegalCard`, lui-même fondé sur `getLegalCards`. Cette préférence ne permet donc jamais de contourner la légalité du moteur ou du serveur.

Le score en direct utilise uniquement les plis terminés, les annonces devenues publiques et la Belote publique. La progression du contrat réutilise le ruleset figé pour déterminer si les annonces, la Belote, le contrat annoncé ou la défense participent à l'objectif. Capot et Générale sont présentés en nombre de plis. Le dernier pli ne montre que des cartes déjà publiques.

## Cartes et affichage

Le tri est une copie de présentation : il ne modifie ni les objets `Card`, ni leur identité dans le moteur. Les modes disponibles sont couleur/valeur et valeur/couleur. L'ancien choix « Manuel », qui ne proposait pas de réorganisation persistante réelle, est normalisé vers couleur/valeur et n'est plus exposé. Désactiver le tri automatique conserve l'ordre reçu. L'ordre des quatre couleurs est configurable avec des contrôles haut/bas et un aperçu visuel. Les contrats couleur, Sans Atout et Tout Atout passent tous leur mode explicite au tri.

Trois tailles de cartes, deux styles CSS (**Classique** et **Moderne**) et quatre palettes de tapis centralisées sont disponibles. La grande taille est limitée de façon responsive sur les petits écrans. Les animations ont un interrupteur global et des sous-options effectives pour la distribution, les cartes jouées, les plis et les enchères. Le réglage **Réduire les animations** et `prefers-reduced-motion` du navigateur ont toujours priorité.

## Son et accessibilité

Le son est désactivé par défaut. Les retours de carte, pli, enchère et interface sont générés localement avec Web Audio, sans ressource tierce. Le contexte audio est réutilisé et repris au besoin ; les refus d'autoplay et contextes suspendus sont silencieusement ignorés. Le volume et les familles de sons se règlent séparément, avec un bouton **Tester le son** qui emprunte le même pipeline.

Le contraste renforcé ajoute des bordures et contours plus marqués, sans reposer uniquement sur une couleur. Une taille de texte agrandie est également disponible. **Réinitialiser les paramètres** restaure seulement `DEFAULT_PLAYER_PREFERENCES` et ne touche jamais aux règles de la partie.

## Navigation et accessibilité

Le panneau utilise les mêmes six sections en solo et en multijoueur. Une navigation latérale occupe l'espace disponible sur desktop ; sur mobile, les sections deviennent une barre compacte horizontale afin d'éviter le mur de réglages. La recherche ouvre directement la section pertinente. Les réglages avancés de rythme restent repliables.

La modale possède un en-tête fixe, ferme avec Échap ou le fond, bloque le scroll de la page, garde le focus dans le dialogue et le restitue au déclencheur. Il n'existe pas de faux bouton de sauvegarde : chaque changement est persisté immédiatement. Les confirmations Coinche, Surcoinche, Capot et Générale sont des popovers accessibles avec **Annuler** / **Confirmer** ; si leur préférence est désactivée, l'action reste immédiate.
