# Tests E2E Playwright

La suite Playwright est séparée de Vitest. Vitest reste le gate rapide du moteur et des intégrations ; Playwright ouvre un vrai Chromium, passe par HTTP, l'API Next, Supabase et Realtime.

## Installation

```sh
npm ci
npx playwright install chromium
```

En CI Linux, utiliser `npx playwright install --with-deps chromium`. Le navigateur n'est pas une dépendance Git et doit être réinstallé sur une machine neuve.

## Commandes

```sh
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:multiplayer
npm run test:e2e:rating
npm run test:e2e:headed
```

- `test:e2e:smoke` : public, sans compte. Il vérifie home, login, solo, paramètres, multijoueur et l'overflow des pages critiques en Chromium.
- `test:e2e:multiplayer` : quatre comptes et quatre `BrowserContext` indépendants, avec ruleset custom non éligible Elo. Il ne fait pas partie de `npm test`.
- `test:e2e:rating` : seuls les parcours Elo authentifiés `@rating`. Ils requièrent les huit variables de comptes et `E2E_RATING_MUTATION=1`.
- `test:e2e` : lance les deux projets ; l'authentifié est skipped proprement si sa configuration est absente.

Le serveur local est démarré automatiquement avec `npm run dev -- --hostname 127.0.0.1`. Pour vérifier explicitement le build, lancer auparavant `npm run build`; le gate de livraison conserve aussi `npm run build` séparément.

## Cible locale, preview ou production

Sans `E2E_BASE_URL`, la base est `http://127.0.0.1:3000` et Playwright gère le serveur local. Pour une preview, un staging ou une production :

```sh
E2E_BASE_URL=https://example.invalid npm run test:e2e:smoke
```

Sous PowerShell :

```powershell
$env:E2E_BASE_URL = "https://example.invalid"
npm run test:e2e:smoke
```

Aucune URL personnelle n'est codée dans la configuration. Le smoke distant ne modifie pas de données. La suite multijoueur crée des tables seulement si quatre comptes sont explicitement fournis.

## Comptes authentifiés

La suite attend quatre comptes email/password existants et dédiés à l'E2E :

```text
E2E_USER_1_EMAIL
E2E_USER_1_PASSWORD
...
E2E_USER_4_EMAIL
E2E_USER_4_PASSWORD
```

Ne jamais mettre leurs valeurs dans Git, une commande copiée dans un ticket, une capture ou un log. Aucun utilisateur n'est créé automatiquement et aucune service key n'est utilisée. Quand une variable manque, Playwright affiche uniquement son nom et skip le scénario authentifié.

`loginAs(page, credentials)` ouvre `/login`, remplit les champs accessibles, attend la confirmation de connexion et vérifie la présence de la session locale. Le projet `multiplayer` désactive volontairement les traces : une trace d'action d'authentification pourrait conserver les arguments de saisie. Les tests ne logguent ni requêtes d'auth, ni tokens, ni bodies sensibles.

## Tests Elo authentifiés

La suite `@rating` exige les huit noms `E2E_USER_1_EMAIL` à `E2E_USER_4_PASSWORD` décrits ci-dessus, ainsi que `E2E_RATING_MUTATION=1`. En l'absence d'une variable, elle est skipped et n'affiche que les noms manquants. La CI publique n'exécute pas cette commande. Les tests multijoueur génériques sont exclus de `test:e2e:rating` et utilisent un ruleset custom ; `test:e2e:multiplayer` exclut les tests `@rating`.

Cette suite joue une partie officielle à quatre humains avec abandon réel, puis une partie officielle à un humain et trois bots. Elle lit les résumés avant/après via les RPC d'un client connecté, attend la disparition des `pending`, compare les deltas calculés depuis les cotes actuelles des comptes et vérifie l'absence de seconde application lors des refreshs. Elle ne suppose ni Elo initial à 1000, ni position précise, ni comptes vierges. Elle ne crée aucun compte, n'utilise aucune clé service dans Playwright et ne supprime aucun rating. Le nettoyage est limité à la room exacte créée par chaque test.

