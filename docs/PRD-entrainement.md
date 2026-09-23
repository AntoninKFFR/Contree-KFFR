# PRD — Module Entraînement

> **Statut : spécification du module, non implémentée.** Ce document décrit le comportement à livrer dans de futures PR. Il est fondé sur `main` après la PR #22 (`c06f781`). Aucune route, table, composant ni logique d'entraînement n'existe encore. Il complète [PRD-socle.md](PRD-socle.md) et suit la forme de [PRD-social.md](PRD-social.md).
>
> **Note de compatibilité (revérifié sur `main` à jour, ~88 commits plus tard).** Le socle moteur, `trickKnowledge`, le chemin solo et le module social sont intacts. Deux références ont été mises à jour dans ce document : la navigation (`AppDrawerNav` → `AppTopNav`, barre de navigation haute) et le bot officiel (`human_doctrine_v3_1_conversation_mc_v1` → `advanced_rules_v4`). La doctrine de référence des axes doctrinaux (`bidding`, `bid-reading`) reste une **décision ouverte, à trancher en PR J** (cf. §10).

## 1. Objectif et socle audité

Un joueur peut travailler une compétence précise de la contrée — compter, mémoriser, déduire, annoncer — sans jouer une partie complète, ou pendant une partie contre des bots. Le module vise la **progression mesurable** : chaque compétence a ses niveaux, ses séries, ses records.

Le module s'appuie presque entièrement sur des briques existantes. Le moteur sait déjà calculer toutes les réponses attendues des axes de comptage et de mémoire ; le travail est principalement d'interface, de génération de positions et de pédagogie.

| Existant | Conséquence pour le module |
|---|---|
| `GameState` est un objet JSON complet et sérialisable ([types](../engine/types.ts)) ; `engine/random.ts` fournit un générateur seedé ([random](../engine/random.ts)) | Une position d'exercice n'a pas besoin d'être stockée : elle se **reconstruit** à partir d'une graine, d'une version de générateur et d'un ruleset. |
| `CompletedTrick.points` est calculé par le moteur et inclut déjà le dernier pli et le bonus de capot ; `RoundResult` détaille points de plis, belote, annonces, total et score marqué ([types](../engine/types.ts), [rules](../engine/rules.ts)) | Les axes de comptage lisent leur réponse attendue dans l'état ; ils ne recalculent aucun barème. |
| `bots/strategy/trickKnowledge.ts` calcule cartes jouées, cartes restantes par couleur, carte maîtresse par couleur, atouts restants, couleurs coupées déduites ([trickKnowledge](../bots/strategy/trickKnowledge.ts)) | Source des axes de mémoire et de déduction. **Mais** elle vit dans `bots/` et raisonne depuis `state.currentPlayerId` : elle doit être extraite et paramétrée par le siège observateur (§4.2). |
| `toPlayerGameView` est l'unique point de filtrage de l'information par siège ([views](../engine/views.ts)) | Aucune question in-game ne doit exposer plus que ce que le siège humain sait légitimement. |
| Bot officiel `advanced_rules_v4` ([rapport](../reports/bot-advanced-rules.md), [profiles](../bots/profiles.ts), [simpleBot](../bots/simpleBot.ts)) ; l'ancien profil `human_doctrine_v3_1_conversation_mc_v1` existe toujours dans le registre mais n'est plus officiel | Référence de correction de l'axe « annonces ». **Décision ouverte (PR J)** : enseigner la doctrine officielle actuelle (`advanced_rules_v4`, déjà documentée) ou figer un autre profil. La version retenue doit être figée dans `axis_version` et affichée. À vérifier en PR J : que le bot retenu produise une trace d'enchère exploitable pour la correction. |
| Le solo tourne entièrement dans le navigateur ([SoloPageClient](../app/solo/SoloPageClient.tsx)) | Le mode in-game réutilise ce chemin : aucune infrastructure serveur nécessaire pour jouer. |
| Module social livré : `friendships`, fonctions privées + wrappers RPC ([migration sociale](../supabase/migrations/20260921000000_social_schema_security.sql), [PRD social](PRD-social.md)) | Le classement entre amis se construit sur `friendships`, avec le même patron de sécurité. |
| Accueil : liens « Jouer en solo » et « Multijoueur » ([accueil](../app/page.tsx)) ; barre de navigation haute ([nav](../components/AppTopNav.tsx)) | Point d'entrée du bouton « Entraînement ». |

