# PRD — Socle produit Contrée KFFR

> **Statut : document de référence de l'existant.**
> Ce PRD décrit ce qui est **déjà codé** dans le dépôt `AntoninKFFR/Contree-KFFR`.
> Il ne contient aucune fonctionnalité future : les modules à venir font l'objet de PRD dédiés
> (`docs/PRD-<module>.md`), qui s'appuient sur ce socle.
>
> Référence de rédaction : commit `1c8d8b4` (`feat(auth): add Google sign-in through Supabase`), branche `main`.
> Chaque affirmation est ancrée dans un fichier du dépôt. Les points non vérifiables sont signalés comme tels.

---

## 1. Résumé exécutif

Contrée KFFR est une application web de contrée / coinche à quatre joueurs (deux équipes de deux),
jouable en solo contre trois bots ou en multijoueur en ligne. Elle est construite en Next.js 15
(App Router), TypeScript et Tailwind, avec Supabase pour l'authentification et la persistance, et
déployée sur Vercel.

Le produit repose sur trois fondations qui le distinguent d'un simple portage de jeu de cartes :

1. **Un moteur de règles pur** (`engine/`), sans aucune dépendance React, réseau ou Supabase. Il est
   l'unique autorité sur la légalité d'un coup, la résolution d'un pli et le calcul d'un score.
2. **Un système de règles configurables et versionnées** (`engine/rulesets/`). Chaque partie fige un
   `GameRulesetSnapshot` complet : une évolution ultérieure des règles ne réécrit jamais l'histoire
   d'une partie déjà jouée.
3. **Un multijoueur server-authoritative**. Le `GameState` complet vit côté serveur ; le navigateur ne
   reçoit qu'une `PlayerGameView` filtrée. Aucune main adverse ne transite vers le client.

S'y ajoutent une IA de bots développée et benchmarkée de façon empirique (plus de 9 000 parties
simulées, rapports versionnés dans `reports/`), un historique de parties, un tableau de bord
statistique détaillé, et une couche de préférences de confort locale au navigateur.

Le produit est aujourd'hui en diffusion restreinte, avec une ambition grand public.

---

## 2. Vision et objectifs produit

### 2.1 Problème adressé

Les applications de coinche existantes permettent de jouer, rarement de **comprendre** ou de
**progresser**. Le projet vise une application où le jeu est fidèle à un règlement explicite, où les
bots sont crédibles et mesurés, et où le joueur dispose à terme d'outils de compréhension de ses
propres décisions.

### 2.2 Public visé

- **Aujourd'hui** : diffusion restreinte (cercle proche, comptes authentifiés).
- **Cible** : grand public joueur de coinche/contrée, avec des niveaux hétérogènes et des habitudes
  régionales variées.

> **Conséquence produit, structurante pour tous les modules à venir.** Un public élargi ne partage
> pas les conventions d'une table donnée. Toute fonctionnalité qui « corrige » le joueur doit afficher
> le référentiel qu'elle applique et le présenter comme *la doctrine de l'application*, non comme une
> vérité universelle.

### 2.3 Principes directeurs (observés dans le code, à préserver)

| Principe | Traduction technique | Preuve |
|---|---|---|
| Le moteur fait autorité | `engine/` est pur, testé, sans import React/Supabase | `engine/*.ts` |
| Les règles sont des données | `GameRulesetSnapshot` gelé et versionné par partie | `engine/rulesets/presets.ts` |
| Le serveur ne fait pas confiance au client | Intentions validées, `GameState` jamais envoyé brut | `lib/server/`, `engine/views.ts` |
| Une partie jouée est immuable | Snapshot de règles + noms figés dans l'historique | `supabase/migrations/20260913010000_*.sql` |
| Le confort n'est pas une règle | `PlayerPreferences` local, jamais dans `GameState` | `docs/PLAYER_PREFERENCES.md` |
| Les décisions IA sont mesurées | Benchmarks reproductibles et rapports versionnés | `reports/`, `scripts/benchmark*.ts` |

---

## 3. Périmètre du socle existant

### 3.1 Moteur de jeu

**Objectif.** Être l'unique source de vérité sur les règles : distribution, enchères, légalité des
cartes, résolution des plis, belote, annonces, capot, générale, scoring.

**Périmètre actuel.**