**Exécuter seulement sur un test ou staging approuvé avec des comptes E2E dédiés.** Chaque partie appliquée reste dans leur historique Elo permanent ; après cinq parties, leur pseudo peut apparaître dans le leaderboard. Aucun reset automatique n'est effectué. Ne pas lancer la suite aveuglément sur une production publique. Voir [rating-operations.md](rating-operations.md) pour le suivi des pending.

Avec `E2E_BASE_URL` distant, les deux suites authentifiées qui lisent l'Elo, `npm run test:e2e:multiplayer` et `npm run test:e2e:rating`, nécessitent `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` de **ce même environnement** dans le runner Playwright. Le helper rating refuse d'utiliser le `.env.local` du checkout pour une cible distante, afin de ne pas lire un autre projet par erreur. Pour le serveur local, il peut lire ces deux valeurs publiques dans `.env.local`.

## Ce que couvre le scénario quatre joueurs

- quatre `BrowserContext` distincts : cookies, session Supabase, localStorage et PlayerPreferences séparés ;
- création et join d'une room KFFR avec noms `E2E_` ;
- course CAS déterministe de deux comptes vers le même siège ;
- quatre sièges uniques, ready et convergence Realtime ;
- préférences bleu/grandes/rapide contre vert/petites/lente, sans POST room ni changement de version ;
- changement host des règles (cible 1500, SA, TA, Générale), reset ready et refus HTTP non-host ;
- start authoritative et une main privée différente par joueur ;
- interception de réponses room sur deux clients, avec échec immédiat si `hands`, identifiants internes ou plusieurs mains sont exposés ;
- action hors tour et carte absente refusées sans changement de version ;
- enchères SA puis TA selon le joueur actif réel, trois passes et un pli complet ;
- fermeture/recréation d'un contexte avec son `storageState` en mémoire, session/siège/main restaurés sans duplication ;
- fermeture réelle d'un `BrowserContext`, puis projection hors ligne après le timeout produit de 60 secondes ;
- activation du bot temporaire par l'hôte sur le siège humain conservé, et progression observée via le tick HTTP réel ;
- reconnexion humaine avec le même `storageState`, heartbeat immédiat, même siège et arrêt automatique du takeover ;
- fin par abandon, apparition de l'archive multijoueur dans l'historique du participant avec partenaires et adversaires cohérents ;
- rematch depuis la room terminée, conservation des sièges humains, reset du ready/takeover et retour au lobby sans démarrage automatique ;
- nettoyage limité à l'id exact créé : forfeit si la partie a commencé, ou libération séquentielle des sièges au lobby.

Ces scénarios authentifiés restent des validations manuelles locales. Ils nécessitent quatre comptes dédiés et ne sont pas exécutés dans la CI publique.

La base actuelle ne fournit pas d'API de suppression de room utilisateur. Le cleanup ne fait donc jamais de wildcard ni de suppression privilégiée : il termine ou vide uniquement la table créée par le test. Les noms `E2E_` permettent de reconnaître les données techniques.

## Storage state et artefacts

Le test de reconnexion garde son `storageState` uniquement en mémoire. Si des états persistants sont générés manuellement, utiliser `.playwright/auth/player1.json`, etc. Le dossier complet est ignoré par Git.

Les dossiers suivants sont également ignorés :

- `playwright-report/` : rapport HTML local ;
- `test-results/` : captures uniquement en échec ;
- `.playwright/` : éventuels états d'auth et tokens.

Le projet public conserve une trace seulement en cas d'échec. Le projet authentifié n'enregistre pas de trace ni de vidéo afin de réduire le risque de fuite de credentials/session.

## CI et dépannage

`.github/workflows/e2e-smoke.yml` lance seulement le smoke public sur push de `main` et pull request. Aucun secret CI n'est requis ou inventé. L'authentifié peut être lancé manuellement dans un environnement disposant déjà des huit variables.

- `browserType.launch: Executable doesn't exist` : exécuter `npx playwright install chromium`.
- Serveur local non prêt : vérifier qu'aucun autre processus défaillant n'occupe le port 3000, puis relancer.
- Authentifié skipped : lire la liste des **noms** de variables manquantes ; ne pas imprimer leurs valeurs.
- Erreur Realtime : vérifier l'URL ciblée, la configuration Supabase de l'application et que les quatre comptes ont un profil joueur.
- Rapport : `npx playwright show-report` après un échec du projet public.