Les règles de [CONTRIBUTING.md](../CONTRIBUTING.md) s'appliquent : branche + PR, migrations versionnées, clé secrète strictement serveur.

## 2. Périmètre et décisions MVP

- **Un bouton « Entraînement »** sur l'accueil, à côté de « Jouer en solo » et « Multijoueur », et une entrée dans la barre de navigation haute.
- **Deux modes** : *puzzle* (une compétence répétée en série, interface dédiée) et *in-game* (une partie contre trois bots, interrompue par des questions sur les axes choisis).
- **Priorité au mode puzzle.** Tous les axes déterministes sont livrés en puzzle avant le mode in-game (§5, §12).
- **Règlement unique en V1 : le preset `contree-kffr`.** Les exercices ignorent les règles personnalisées du solo. Une réponse de comptage dépend du règlement ; entraîner sous une combinatoire de règles produirait du contenu impossible à valider et des records non comparables.
- **Jouable sans compte.** Puzzles et parties d'entraînement fonctionnent déconnecté, avec une progression locale au navigateur. Records persistés et classement entre amis exigent un compte avec pseudo.
- **Une partie d'entraînement n'est pas une partie.** Elle n'est jamais enregistrée dans `games` et n'entre pas dans le tableau de bord statistique : ses donnes sont interrompues et ne mesurent pas le niveau de jeu réel.
- **Une erreur in-game n'a aucun effet sur la partie.** La correction s'affiche, le score d'entraînement de la session est mis à jour, la partie reprend.

### Hors MVP

Puzzles de situations tactiques (quelle carte jouer, motifs de jeu), bouton d'aide en partie (PRD dédié, il concerne aussi les parties normales), classement public et ELO de puzzles, entraînement sous règles personnalisées, migration de la progression locale vers un compte, puzzle du jour partagé, notifications. Le duo multijoueur sur les annonces est spécifié ici mais livré en dernier lot (§12, PR L), sous réserve d'une spécification réseau dédiée.

## 3. Vocabulaire

| Terme | Définition |
|---|---|
| **Axe** | Une compétence entraînable, identifiée par un `axisId` stable (ex. `trick-value`). Porte une version. |
| **Niveau** | Un jeu de paramètres de difficulté d'un axe (durée d'affichage, périmètre, profondeur de rappel…). Numéroté à partir de 1. |
| **Position** | Un `GameState` figé à un instant donné. Jamais stockée : définie par `{ seed, generatorVersion, rulesetId, rulesetVersion, stopAt }`. |
| **Exercice** | Une question posée sur une position, avec sa réponse attendue et sa règle de correction. |
| **Série** | Une suite d'exercices d'un même axe et d'un même niveau en mode puzzle (10 par défaut). Unité de score et de record. |
| **Session in-game** | Une partie d'entraînement contre des bots, avec ses axes actifs, ses niveaux et son budget d'interruptions. |
| **Moment de déclenchement** | L'instant où un axe peut interroger en in-game : `bidding`, `trick-start`, `trick-end`, `round-end`. |
| **Axe déterministe** | Réponse calculable exactement par le moteur. Aucune contestation possible. |
| **Axe doctrinal** | Réponse dépendante d'une convention d'enchères. Affichée comme « la doctrine de l'application », jamais comme vérité universelle. |

## 4. Architecture

### 4.1 Répartition des couches