- Jeu de 32 cartes, 8 par joueur, deux équipes fixes (sièges 0+2 contre 1+3).
- Partance tirée au sort puis tournante ; la partance parle en premier et entame le premier pli.
- Enchères de 80 à 160 par paliers de 10, capot comme contrat distinct supérieur à 160, coinche et
  surcoinche.
- Modes de contrat explicites : couleur, Sans Atout, Tout Atout (`ContractMode` discriminé).
- Contrat Générale : l'annonceur doit gagner seul les huit plis ; son partenaire conserve ses cartes
  mais ne joue pas, les plis passent à trois cartes.
- Belote/Rebelote, annonces de combinaisons (tierce, cinquante, cent, carrés).
- Scoring FFB avec arrondi à la dizaine, bases de chute, capot et générale, multiplicateurs de
  coinche/surcoinche.

**Points d'entrée techniques.**

| Fichier | Rôle |
|---|---|
| `engine/game.ts` | Machine à états de la donne et de la partie (`createInitialGame`, `makeBid`, `playCard`, `startNextRound`) |
| `engine/rules.ts` | Légalité (`getLegalCards`, `isLegalCard`), résolution (`getTrickWinner`), barème (`cardPoints`) |
| `engine/bidding.ts` | Enchères, coinche, surcoinche, capot, générale |
| `engine/scoring.ts` | Calcul du score de donne selon le ruleset |
| `engine/announcements.ts` | Détection, comparaison et résolution des annonces |
| `engine/belote.ts` | Détection et déclaration Belote/Rebelote |
| `engine/contractMode.ts` | Normalisation couleur / SA / TA, y compris états legacy |
| `engine/activePlayers.ts` | Joueurs actifs d'une donne (gère le siège inactif en Générale) |
| `engine/contractProgress.ts` | Points publics de la donne et avancement du contrat |
| `engine/views.ts` | `toPlayerGameView` : projection filtrée d'un `GameState` pour un siège |
| `engine/types.ts` | Types partagés (`GameState`, `Contract`, `Trick`, `RoundResult`…) |
| `engine/random.ts` | Générateur seedé, pour la reproductibilité des tests et simulations |
| `engine/illegalCardExplanation.ts` | Message expliquant pourquoi une carte est illégale |

**Limites connues.**

- `GameState` contient les quatre mains. Toute fuite vers le client passe obligatoirement par
  `toPlayerGameView` ; il n'existe pas de garde-fou de type empêchant structurellement de sérialiser
  un `GameState` brut vers le navigateur. La discipline est aujourd'hui humaine et testée
  (`tests/views.test.ts`, `tests/gameStateValidation.test.ts`), pas garantie par le typage.

---

### 3.2 Règles configurables (rulesets)

**Objectif.** Permettre des variantes de règles sans dupliquer le moteur, et garantir qu'une partie
jouée reste interprétable dans les règles sous lesquelles elle a été jouée.

**Le point le plus important de ce chapitre.** Il n'existe **pas un règlement unique** dans le produit.
Il existe :

- un **preset de référence**, `CONTREE_KFFR_RULESET` (`engine/rulesets/presets.ts`), version 1 :
  score FFB, cible 1000, belote activée à 20 points comptant pour la réussite et pour la chute,
  capot autorisé (base 250), dernier pli à 10, arrondi à la dizaine, `minBid` 80 / `maxBid` 160 ;
  **annonces désactivées**, **Sans Atout, Tout Atout et Générale désactivés** ;
- un **système de surcharges à liste blanche**, `engine/rulesets/custom.ts`, qui autorise le joueur à
  activer précisément ce que le preset désactive : `allowNoTrump`, `allowAllTrump`, `allowGenerale`,
  `announcements.enabled` et ses quatre familles, la belote, les bases de score, les multiplicateurs,
  la cible.

Dès qu'une seule option diffère du preset, l'identifiant du snapshot bascule sur `"custom"`. Le
produit expose donc une **combinatoire de règlements**, pas un règlement.

> **Règle à respecter par tout module futur.** Aucune fonctionnalité dépendant des règles (valeur d'un
> pli, total d'une donne, cartes maîtresses, correction d'une enchère) ne peut être calculée dans
> l'absolu. Elle doit être rattachée à un `GameRulesetSnapshot` explicite, comme l'est déjà
> `GameState.settings.ruleset`.

**Points d'entrée techniques.**

| Fichier | Rôle |
|---|---|
| `engine/rulesets/types.ts` | `GameRulesetSnapshot` : partie, enchères, jeu de la carte, annonces, belote, réussite, scoring |
| `engine/rulesets/presets.ts` | `CONTREE_KFFR_RULESET`, clonage et gel profond |
| `engine/rulesets/custom.ts` | Liste blanche `ALLOWED`, parsing strict, dépendances entre options |
| `engine/rulesets/validation.ts` | Validation d'un snapshot |
| `engine/rulesets/resolve.ts` | Résolution des règles applicables depuis `GameSettings`, y compris états legacy |
| `engine/rulesets/room.ts` | Règles côté salon multijoueur |
| `engine/rulesets/rulesetDiff.ts` | Différentiel entre deux snapshots (affichage) |
| `components/rules/RulesetConfigurator.tsx` | Interface de configuration |
| `lib/rules/rulesContent.ts`, `app/rules/page.tsx` | Page de règles lisible |
| `docs/CUSTOM_GAMES.md`, `engine/rulesets/README.md` | Documentation du flux de confiance |

**Flux de confiance.** Le navigateur n'envoie jamais un snapshot arbitraire : il envoie un
`CustomRulesetInput` (`{ presetId, overrides }`), refusé si une section ou une propriété est inconnue.
Le serveur reconstruit, normalise, valide, clone et gèle. Client et serveur utilisent la même entrée.

**Persistance.** Solo : clé locale versionnée `coinche:solo-rules:v1`, lue après hydratation, jamais
appliquée à une partie en cours. Multijoueur : `ruleset_id`, `ruleset_version` et `ruleset_snapshot`
sur `rooms`, modifiables uniquement par l'hôte avant le démarrage, verrouillés ensuite.

---

### 3.3 IA et bots

**Objectif.** Fournir des adversaires crédibles en solo et pour remplacer un siège vide ou déconnecté
en multijoueur.

**Architecture.** Deux moteurs indépendants et composables :

- **Moteur d'enchères** : heuristique par profil (`biddingStrategy.ts`), doctrines humaines
  successives (`humanDoctrine.ts`, `humanDoctrineV2.ts`, `humanDoctrineV3.ts`, `humanDoctrineV31.ts`),
  ou Monte Carlo (`monteCarloBiddingStrategy.ts`).
- **Moteur de cartes** : heuristique (`cardStrategy.ts`) ou Monte Carlo V1 / V2 / V3
  (`monteCarloCardStrategy.ts`, `monteCarloV3CardStrategy.ts`).

`simulation/botRegistry.ts` compose ces deux moteurs en stratégies nommées (`createHybridStrategy`,
`composeStrategy`) et distingue les stratégies `active` des `experimental`.

**Bot de production.** `bots/profiles.ts` expose
`OFFICIAL_BOT_PROFILE_ID = "advanced_rules_v4"` : enchères et cartes par les moteurs Advanced Rules
V4. `bots/simpleBot.ts` est l'**unique point d'entrée** du produit (`chooseBotBid`,
`chooseBotBidWithTrace`, `chooseBotCard`), utilisé à la fois par le solo
(`app/solo/SoloPageClient.tsx`) et par le serveur multijoueur (`lib/server/multiplayerGame.ts`).
La stratégie V3.1 reste enregistrée pour un rollback par changement de cette seule constante.

**Connaissance de table.** `bots/strategy/trickKnowledge.ts` reconstruit, à partir du seul état public,
les couleurs dont chaque joueur est coupé (déduites des défausses), les atouts joués et restants, la
carte maîtresse par couleur, le risque de coupe par couleur, les couleurs mortes et affaiblies.
`bots/strategy/botKnowledgeV3.ts` prolonge cette couche.

**Doctrine d'enchères V3.** `reports/auction-doctrine-v3.md` documente une doctrine explicite et
traçable : classification de la fondation d'atout, analyse conversationnelle de l'enchère (ouverture,
réponse, rebid, overcall), évaluation du fit partenaire, plafonds séparés (intrinsèque, rebid,
minimum compétitif), et choix du plus petit message utile. Chaque décision produit une trace
diagnostique nommée.

**Mesure.** `simulation/` fournit le harnais (`simulator.ts`, `tournament.ts`, `stats.ts`,
`ffbRecalibration.ts`, oracles hors ligne) ; `scripts/benchmark*.ts` et `scripts/diagnose*.ts`
exposent une vingtaine de commandes npm ; `reports/` conserve les résultats. Le screening FFB de
référence porte sur 9 464 parties appariées (104 parties par matchup, camps inversés, quatre seeds),
avec un contrôle de harnais à 50,0 % entre deux alias identiques.