```
engine/knowledge/     connaissance de table par siège — pur, extrait de bots/
engine/training/      contrat d'axe, axes, générateur de positions — pur
lib/training/         progression locale, client API, planificateur in-game
app/training/         routes /training, /training/puzzle/[axisId], /training/game
app/api/training/     soumission et vérification des séries
components/training/  composants de saisie, rejeu, minuteur, correction
```

`engine/training/` et `engine/knowledge/` obéissent à la règle du moteur : aucun import de `app/`, `components/`, `lib/` ni `@supabase/*`. C'est ce qui permet au serveur de **recalculer** une série soumise (§9).

### 4.2 Extraction de la connaissance de table

`trickKnowledge.ts` raisonne depuis `state.currentPlayerId` (main visible, partenaire, équipe). En entraînement, l'observateur est le siège humain (0), qui n'est généralement pas le joueur courant au moment d'une question.

- Créer `engine/knowledge/tableKnowledge.ts`, fonctions pures prenant `(state, viewerId)`.
- Réécrire `trickKnowledge.ts` comme adaptateur appelant la nouvelle couche avec `viewerId = state.currentPlayerId`.
- **Aucun changement de comportement des bots.** Un test d'équivalence vérifie, sur au moins 500 positions seedées, que l'adaptateur retourne un résultat strictement identique à l'implémentation actuelle.

Les fonctions ne s'appuyant que sur les cartes jouées (`getPlayedCards`, `getRemainingCardsBySuit`, `getMasterCardsStillOutBySuit`, `inferVoidSuitsByPlayer`) sont déjà indépendantes de l'observateur et migrent telles quelles.

### 4.3 Contrat d'axe

Chaque axe implémente un contrat unique, commun aux deux modes. Le mode puzzle et le mode in-game ne diffèrent que par la façon de fournir la position.

```ts
type AxisContext = {
  viewerId: PlayerId;          // 0 en V1
  level: number;
  rng: SeededRandom;           // pour les choix internes à la question (couleur interrogée…)
};

type Exercise<Q, A> = { question: Q; expected: A };

type Grade = { correct: boolean; score: number; feedback: AxisFeedback };

type TrainingAxis<Q, A> = {
  id: AxisId;
  version: number;
  kind: "deterministic" | "doctrinal";
  answerKind: "number" | "card-selection" | "player-suit-grid" | "bid" | "bid-reading";
  levels: readonly AxisLevelDefinition[];
  moments: readonly TriggerMoment[];                    // vide si puzzle uniquement
  isApplicable(state: GameState, ctx: AxisContext): boolean;
  buildExercise(state: GameState, ctx: AxisContext): Exercise<Q, A>;
  grade(exercise: Exercise<Q, A>, answer: A): Grade;
};
```

Exigences : `buildExercise` et `grade` sont purs et déterministes ; une même position et un même contexte produisent toujours le même exercice. Les axes sont déclarés dans un registre unique `engine/training/registry.ts`, sur le modèle de `simulation/botRegistry.ts`.

### 4.4 Générateur de positions

Une position de puzzle est une donne jouée par quatre bots à partir d'une graine, arrêtée à `stopAt = { phase, trickIndex, moment }`.

- **Stratégie de génération rapide et figée.** Le générateur n'utilise pas le bot officiel Monte Carlo, trop coûteux à exécuter à la chaîne dans le navigateur, mais une stratégie heuristique du registre, épinglée par identifiant. Le réalisme tactique importe peu pour compter ou mémoriser.
- **`generatorVersion` obligatoire.** Toute modification de la stratégie, du moteur ou de l'algorithme de génération incrémente cette version. Une série enregistrée reste reproductible exactement, même après évolution des bots.
- **Budget de performance** : générer une série de 10 positions en moins de 300 ms sur un mobile milieu de gamme. À vérifier en PR A.
- **Le composant de rejeu** fait défiler les plis déjà joués d'une position, à vitesse réglable. C'est à la fois l'exercice de l'axe `round-count` et l'**amorce** de tous les axes de mémoire en mode puzzle : le joueur regarde la donne défiler, puis la question tombe.