**Revue de bot.** `bots/botReview.ts` et `components/BotReviewPanel.tsx` exposent, derrière le flag
`NEXT_PUBLIC_BOT_REVIEW_MODE`, l'historique des décisions du bot avec sa trace. La capture ne contient
que la main du bot et l'historique public des enchères.

**Limites connues.**

- Les rapports sous `reports/` décrivent les décisions et mesures historiques de leurs versions ; ils
  ne constituent pas la configuration produit courante.
- Les contrats exceptionnels restent rares en parties aléatoires. Les scénarios déterministes couvrent
  Capot, Générale, Coinche et Surcoinche, tandis que le suivi statistique reste utile après promotion.
- `bots/heuristicBot 2.ts` (nom de fichier contenant un espace) est **load-bearing** : il est importé
  par `bots/simpleBot.ts`, `bots/strategy/humanDoctrine.ts`, `simulation/botRegistry.ts` et
  `scripts/diagnoseHumanDoctrineBidding.ts`. Il ne doit pas être supprimé sans renommage préalable.
  `bots/simpleBot 2.ts`, en revanche, n'est importé nulle part.

---

### 3.4 Mode Solo

**Objectif.** Une partie complète, un humain (siège 0) contre trois bots.

**Périmètre.** Partie multi-manches jusqu'à la cible, enchères, jeu de la carte, historique de manches,
règles personnalisables via le configurateur, sauvegarde de la partie terminée pour un utilisateur
authentifié, panneau d'analyse des mains de bots et revue de décision sous flag.

**Points d'entrée.** `app/solo/page.tsx`, `app/solo/SoloPageClient.tsx`,
`app/solo/soloGameInitialization.ts`, `app/solo/soloAnalysis.ts`, `lib/games.ts`
(`buildSavedGamePayload`, `saveCompletedGame`), `components/GameTable.tsx`,
`components/HumanHand.tsx`, `components/BiddingPanel.tsx`, `components/ScoreBoard.tsx`,
`components/RoundCompletionCard.tsx`, `components/BotHandAnalysis.tsx`.

**Limites connues.** Le solo s'exécute intégralement dans le navigateur : l'état complet, mains des
bots comprises, est présent côté client. C'est acceptable en solo (le joueur ne peut tricher qu'à son
propre détriment) mais doit être rappelé pour tout module qui réutiliserait ce chemin.

---

### 3.5 Multijoueur

**Objectif.** Parties en ligne à quatre sièges, salons par code, robustes aux déconnexions.

**Modèle d'autorité.** Le serveur détient le `GameState` dans `room_game_states` (table sans policy
`anon` ni `authenticated`). Le navigateur envoie des **intentions** validées
(`lib/server/roomIntentValidation.ts`), reçoit uniquement sa `PlayerGameView`, et Supabase Realtime ne
sert qu'à déclencher une relecture authentifiée auprès de l'API Next.

**Périmètre fonctionnel.** Création et rejointure de salon par code, gestion des sièges (humain, bot,
vide) avec déplacement atomique, état « prêt », présence et connexion, timer de tour serveur avec
validation du tour expiré, reprise temporaire d'un siège par un bot, transfert et reprise d'hôte,
forfaits, revanche, configuration des règles par l'hôte avant démarrage, réglage du rythme de table,
jeu optimiste côté client, archivage en fin de partie.

**Points d'entrée.**

| Couche | Fichiers |
|---|---|
| Routes API | `app/api/multiplayer/rooms/route.ts`, `.../[roomId]/route.ts`, `.../[roomId]/tick/route.ts`, `.../[roomId]/presence/route.ts` |
| Service serveur | `lib/server/multiplayerService.ts`, `lib/server/multiplayerGame.ts`, `lib/server/gameStateValidation.ts`, `lib/server/roomIntentValidation.ts`, `lib/server/apiError.ts`, `lib/server/supabaseAdmin.ts` |
| Client | `lib/multiplayerApi.ts`, `lib/roomRealtime.ts`, `lib/multiplayerPresence.ts`, `lib/multiplayerTurnTimer.ts`, `lib/multiplayerOptimisticPlay.ts`, `lib/multiplayerHost.ts`, `lib/multiplayerTablePreferences.ts`, `lib/roomTypes.ts` |
| UI | `app/multiplayer/page.tsx`, `app/multiplayer/MultiplayerPageClient.tsx`, `app/multiplayer/[roomId]/page.tsx`, `app/multiplayer/[roomId]/RoomPageClient.tsx` |
| SQL | fonctions `commit_room_state`, `commit_timed_out_turn`, `move_room_seat`, `update_room_rules`, `update_room_presentation`, `transfer_room_host`, `claim_room_host`, `enable_bot_takeover`, `rematch_room`, `persist_multiplayer_archive` |

**Limites connues.** La cohérence est assurée par des fonctions SQL `security definer` plutôt que par
la couche applicative ; toute évolution du `GameState` doit vérifier `commit_room_state` et
`gameStateValidation.ts`. `app/multiplayer/[roomId]/RoomPageClient.tsx` est le plus gros fichier du
dépôt (~40 Ko) et constitue un point de complexité à surveiller.

---

### 3.6 Authentification et profils

**Objectif.** Une identité unique par compte, utilisée comme pseudo en multijoueur.

**Périmètre.** Supabase Auth, connexion par email et par Google, callback `/auth/callback` préservant
le paramètre `?next=`, table `profiles` avec `username` unique et validé, RLS limitant lecture et
écriture au propriétaire, création du profil à l'inscription depuis les métadonnées Auth, complétion
possible une fois pour les comptes anciens.

Le pseudo du profil est **la seule identité utilisée par le serveur** à la création ou à la prise d'un
siège ; les noms déjà enregistrés dans une partie restent des snapshots immuables.

**Points d'entrée.** `app/login/page.tsx`, `app/auth/callback/`, `app/profile/page.tsx`,
`lib/profiles.ts`, `lib/authCallback.ts`, `lib/authRedirect.ts`, `components/AuthStatus.tsx`,
`supabase/migrations/20260916000000_account_profile_identity.sql`.

---

### 3.7 Historique et statistiques

**Historique.** Parties solo dans `games`, parties multijoueur dans `multiplayer_games` et
`multiplayer_game_players`, lues via la fonction `get_my_multiplayer_history`. Les deux historiques
conservent `ruleset_id`, `ruleset_version`, `ruleset_snapshot`, `round_history` et les noms figés, ce
qui permet notamment de distinguer une Générale d'un Capot et d'en afficher l'annonceur.

**Statistiques.** `lib/stats.ts` calcule les agrégats simples. `lib/detailedPlayerStats.ts` produit un
tableau de bord avancé : répartition et réussite par couleur, par valeur de contrat, par zone
d'agressivité (Prudent / Intermédiaire / Agressif), bandes de chute, modes spéciaux SA/TA, forme
récente, progression entre les premières donnes et les plus récentes. Solo et multijoueur sont
normalisés vers un type commun `PlayerStatsGame` avant calcul.

**Points d'entrée.** `app/history/page.tsx`, `app/profile/page.tsx`,
`components/profile/DetailedStatsDashboard.tsx`, `lib/multiplayerHistory.ts`, `lib/games.ts`.

---

### 3.8 Préférences joueur

**Objectif.** Séparer strictement le **confort** (local, individuel) des **règles** (partagées, figées).

**Périmètre.** Vitesse de jeu (presets `slow` / `normal` / `fast` / `instant` ou délais personnalisés),
tri de la main, taille et style des cartes, thème de tapis, thème clair/sombre, audio et musique de
fond avec contrôle de volume dans la barre de navigation.

**Garantie d'isolation.** Les `PlayerPreferences` ne sont jamais ajoutées à une room, un `GameState`,
une `PlayerGameView` ou une action réseau. Stockage local versionné
(`coinche:player-preferences:v1`).

**Points d'entrée.** `lib/preferences/` (`playerPreferences.ts`, `audio.ts`, `music.ts`,
`handSorting.ts`, `presentation.ts`), `components/settings/`, `docs/PLAYER_PREFERENCES.md`.

---

### 3.9 Interface et navigation

Routes existantes : `/` (accueil), `/solo`, `/multiplayer`, `/multiplayer/[roomId]`, `/login`,
`/auth/callback`, `/profile`, `/history`, `/rules`.

Composants transverses : `components/ui/AppShell.tsx`, `TopBarChrome.tsx`, `ThemeToggle.tsx`,
`AccessibleDialog.tsx`, `KffrLogo.tsx`, `components/AppDrawerNav.tsx`, `components/GameTopBar.tsx`,
`components/MobileLandscapeNotice.tsx`. Identité visuelle KFFR dans `public/brand/`.