## 5. Catalogue des axes

Dix axes. La variante « As et 10 restants » de la vision initiale devient un niveau de l'axe `played-cards`. Cinq types de réponse, donc cinq composants de saisie — quatre en V1, le cinquième dans le dernier lot.

| Type de réponse | Composant | Axes |
|---|---|---|
| `number` | Pavé numérique | `trick-value`, `round-count`, `running-score` |
| `card-selection` | Grille des 32 cartes, ou main du joueur | `master-cards`, `master-in-hand`, `played-cards`, `trick-recall` |
| `player-suit-grid` | Grille 3 joueurs × 4 couleurs | `opponent-voids` |
| `bid` | Panneau d'enchère existant, en mode exercice | `bidding` |
| `bid-reading` | Formulaire de caractéristiques de main | `bid-reading` |

### Gabarit de fiche

Chaque axe est documenté dans `engine/training/axes/<axisId>.ts` avec : compétence, modes, moments in-game, type de réponse, source de la réponse attendue, niveaux, dépendance au ruleset, nature (déterministe ou doctrinale).

### 5.1 `trick-value` — Compter un pli · déterministe

- **Compétence** : donner la valeur d'un pli.
- **Modes** : puzzle ; in-game à `trick-end`.
- **Réponse attendue** : `CompletedTrick.points`.
- **Niveaux** : 1 — pli affiché sans limite ; 2 — affiché 5 s ; 3 — affiché 2 s ; 4 — non réaffiché (in-game uniquement, question posée après ramassage).
- **Ruleset** : dépend du mode de contrat (barème atout / non-atout), du dernier pli et du capot. Le dernier pli d'une donne est volontairement inclus dans les séries : c'est là que le +10 est oublié.

### 5.2 `round-count` — Compter une manche · déterministe