---

## 4. Architecture et points d'extension

### 4.1 Découpage en couches

```
engine/            moteur pur — aucune dépendance React, réseau ou Supabase
  rulesets/        règles comme données, versionnées et gelées
bots/              stratégies, consommant engine/ uniquement
simulation/        harnais de mesure hors ligne
lib/               accès données, services serveur, préférences, statistiques
  server/          code serveur exclusif (import 'server-only')
app/               routes Next.js (App Router) et route handlers
components/        UI React
supabase/migrations/  schéma versionné
```

**Règle d'isolation à préserver.** `engine/` ne doit jamais importer de `app/`, `components/`, `lib/`
ou `@supabase/*`. C'est cette pureté qui rend le moteur utilisable côté serveur, côté client, dans les
tests et dans le simulateur sans adaptation.

### 4.2 Contrats de module

Un module additionnel se branche sur le socle par l'un de ces contrats :

| Contrat | Fourni par | Ce qu'il permet |
|---|---|---|
| `GameState` sérialisable | `engine/types.ts` | Décrire, stocker et rejouer une position complète en JSON |
| `toPlayerGameView` | `engine/views.ts` | Produire une vue filtrée par siège — le point d'accroche naturel de tout masquage d'information |
| `GameRulesetSnapshot` | `engine/rulesets/` | Rattacher un calcul à un règlement précis et figé |
| `getLegalCards` / `playCard` | `engine/rules.ts`, `engine/game.ts` | Valider un coup joué par un humain ou une machine |
| `buildTrickKnowledge` | `bots/strategy/trickKnowledge.ts` | Obtenir l'état déductible de la table (coupes, maîtres, atouts restants) à partir de l'information publique |
| `getContractProgress` | `engine/contractProgress.ts` | Connaître l'avancement du contrat depuis l'état public |
| `chooseStrategyCardWithTrace` | `simulation/botRegistry.ts` | Obtenir une décision **et** sa trace explicative |
| Intentions validées | `lib/server/roomIntentValidation.ts` | Ajouter une action multijoueur sans contourner l'autorité serveur |
| Migration SQL | `supabase/migrations/` | Ajouter une table ou une fonction de façon reproductible |

### 4.3 Points d'extension identifiés

Ces coutures existent déjà et sont directement réutilisables :

- **`trickKnowledge.ts` est aujourd'hui réservé aux bots.** Il calcule pourtant exactement ce qu'un
  joueur humain doit déduire d'une table. L'exposer côté interface est une extension à coût faible.
- **`toPlayerGameView` est le seul endroit où l'information est filtrée.** Toute variation de visibilité
  (aide au joueur, masquage progressif, position d'exercice) s'y greffe sans toucher au moteur.
- **`chooseStrategyCardWithTrace` et `HumanDoctrineV3Trace` produisent déjà un raisonnement nommé**, pas
  seulement une décision. C'est la matière première de toute fonctionnalité explicative.
- **`engine/random.ts` fournit un générateur seedé**, donc des positions reproductibles à partir d'une
  seule graine.
- **`simulation/` sait générer des parties en masse hors ligne**, ce qui permet de produire du contenu
  ou des jeux de données sans coût d'infrastructure.

---

## 5. Modèle de données

Tables et fonctions issues de `supabase/migrations/` :

| Table | Rôle | Points notables |
|---|---|---|
| `profiles` | Identité de compte | `username` unique et validé, RLS propriétaire uniquement |
| `rooms` | Salons multijoueur | `code`, `status`, `host_user_id`, `state_version`, timer de tour, `ruleset_id` / `ruleset_version` / `ruleset_snapshot`, `active_game_id`, réglages de présentation |
| `room_players` | Sièges | `seat_index` 0–3, `kind` humain/bot/vide, présence, `is_ready`, reprise par bot, unicité d'un siège actif par utilisateur |
| `room_game_states` | État autoritatif | `state jsonb`, **aucune policy `anon` ni `authenticated`** |
| `multiplayer_games` | Archive multijoueur | Scores, vainqueur, `end_reason` score/forfait, nombre de manches, snapshot de règles, `round_history` |
| `multiplayer_game_players` | Participants archivés | Conserve l'historique même après suppression d'un compte |
| `games` | Archive solo | Score joueur/bots, règles, `round_history`, noms figés |

Fonctions SQL principales : `commit_room_state`, `commit_timed_out_turn`, `move_room_seat`,
`update_room_rules`, `update_room_presentation`, `transfer_room_host`, `claim_room_host`,
`enable_bot_takeover`, `rematch_room`, `persist_multiplayer_archive`, `get_my_multiplayer_history`,
`is_room_member`, `is_multiplayer_game_participant`, `is_username_taken`,
`create_profile_for_auth_user`.

> **Dette identifiée — la table `games` n'a pas de migration de création.** Les migrations ne
> contiennent que des `alter table public.games`
> (`20260913010000_custom_game_rules.sql`, `20260913030000_generale_history.sql`). La table a donc été
> créée hors migration, probablement à la main dans l'interface Supabase, avant l'adoption du
> workflow décrit dans `CONTRIBUTING.md`. **Conséquence : un environnement Supabase vierge ne peut pas
> être reconstruit à partir du dépôt.** Voir §8.

---

## 6. Contraintes et non-objectifs

### 6.1 Contraintes d'offre

- **Vercel Hobby** : previews par branche incluses, usage non commercial. Pas de tâche planifiée ni de
  worker long. Toute fonctionnalité nécessitant du calcul lourd doit s'exécuter dans le navigateur, à
  la génération, ou hors ligne via `simulation/` — pas dans une route serveur à la demande.
- **Supabase Free** : un projet unique **partagé entre les deux développeurs** et la production. Quotas
  limités, mise en pause après inactivité prolongée. Toute migration destructrice impacte l'autre
  développeur.

### 6.2 Contraintes d'architecture

- Le multijoueur reste server-authoritative. Aucune fonctionnalité ne doit envoyer un `GameState`
  complet au navigateur en contexte multijoueur.
- Tout changement de schéma passe par un fichier `supabase/migrations/AAAAMMJJHHMMSS_description.sql`,
  commité dans la même PR que la fonctionnalité.
- `SUPABASE_SECRET_KEY` reste côté serveur, jamais préfixée `NEXT_PUBLIC_`.
- `main` n'est jamais poussée directement : branche `feat/` `fix/` `chore/` + Pull Request.

### 6.3 Non-objectifs du socle

- Aucun paiement, aucune monétisation, aucune publicité.
- Aucun classement mondial, aucun système de progression ou de compte payant.
- Aucun apprentissage automatique côté bots : les stratégies sont explicites et lisibles.
- Aucune application native : le produit est une application web responsive.

---

## 7. Qualité et tests

**Vitest — tests unitaires et d'intégration.** Environ 70 fichiers dans `tests/`, couvrant le moteur
(règles, scoring, belote, annonces, générale, rulesets), les bots et leurs doctrines successives, le
serveur multijoueur (validation d'état, transfert d'hôte, forfaits, timer, sièges atomiques), les
préférences, les statistiques et plusieurs comportements d'interface.

**Playwright — tests end-to-end.** `e2e/smoke.spec.ts`, `e2e/gameScene.spec.ts`,
`e2e/multiplayer.spec.ts`, avec helpers d'authentification, de salon et de capture d'erreurs
navigateur. Projets `smoke` et `multiplayer` séparés. Documentation dans `docs/E2E_TESTING.md`.

**Intégration continue.** `.github/workflows/e2e-smoke.yml` s'exécute sur chaque pull request et sur
chaque push vers `main` : `npm ci`, installation de Chromium, `npm run build`, puis
`npm run test:e2e:smoke`.

**Audit qualité.** `docs/QA_MATRIX.md` (matrice de couverture par domaine, statuts ✅ / ⚠️ / ❌) et
`docs/QA_FINDINGS.md` (findings avec gravité, reproduction, correctif et tests ajoutés).

**Limite connue — la CI ne joue pas les tests unitaires.** Le workflow exécute le build et le smoke
e2e, mais ni `npm run typecheck`, ni `npm run lint`, ni `npm test`. Ces trois commandes ne sont
exigées qu'en local, par convention (`CONTRIBUTING.md` §5). Une régression du moteur peut donc passer
la CI. Voir §8.

---

## 8. Écarts documentation / code et dettes

| # | Constat | Fichier(s) | Gravité |
|---|---|---|---|
| 1 | `README.md` décrit une « V1 » obsolète : bot officiel `main`, profils `main`/`prudent`/`balanced`/`aggressive`, aucune mention de SA/TA, générale, annonces, rulesets, préférences, e2e | `README.md` | Moyenne |
| 2 | Résolu : `BOT_STRATEGY.md` et le code désignent `advanced_rules_v4` comme bot de production | `BOT_STRATEGY.md` et `bots/profiles.ts` | Résolu |
| 3 | Résolu : la migration rétroactive de création de `games` a été ajoutée par la PR #3 | `supabase/migrations/20260901000000_create_solo_games_table.sql` | Résolu |
| 4 | La CI exécute `typecheck`, `lint`, le build et les smoke tests depuis la PR #4 ; `npm test` reste à câbler séparément des benchmarks lourds | `.github/workflows/e2e-smoke.yml` | Moyenne |
| 5 | `bots/simpleBot 2.ts` n'est importé nulle part — fichier mort | `bots/simpleBot 2.ts` | Faible |
| 6 | `bots/heuristicBot 2.ts` est importé par quatre modules malgré un nom de fichier contenant un espace : à renommer, pas à supprimer | `bots/simpleBot.ts`, `humanDoctrine.ts`, `botRegistry.ts`, `diagnoseHumanDoctrineBidding.ts` | Moyenne |
| 7 | Les anciens rapports restent figés et doivent être lus avec l'identifiant de stratégie qu'ils mesurent | `reports/`, `bots/profiles.ts` | Faible |
| 8 | Résolu : `CONTRIBUTING.md` est sur `main` depuis la PR #1 | `CONTRIBUTING.md` | Résolu |
| 9 | Une vingtaine de scripts de benchmark coexistent sans marquage actif/obsolète | `scripts/`, `package.json` | Faible |
| 10 | `RoomPageClient.tsx` concentre ~40 Ko de logique client | `app/multiplayer/[roomId]/RoomPageClient.tsx` | Moyenne |

`RULES.md`, `docs/CUSTOM_GAMES.md`, `docs/PLAYER_PREFERENCES.md`, `engine/rulesets/README.md`,
`docs/QA_MATRIX.md` et `docs/E2E_TESTING.md` sont en revanche **à jour** et fidèles au code.

---

## 9. Questions ouvertes

1. **Le preset est-il le règlement officiel du produit, ou seulement un défaut ?** Le produit expose une
   combinatoire de règles. Faut-il définir une variante canonique, seule utilisée pour les
   classements, statistiques comparables et contenus pédagogiques à venir ?
2. **Quel suivi post-promotion pour V4 ?** Les tests déterministes couvrent les modes avancés ; les
   futurs benchmarks doivent continuer à publier l'identifiant exact et les règles utilisées.
3. **Comment câbler `npm test` à la CI sans mêler les benchmarks lourds ?** `typecheck`, `lint`, le build
   et les smoke tests sont déjà bloquants ; la suite Vitest doit rester distincte des commandes de benchmark.
4. **Quel niveau de confidentialité pour `NEXT_PUBLIC_BOT_REVIEW_MODE` en production ?** Le flag est
   côté client ; son périmètre d'exposition mérite d'être tranché avant l'ouverture au grand public.
5. **Les statistiques doivent-elles rester comparables entre rulesets ?** Un tableau de bord mélangeant
   des parties jouées sous des règles différentes produit des agrégats difficiles à interpréter.

---

## 10. Synthèse du découpage modulaire

Le socle se décompose en huit domaines stables : **moteur**, **rulesets**, **bots**, **solo**,
**multijoueur**, **identité**, **historique et statistiques**, **préférences**.

La frontière la plus solide du projet est celle entre `engine/` et le reste : elle est réelle,
respectée, et testée. C'est sur elle que doit s'appuyer tout module additionnel.

Les trois coutures les plus prometteuses pour des extensions futures sont `toPlayerGameView`
(masquage d'information), `trickKnowledge` (connaissance déductible de la table) et les traces de
décision des bots (explicabilité). Elles existent déjà et n'ont pas été conçues pour l'interface : les
exposer est un travail d'intégration, pas de conception.

Les dettes à traiter en priorité sont maintenant la mise à jour du `README.md` (#1), l'ajout de la suite
Vitest à la CI sans y mêler les benchmarks lourds (#4), le renommage sûr de `heuristicBot 2.ts` (#6)
et la réduction de la concentration de logique dans `RoomPageClient.tsx` (#10).