- **Compétence** : totaliser les points d'une donne en regardant les plis défiler.
- **Modes** : puzzle (rejeu d'une donne générée) ; in-game à `round-end`.
- **Réponse attendue** : champs de `RoundResult`.
- **Niveaux** : la progression porte d'abord sur ce qui est compté, puis sur la vitesse.
  1 — points de plis d'une équipe (`trickPointsByTeam`) ; 2 — points de plis + belote ; 3 — score marqué au tableau (`roundScore`, après réussite ou chute, multiplicateurs et arrondi). Chaque niveau se joue à plusieurs vitesses de défilement.
- **Record** : vitesse maximale réussie par niveau.
- **Note pédagogique** : la somme des points de plis vaut 162 hors capot. Afficher ce repère en correction, pas dans la question.

### 5.3 `running-score` — Points faits en cours de donne · déterministe

- **Compétence** : savoir où en est chaque équipe sans regarder le tableau.
- **Modes** : in-game à `trick-start` ; puzzle via rejeu.
- **Réponse attendue** : `state.trickPoints` de l'équipe interrogée.
- **Niveaux** : 1 — son équipe ; 2 — les deux équipes ; 3 — points restant à faire pour le contrat (`getContractProgress`).

### 5.4 `master-cards` — Cartes maîtresses en jeu · déterministe

- **Compétence** : connaître la carte la plus forte non encore jouée dans chaque couleur.
- **Modes** : in-game à `trick-start` ; puzzle via rejeu.
- **Réponse attendue** : `getMasterCardsStillOutBySuit` (cartes jouées uniquement ; la maîtresse peut être dans la main du joueur).
- **Niveaux** : 1 — une couleur, hors atout ; 2 — l'atout ; 3 — les quatre couleurs.

### 5.5 `master-in-hand` — Maîtresses dans sa main · déterministe

- **Compétence** : repérer ses propres cartes maîtresses.
- **Modes** : in-game à `trick-start` ; puzzle via rejeu.
- **Réponse attendue** : intersection de la main du siège 0 et de `getMasterCardsStillOutBySuit`, étendue aux cartes devenues maîtresses en cascade (ex. le 10 quand l'As est tombé et que le joueur détient le 10).
- **Niveaux** : 1 — une couleur ; 2 — toute la main.

### 5.6 `played-cards` — Cartes tombées et restantes · déterministe

- **Compétence** : mémoire des cartes jouées.
- **Modes** : in-game à `trick-start` ; puzzle via rejeu.
- **Réponse attendue** : `getRemainingCardsBySuit`, ou son complément selon la question.
- **Niveaux** : 1 — As restants ; 2 — As et 10 restants ; 3 — une couleur complète ; 4 — l'atout ; 5 — les quatre couleurs.

### 5.7 `trick-recall` — Reconstituer un pli · déterministe

- **Compétence** : mémoire séquentielle.
- **Modes** : in-game à `trick-end` ; puzzle via rejeu.
- **Réponse attendue** : `completedTricks[i].cards`.
- **Niveaux** : 1 — dernier pli, cartes seules ; 2 — dernier pli, cartes et joueurs ; 3 — avant-dernier pli, cartes seules ; 4 — pli tiré au hasard, cartes et joueurs.
- **Correction** : partielle, une fraction de point par carte (et par attribution au niveau 2+).

### 5.8 `opponent-voids` — Jeu des autres joueurs · déterministe sur le déductible

- **Compétence** : déduire les couleurs dont un joueur est démuni.
- **Modes** : in-game à `trick-start` ; puzzle via rejeu.
- **Réponse attendue** : `inferVoidSuitsByPlayer` depuis le siège 0.
- **Niveaux** : 1 — un joueur, une couleur ; 2 — tous les joueurs, toutes les couleurs ; 3 — couleurs coupées et nombre d'atouts restants hors de sa main.
- **Contrainte forte** : la vision initiale proposait « est-il maître ? ». Cette question n'est **pas** déductible en général depuis l'information publique : la réponse serait un pari. L'axe n'interroge que sur ce qui est prouvable (couleur coupée certaine, carte encore possible, carte impossible car tombée ou en main). Un état non déductible n'est jamais noté.

### 5.9 `bidding` — Faire son annonce · doctrinal

- **Compétence** : annoncer selon la doctrine de l'application.
- **Modes** : puzzle.
- **Réponse attendue** : décision de la doctrine épinglée (bot officiel `advanced_rules_v4` à la rédaction ; profil de référence à confirmer en PR J, cf. §10) pour le siège 0, avec sa trace.
- **Niveaux** : 1 — le joueur parle en premier ; 2 — une enchère adverse avant lui ; 3 — enchère du partenaire à soutenir ou non ; 4 — séquence compétitive complète.
- **Prérequis** : une page de conventions lisible dans l'application, décrivant la doctrine. Sans elle, l'axe n'est pas livrable au grand public.
- **Correction** : la trace de la doctrine est reformulée en explication courte. L'écran indique toujours « selon la doctrine de l'application ».

### 5.10 `bid-reading` — Lire les enchères · doctrinal

- **Compétence** : déduire ce que promettent les enchères du partenaire et des adversaires.
- **Modes** : puzzle ; in-game à la fin des enchères ; duo multijoueur en dernier lot.
- **Réponse attendue** : ce que **promet** l'enchère selon la doctrine (ex. nombre minimal d'atouts, présence du Valet), pas la main réelle. La main réelle est révélée après la réponse, en illustration.
- **Risque principal** : la doctrine actuelle décide *quoi annoncer* ; elle ne sait pas dire *ce qu'une enchère promet*. Cet axe exige un module d'interprétation inverse, qui n'existe pas. C'est le chantier le plus lourd du module.

## 6. Parcours UX — mode puzzle

### `/training`

Hub du module. Liste des axes livrés, groupés en trois familles (Compter, Mémoriser, Annoncer). Pour chaque axe : niveau atteint, record personnel, accès direct au niveau suivant débloqué. Accès au mode in-game.

### `/training/puzzle/[axisId]`

1. Choix du niveau parmi les niveaux débloqués.
2. Série de 10 exercices. Pour les axes de mémoire : rejeu de la donne, puis question.
3. Chaque réponse est corrigée immédiatement : bonne réponse, écart, explication d'une ligne.
4. Écran de fin de série : score, temps, record battu ou non, niveau suivant débloqué ou non.

**Déblocage** : réussir une série à 80 % ou plus débloque le niveau suivant.

**Accessibilité** : tout minuteur et toute limite de durée d'affichage doivent être désactivables dans les réglages de l'entraînement. Une série jouée sans limite de temps reste valide, mais ne concourt pas aux records de vitesse.

**Mobile** : tous les composants de saisie sont utilisables au pouce, en portrait. La grille des 32 cartes est le composant le plus exigeant ; elle doit être validée sur petit écran dès sa PR.

## 7. Parcours UX — mode in-game

### `/training/game` — écran de paramétrage

Sélection des axes actifs parmi ceux qui déclarent au moins un moment de déclenchement, niveau par axe, budget d'interruptions. Paramétrage mémorisé localement.

### Pendant la partie

- Partie solo contre trois bots officiels, sous preset `contree-kffr`.
- Aux moments de déclenchement, la boucle de jeu se met en pause et une question s'affiche en surimpression, sans masquer la table sauf si le niveau l'exige.
- **Budget d'interruptions** : au plus une question par pli par défaut, réglable ; au plus trois par manche hors `round-end`. Lorsque plusieurs axes sont éligibles au même moment, le planificateur alterne entre eux pour équilibrer la pratique.
- **Aucune fuite d'information.** Une question et sa correction ne révèlent jamais plus que ce que le siège 0 sait légitimement. La correction de `opponent-voids` n'affiche que l'état déductible, jamais la main réelle d'un bot.
- Fin de partie : récapitulatif par axe (questions posées, taux de réussite), sans enregistrement dans `games`.

## 8. Progression, records et classements

- **Score de série** : nombre de bonnes réponses sur 10, correction partielle comprise ; départage au temps total.
- **Records personnels** par couple `(axisId, level)` : meilleur score, meilleur temps à score maximal, et pour `round-count` meilleure vitesse réussie.
- **Progression visible** sur le hub : niveau atteint et évolution du taux de réussite sur les dernières séries.
- **Classement entre amis** par couple `(axisId, level)`, construit sur `friendships`. Aucun classement global en MVP : en diffusion restreinte, un classement public est un écran vide.
- **Sans compte** : progression, déblocages et records stockés localement sous `coinche:training-progress:v1`, selon le même patron que les préférences joueur.

## 9. Modèle de données

Nouvelles tables en `public`, RLS activée, créées dans une **nouvelle migration** de la PR H. Aucune écriture directe depuis le client.

| Table | Colonnes et contraintes | Index / accès |
|---|---|---|
| `training_series` | `id uuid PK`, `user_id uuid NOT NULL`, `mode text CHECK IN ('puzzle','in-game')`, `axis_id text`, `axis_version int`, `level int CHECK > 0`, `ruleset_id text`, `ruleset_version int`, `generator_version int`, `seed bigint`, `answers jsonb`, `question_count int`, `score numeric`, `duration_ms int`, `timed boolean`, `created_at timestamptz DEFAULT now()` | Index `(user_id, axis_id, level, created_at DESC)`. FK utilisateur `ON DELETE CASCADE`. SELECT propriétaire uniquement. Aucune policy INSERT/UPDATE/DELETE. |
| `training_records` | `user_id uuid`, `axis_id text`, `level int`, `best_score numeric`, `best_duration_ms int`, `best_speed int NULL`, `series_id uuid`, `updated_at` ; `PRIMARY KEY (user_id, axis_id, level)` | SELECT propriétaire uniquement. Mis à jour exclusivement par la route serveur. Lu par le classement via fonction privée. |

**Vérification serveur des séries.** Une série est soumise à `POST /api/training/series` sous forme `{ axisId, axisVersion, level, rulesetId, rulesetVersion, generatorVersion, seed, answers, durationMs, timed }`. La route vérifie le JWT, **régénère les positions depuis la graine, recalcule chaque réponse attendue avec `engine/training/`**, calcule elle-même le score, puis écrit la série et met à jour le record. Le score envoyé par le client n'est jamais lu. Le coût est de quelques millisecondes de calcul pur, compatible avec Vercel Hobby.

Limite connue : le temps déclaré reste falsifiable. La route rejette les durées inférieures à un plancher par axe et niveau ; au-delà, le temps n'est fiable qu'entre amis. C'est une raison supplémentaire de ne pas ouvrir de classement public en MVP.

**Quotas Supabase Free.** Une ligne par série, jamais par réponse. Conservation des 50 dernières séries par couple `(user_id, axis_id)` ; les records sont conservés séparément et ne dépendent pas de cet historique.

**Classement entre amis.** Fonction privée `SECURITY DEFINER`, `search_path = ''`, exposée par un wrapper `public`, sur le patron du module social : `get_friends_training_leaderboard(p_axis_id text, p_level int)`. Retourne uniquement le pseudo et le record des amis de `auth.uid()` et de l'utilisateur lui-même, 50 lignes maximum.

## 10. Cas limites et décisions attendues

Chaque point porte une décision par défaut, appliquée tant que l'équipe ne l'a pas remplacée.

| Question | Décision par défaut |
|---|---|
| Les cartes qui défilent en fin de manche : donne réelle ou suite aléatoire ? | Donne réelle, rejouée pli par pli. Une suite aléatoire entraîne l'addition, pas la lecture d'une donne. |
| `round-count` : quelle équipe compter ? | Une équipe désignée par la question, tirée au hasard ; le niveau 3 interroge le score marqué des deux. |
| Conséquence d'une erreur in-game | Aucune sur la partie ; comptée dans le score de session. |
| Les parties d'entraînement comptent-elles dans les statistiques ? | Non. Ni `games`, ni tableau de bord. |
| Score : vitesse ou précision ? | Précision d'abord, temps en départage. La vitesse n'est un critère principal que pour `round-count`. |
| Classements multiples | Un classement entre amis par axe et par niveau. Pas de classement global. |
| Quelle version de doctrine sert de référence à `bidding` ? | La doctrine du bot officiel (actuellement `advanced_rules_v4`), épinglée par identifiant dans `axis_version`. **Décision à trancher en PR J** : garder l'officiel courant ou figer un autre profil. Un changement de doctrine incrémente la version de l'axe et ouvre de nouveaux records. |
| Faut-il un rapport de décision pour la doctrine avant de s'en servir comme correcteur ? | Le bot officiel actuel `advanced_rules_v4` dispose déjà d'un rapport (`reports/bot-advanced-rules.md`). Prérequis de la PR J : confirmer le profil de référence et vérifier qu'il produit une trace d'enchère exploitable. |
| La progression locale est-elle transférée au compte à la connexion ? | Non en MVP. |
| Que devient une série jouée sous une ancienne `generator_version` ? | Elle reste valide et vérifiable ; le serveur conserve les versions de générateur publiées. |
| Un axe interroge sur une position où il n'y a rien à demander (ex. aucune couleur coupée) | `isApplicable` renvoie `false` et le générateur tire une autre position. |

## 11. Stratégie de tests

1. **Connaissance de table.** Test d'équivalence entre l'ancien `trickKnowledge` et l'adaptateur, sur au moins 500 positions seedées. Aucune modification des résultats de benchmark des bots.
2. **Générateur.** Même graine, même version, même position, octet pour octet. Budget de performance mesuré.
3. **Axes.** Chaque axe a ses tests unitaires sur positions construites à la main (cas limites : dernier pli, capot, belote, atout épuisé, maîtresse en main) et sur positions seedées. Invariant vérifié sur 1 000 donnes : la somme des `CompletedTrick.points` d'une donne vaut 162, ou la valeur du capot.
4. **Correction.** Réponses exactes, partielles, vides et malformées ; aucune exception sur entrée invalide.
5. **Route de soumission.** JWT absent ou expiré, score forgé ignoré, graine rejouée, version inconnue, durée sous le plancher, écriture directe refusée par RLS.
6. **Classement.** Un non-ami n'apparaît jamais ; aucune donnée autre que pseudo et record.
7. **Mode in-game.** Le planificateur respecte le budget ; aucune question ne révèle une carte cachée ; aucune partie d'entraînement n'apparaît dans l'historique.
8. **E2E smoke.** `/training` charge ; une série `trick-value` se joue jusqu'à l'écran de fin, sans compte.

## 12. Découpage des futures PR

| PR | Livrable reviewable | Garde de validation |
|---|---|---|
| **A — fondations moteur** | `engine/knowledge/` paramétré par siège et adaptateur `trickKnowledge` ; `engine/training/` : contrat d'axe, registre, générateur seedé versionné. Aucune UI. | Test d'équivalence vert, déterminisme du générateur, budget de performance mesuré. |
| **B — hub et premier axe** | Bouton accueil et barre de navigation haute (`AppTopNav`), `/training`, `/training/puzzle/[axisId]`, composant `number`, axe `trick-value`, progression locale. | Série complète jouable sans compte ; E2E smoke. |
| **C — axes de comptage** | Composant de rejeu à vitesse réglable, axes `round-count` et `running-score`. | Invariant 162 ; rejeu utilisable sur mobile. |
| **D — axes de mémoire** | Composant `card-selection` (grille et main), axes `master-cards`, `master-in-hand`, `played-cards`, `trick-recall`. | Grille validée sur petit écran ; correction partielle testée. |
| **E — déduction** | Composant `player-suit-grid`, axe `opponent-voids`. | Aucun état non déductible noté. |
| **F — extraction de la boucle solo** | Refactor : la boucle de jeu solo devient un hook réutilisable. **Aucun changement de comportement.** | Tests solo existants inchangés et verts. |
| **G — mode in-game** | `/training/game`, paramétrage, planificateur et budget, surimpression de question, récapitulatif. | Aucune fuite d'information ; rien dans `games`. |
| **H — persistance et records** | Migration `training_series` et `training_records`, route de soumission avec recalcul serveur, records affichés sur le hub. | Score forgé ignoré ; RLS vérifiée ; migrations reproductibles. |
| **I — classement entre amis** | Fonction privée et wrapper, affichage par axe et niveau. | Isolation stricte aux amis. |
| **J — annonces** | Rapport de décision de la doctrine de référence, page de conventions, axe `bidding` sur le composant d'enchère existant. | Correction affichée comme doctrine ; trace reformulée. |
| **K — lecture des enchères** | Module d'interprétation des enchères, composant `bid-reading`, axe en solo. | Promesses de la doctrine testées sur séquences de référence. |
| **L — duo multijoueur** | Spécification réseau dédiée à rédiger avant tout code. | — |

Dépendances : A précède tout ; F précède G ; H précède I. B à E sont indépendantes entre elles une fois A mergée et peuvent être menées en parallèle. Chaque PR part d'un `main` à jour, porte ses propres tests et reste soumise à revue humaine et preview avant merge.
