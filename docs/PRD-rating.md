# PRD — Elo et classement KFFR

> **Statut : spécification V1, documentation uniquement.** Aucun schéma, calcul, endpoint ou écran Elo n'est livré par cette PR. Le détail normatif de la formule est dans [rating-formula-v1.md](rating-formula-v1.md). Base auditée : `main` au 21 septembre 2026.

## 1. Sources auditées et adaptations à l'existant

`docs/PRD.md` n'existe pas dans le dépôt : son équivalent actuel est [PRD-socle.md](PRD-socle.md). Ont aussi été lus [PRD-social.md](PRD-social.md), [social-schema-security.md](social-schema-security.md), les migrations `supabase/migrations/`, `engine/rulesets/`, `bots/profiles.ts`, `lib/server/multiplayerService.ts`, `lib/server/multiplayerGame.ts`, `lib/multiplayerHistory.ts`, `lib/roomTypes.ts` et `lib/profiles.ts`.

| Constat vérifié | Conséquence Elo |
|---|---|
| `CONTREE_KFFR_RULESET` a `id = "contree-kffr"`, `version = 1` dans `engine/rulesets/presets.ts`. `buildCustomRuleset` distingue les surcharges avec `id = "custom"`. `rooms` et `multiplayer_games` conservent `ruleset_id`, `ruleset_version`, `ruleset_snapshot`. | Identifier précisément le preset classique par son snapshot complet, pas seulement par une étiquette ou le mode de score `ffb`. |
| `RoomStatus` est `lobby / playing / finished / cancelled`; `GameState.phase` se termine à `game-over` (`lib/roomTypes.ts`). L'hôte démarre via `start-game`; `commit_room_state` valide `state_version`. | Figer le snapshot Elo avec le passage effectif `lobby → playing`. À la fin, archiver la partie et créer le travail Elo `pending` ensemble ; appliquer l'Elo ensuite. |
| `rooms.active_game_id` est généré au départ et renouvelé à chaque revanche ; `multiplayer_games.id` reprend cet identifiant. `persist_multiplayer_archive` est appelé dans les fonctions SQL de commit, timeout et takeover. | La clé d'idempotence est **l'ID de partie** (`active_game_id` / `multiplayer_games.id`), jamais le seul `room_id`. Couvrir tous les chemins de fin. |
| Siège `seat_index` 0 ou 2 = équipe 0, 1 ou 3 = équipe 1 (`multiplayer_game_players`). `room_players.kind` peut être `human`, `bot`, `empty`; les sièges vides deviennent bots au départ. | Quatre snapshots, deux sièges par équipe, après remplissage des places. |
| `bot_takeover` reste sur un siège `kind = human`; `enable_bot_takeover` ne change pas `user_id`. | Le propriétaire Elo humain du siège et sa cote initiale restent inchangés pendant la reprise temporaire. |
| `forfeitRoom` connaît le `userId` de l'acteur ; `GameState` / archive ne conservent que `forfeitingTeam`. | Capturer autoritairement **`forfeiting_seat_index`** dans l'événement final et le travail Elo `pending`, dans la transaction de fin. |
| `multiplayer_games` et `multiplayer_game_players` sont l'historique immuable, avec lecture limitée aux participants ; `profiles(id, username)` reste privé et lisible par son propriétaire. | Ledger Elo séparé, références vers l'archive et RPC de lecture bornées. Pas de `SELECT` global sur `profiles`. |
| Le solo s'exécute dans le navigateur et `games` accepte une insertion par son propriétaire (`PRD-socle.md`, migration solo). | **V1 Elo = parties multijoueur autoritaires uniquement**, y compris une room à un humain et trois bots. Le mode solo local ne peut pas servir de preuve de victoire Elo sans nouveau chemin autoritaire, hors périmètre. |

La formule ne modifie ni le moteur de jeu, ni les règles, ni la logique multijoueur actuelle dans cette PR. Les migrations futures devront examiner les définitions finales des fonctions SQL après toutes les migrations, en particulier `commit_room_state`, `commit_timed_out_turn`, `enable_bot_takeover`, `persist_multiplayer_archive` et `rematch_room`.

## 2. Contrat produit

Chaque compte possède **un seul Elo KFFR visible**, permanent, initialisé à **1 000** lors du premier départ éligible. Aucun Elo solo, duo ou mixte ; aucune synergie, confiance ou bonus partenaire. Aucun bouton classé / non classé. Toute partie multijoueur sous Contrée classique est automatiquement comptabilisée une fois terminée et validée. Variantes, snapshots custom et autres modes sont exclus.

Présentation cible, pour une personne déjà classée :

> ANTONIN<br>
> 1 437 ELO<br>
> SAIT JOUER III<br>
> #184

Avant cinq parties éligibles **appliquées**, afficher l'Elo et `Placement n/5`, mais aucune position ni rang officiel. À cinq, afficher le sous-rang dérivé et l'entrée au classement. Le libellé de sous-rang peut être prévisualisé pendant le placement seulement s'il est clairement non officiel ; V1 recommande de le masquer. Un compte sans départ éligible n'a pas encore de ligne Elo et peut voir « 1 000 Elo de départ » comme aperçu, sans `rated_games` fictif.

Le rating monte et descend naturellement. Pas de saison, reset, soft reset, protection de descente, BO de promotion, LP ou points de ligue. Les statistiques hebdomadaires ou mensuelles futures n'influencent jamais l'Elo.

## 3. Éligibilité et résultat

Au démarrage, comparer le `GameRulesetSnapshot` résolu et gelé au **contenu officiel** `CONTREE_KFFR_RULESET` v1 (ID, version et champs de règles normalisés). Une simple égalité d'ID, de version, de `scoring_mode` ou de `target_score` ne suffit pas si le contenu diffère. Refuser de créer un `rating_match` en cas de mismatch, de snapshot absent/non validable ou de partie non autoritaire. Les futures versions du preset devront recevoir une décision d'éligibilité explicite avant déploiement ; ne pas classer automatiquement une V2 sous la politique V1. Conserver dans le ledger le snapshot ou son empreinte vérifiable et l'identité du preset.

Au terme autoritaire de la partie, `winnerTeam` / `multiplayer_games.winner_team` est 0 ou 1, et `end_reason` vaut `score` ou `forfeit`. Le moteur actuel ne produit pas d'égalité finale (`winner_team NOT NULL`, contrainte 0/1) : `result` vaut 1 pour une victoire, 0 pour une défaite ; **0,5 n'est pas utilisé en V1**. Une partie annulée, non achevée ou dont le résultat ne peut être validé reste sans effet Elo : aucun `rating_match` n'est créé avant une fin valide ; un `pending` invalidé est marqué `void` sans toucher aux ratings. Une revanche est une nouvelle partie avec son propre ID et son propre snapshot.

## 4. Calcul V1

La [spécification de formule](rating-formula-v1.md) fixe l'ordre des opérations, l'arrondi et les exemples chiffrés. Pour chaque siège, prendre la cote de prédiction humaine figée au départ ou la cote interne du bot figée au départ. Force d'équipe = moyenne des deux sièges. Calculer la probabilité Elo avec un diviseur de 400. Puis calculer, pour **chaque humain**, `K × fiabilité × (résultat − probabilité de son équipe)`, arrondi à l'entier le plus proche, demi-unités **éloignées de zéro**. Les bots ne reçoivent ni delta ni ligne `player_ratings`.

`K` dépend du nombre de parties Elo **appliquées avant ce départ** : 0–9 → 40 ; 10–29 → 36 ; 30+ → 32. Le départ fige le K du joueur. Ainsi, une partie qui se termine plus tard ne modifie pas son K, même si d'autres parties ont été appliquées entre-temps. Les tranches ne dépendent pas du nombre de parties en cours.

La fiabilité réduit l'amplitude **après** calcul des forces, jamais la difficulté prédite : quatre humains 1,00 ; trois humains 0,95 ; deux humains adversaires 0,85 ; deux humains partenaires 0,60 ; un humain 0,20. La configuration de départ décide de cette catégorie, même en cas de bot takeover. Aucun plancher artificiel de gain/perte. Une variation arrondie à zéro est possible et la partie compte tout de même.

Les bots utilisent une cote interne serveur versionnée, résolue à partir de `room_players.bot_profile_id` (actuellement l'officiel `advanced_rules_v4` via `OFFICIAL_BOT_PROFILE_ID`). Préférer un **registre de configuration serveur versionné** par profil et version de stratégie : les profils et leurs stratégies sont actuellement définis en code, sans cote Elo DB. Chaque entrée indique sa cote ; fallback initial centralisé à 1 000 si aucun calibrage existe. Garder `bot_profile_id`, `bot_version`/clé de calibrage et `bot_rating_snapshot` dans le ledger. Le recalibrage d'un bot ne réécrit aucun match passé ; jamais de rating bot public ni de mise à jour après match.

## 5. Snapshot au départ, application après la fin

La transition `lobby → playing` et la création du **snapshot privé de départ** forment une seule transaction avec contrôle `state_version` et statut. Le futur point d'intégration est la fonction DB autoritaire appelée par `start-game`, pas un second appel Next après `commit_room_state`. Après remplissage des sièges vides en bots, sauvegarder quatre sièges : `seat_index`, `team_id`, `kind`, `user_id` humain, `rating_snapshot`, `k_factor_snapshot` humain, `bot_profile_id` / `bot_version` / `bot_rating_snapshot` bot. Figer `formula_version = 1`, règles, `human_count`, catégorie et coefficient de fiabilité, ainsi que l'ID source. Créer/verrouiller les lignes `player_ratings` humaines dans un ordre déterministe et lire cotes/compteurs dans cette transaction. Rejouer exactement le même départ retourne le même snapshot ; toute composition discordante est une erreur, pas une réécriture. Le `rating_match` n'est créé qu'à la fin, en état `pending`.

L'application Elo, éventuellement retardée, calcule le delta **sur ce snapshot**, puis l'ajoute au **rating courant verrouillé**. Exemple : snapshot 1 200, une autre partie porte le courant à 1 215, delta du match +12 ⇒ nouveau rating **1 227**, jamais 1 212. `rating_before_apply` et `rating_after_apply` décrivent cet instant d'application, pas la cote prédictive initiale. Deux matches terminant presque ensemble peuvent donc utiliser le même snapshot de cote mais appliquer leurs deltas successivement au courant.

Tous les chemins de fin doivent **clôturer et archiver la partie normalement** et créer atomiquement un `rating_match` en état `pending` à partir du snapshot du départ. Cette transaction ne calcule aucun delta. Après son commit, un traitement séparé applique `pending → applied` de façon atomique et idempotente. Un bug de calcul Elo laisse la partie terminée et le match `pending` pour retry ; aucun joueur ne reçoit une attribution partielle. La V1 privilégie la clôture de la partie et accepte un Elo retardé. Une panne de la base qui empêche le commit de la fin et du `pending` reste une panne de persistance de partie, distincte d'une erreur de calcul Elo. La future UI peut temporairement afficher l'ancien Elo avec un état « mise à jour en attente » jusqu'à `applied`, puis relire le résumé.

## 6. Déconnexion, bot takeover et forfeit

Déconnexion, délai et bot takeover temporaire ne sont **pas** un forfeit Elo. La reconnexion ne déclenche aucune pénalité. Le siège humain reste celui de son `user_id` initial pour toute la partie, avec sa cote et son K du départ. Le risque qu'un joueur laisse volontairement jouer le bot existe ; V1 conserve les règles actuelles et n'invente pas une sanction réseau. Un forfeit **officiellement enregistré** donne la défaite à son équipe.

Si le forfeiter a un partenaire humain, calculer d'abord les deux pertes normales entières, puis transférer au forfeiter **50 % de la valeur absolue de la perte normale du partenaire**, arrondie comme la formule. Exemple −16/−16 ⇒ forfeiter −24, partenaire −8. Somme des deltas humains de cette équipe conservée. Le compteur `forfeits` augmente uniquement pour l'auteur identifié, tandis que les deux humains ont une `loss`. Si le partenaire est un bot, aucun transfert depuis le bot : le forfeiter garde son delta normal. Le camp gagnant reçoit son delta normal, sans bonus de forfeit. Si le delta du partenaire est zéro, transfert zéro.

**Adaptation indispensable :** la fin actuelle ne stocke que `forfeiting_team` ; il faut capturer autoritairement **`forfeiting_seat_index`** dans l'événement de fin / archive et le `rating_match pending`, dans la même transaction. La requête client `forfeit-game` n'est qu'une intention : le serveur connaît l'utilisateur authentifié et retrouve son siège avec `humanSeat`. Ne jamais accepter un `user_id` de forfeiter fourni par le client, ni déduire l'auteur du partenaire, de la déconnexion ou du seul `forfeiting_team`. Un forfeit historique sans auteur prouvé n'est pas recalculé.

## 7. Modèle de données proposé — aucune migration ici

| Table future | Champs et contraintes conceptuels |
|---|---|
| `player_ratings` | `user_id` PK vers `auth.users`, `rating integer NOT NULL DEFAULT 1000`, `rated_games`, `wins`, `losses`, `forfeits` entiers non négatifs, `peak_rating`, `created_at`, `updated_at`. Invariants `rated_games = wins + losses`, `forfeits <= losses`, `peak_rating >= rating`. Création à la première partie éligible au départ ; compteurs incrémentés à l'application. **Suppression de cette ligne à la suppression du compte**, donc disparition immédiate du classement. |
| Stockage privé du snapshot de départ | Structure durable future, par exemple `rating_start_snapshots`, identifiée par `source_game_id UNIQUE` et contenant les quatre sièges, ratings/K/bot versions figés et la formule. Écrite atomiquement avec `lobby → playing`, protégée de toute lecture/écriture client. À la fin, elle fournit les données de l'insert `rating_matches pending`. Les références personnelles suivent la même anonymisation que le ledger. |
| `rating_matches` | `id` PK, `source_game_id uuid UNIQUE NOT NULL` reprenant `rooms.active_game_id` / `multiplayer_games.id`, `source_room_id` informatif, `ruleset_id`, `ruleset_version`, snapshot ou empreinte, `formula_version = 1`, `human_count`, catégorie/`reliability_factor`, `winner_team`, `end_reason`, `forfeiting_seat_index`, statut `pending / applied / void`, `started_at`, `completed_at`, `processed_at`. Création atomique avec la fin et l'archive ; lien possible vers `multiplayer_games.id` désormais existant. Aucun pseudo personnel dans cette table. |
| `rating_match_participants` | PK `(match_id, seat_index)`, `team_id = seat_index % 2`, `kind human/bot`, `user_id` humain nullable **aussi après suppression du compte**, `rating_snapshot`, `k_factor_snapshot` humain, `bot_profile_id`, `bot_version`, `bot_rating_snapshot` bot, `result`, `forfeited`, `rating_before_apply`, `delta`, `rating_after_apply` humains. Contraintes de nullabilité cohérentes avec le kind et la suppression ; `UNIQUE(match_id, user_id)` partiel pour les identités présentes. Quatre sièges exigés avant passage `applied`. **Aucun pseudo** dans le ledger ; les anciennes lignes restent anonymisées/dissociées après suppression du compte, sans casser les autres participants. |

Un index sur `player_ratings(rating DESC, user_id)` sert le classement ; un index `(user_id, processed_at DESC)` via le ledger sert l'historique personnel. Le `source_game_id UNIQUE` et la PK des sièges empêchent les doublons ; une fonction transactionnelle vérifie en plus `status = pending` sous verrou avant application. Aucun compteur ne peut être recalculé depuis un événement Realtime côté client.

Ne pas rétroclasser automatiquement les archives existantes : elles n'ont ni snapshots Elo au départ ni auteur individuel fiable du forfeit. Démarrage prospectif à la mise en service ; aucun « rattrapage » inventant K ou cote bot historiques.

## 8. Transaction et concurrence futures

1. **Start.** L'opération DB verrouille la room, valide `lobby` + `state_version`, `active_game_id`, règles et quatre sièges après remplissage. Elle verrouille/crée les ratings humains par `user_id` croissant, fige rating/K/bot config, puis commit room + `GameState` + snapshot privé de départ ensemble. Un échec annule tout. Un ID source déjà snapshoté avec données identiques est idempotent ; divergent est rejeté.
2. **Finish et mise en attente.** Sur chacun des chemins autoritaires de fin (action, timeout, takeover, forfeit), l'opération DB verrouille la room et valide le résultat, l'archive, le snapshot de départ et, si nécessaire, `forfeiting_seat_index`. Elle passe la room à `finished`, persiste `multiplayer_games`/`multiplayer_game_players`, **insère `rating_matches` et ses quatre participants en `pending`** avec `source_game_id UNIQUE`, puis commit le tout. Elle ne calcule aucun delta et ne verrouille aucun rating pour l'application. Un double appel sur la même fin ne crée pas de second travail Elo.
3. **Application séparée.** Un worker ou retry contrôlé verrouille le `rating_match pending` et vérifie le résultat autoritaire déjà archivé. Si `applied`, il retourne le résultat enregistré sans mutation. Il verrouille les `player_ratings` concernés par `user_id` croissant ; tous les traitements de ratings multiples suivent cet ordre. Il calcule les deltas depuis les snapshots, les ajoute aux ratings **courants**, met à jour compteurs/pics, remplit le ledger avant/delta/après, passe le match à `applied`, puis commit unique. Aucun joueur ne reçoit un Elo partiel.
4. **Échec / retry.** Une erreur de calcul ou d'application annule seulement la transaction d'application : la partie et l'archive restent terminées, le match reste `pending`. Un retry avec le même `source_game_id` reprend sûrement ; deux workers se sérialisent sur le match ; jamais de seconde application d'un état `applied`. Prévoir une surveillance des `pending`, des retries bornés avec alerte et une reprise opérateur, pour éviter un rating indéfiniment retardé. Une partie `void` ne touche aucun rating ni compteur et nécessite une procédure auditée pour toute correction.

Les arguments client ne contiennent ni résultat Elo, ni delta, ni `user_id` de forfeiter. L'API existante authentifie les intentions ; la DB doit vérifier les faits depuis les données serveur, pas accepter un payload `winner` comme vérité. La création atomique du `pending` à la fin exige une refonte ciblée des fonctions SQL de commit actuelles dans la **future** PR B.

## 9. Sécurité et lecture

Révoquer toute écriture `anon`/`authenticated` sur les futures tables Elo, y compris le snapshot privé de départ. RLS et grants n'exposent au joueur que son résumé et son historique autorisés ; les cotes bots, snapshots privés et résultats de tiers ne sont pas lisibles directement. Les mutations sont réservées à la transaction serveur contrôlée, `SECURITY DEFINER` durci (`search_path` fixé, objets qualifiés, `EXECUTE` révoqué à `PUBLIC`/`anon`/`authenticated` sauf wrapper de lecture explicitement accordé), et testées avec de vrais JWT de plusieurs comptes. Ne jamais exposer la clé `service_role` au client.

RPC de lecture **à créer**, pas existantes : `get_my_rating_summary`, `get_rating_leaderboard`, éventuellement `get_player_rating_summary`. La future RPC leaderboard ne retourne **que** `pseudo public`, `Elo`, `rang` et `position`. Jamais d'email, d'UUID visible ni de donnée privée du profil. Elle résout le pseudo côté serveur dans une projection limitée ; `profiles` conserve sa RLS propriétaire, sans `SELECT` global. L'UUID peut servir de clé interne au tri et aux jointures mais n'entre pas dans la réponse publique. Les lecteurs ne peuvent pas réclamer arbitrairement les snapshots privés d'autrui.

À la suppression d'un compte, supprimer `player_ratings` et donc son entrée au classement. Conserver les anciennes données de match nécessaires à l'intégrité historique des autres joueurs, mais **sans pseudo dans le ledger Elo** et avec les liens personnels du compte supprimé anonymisés ou dissociés (`user_id` nullable après suppression, y compris dans le snapshot privé). Ne pas supprimer en cascade les matches ou participants des autres joueurs. Si un match est encore `pending` au moment de cette suppression, ne pas recréer le rating du compte supprimé : appliquer, si possible, les deltas des participants restants depuis les snapshots figés et journaliser le siège devenu anonyme. La future implémentation doit coordonner suppression et worker sous transaction/verrous pour qu'aucun retry ne réinsère le joueur supprimé.

## 10. Rangs, progression et classement

Le rang est une fonction pure du rating, jamais une colonne source de vérité et jamais un facteur de calcul. `V` est le plus bas et `I` le plus haut :

| Elo | Rang | Elo | Rang |
|---|---|---|---|
| <850 | Débutant V | 850–899 | Débutant IV |
| 900–949 | Débutant III | 950–999 | Débutant II |
| 1000–1049 | Débutant I | 1050–1099 | Pas mauvais V |
| 1100–1149 | Pas mauvais IV | 1150–1199 | Pas mauvais III |
| 1200–1249 | Pas mauvais II | 1250–1299 | Pas mauvais I |
| 1300–1349 | Sait jouer V | 1350–1399 | Sait jouer IV |
| 1400–1449 | Sait jouer III | 1450–1499 | Sait jouer II |
| 1500–1549 | Sait jouer I | 1550–1599 | Capot de Capi V |
| 1600–1649 | Capot de Capi IV | 1650–1699 | Capot de Capi III |
| 1700–1749 | Capot de Capi II | ≥1750 | Capot de Capi I |

Centraliser les seuils dans une future fonction unique partagée par résumé et UI. La barre représente `(rating − borne basse) / 50` dans les tranches de 50 ; pour `<850`, éviter une borne basse fictive et montrer simplement le chemin vers 850. `Capot de Capi I` n'a pas de rang supérieur ni de barre « prochaine tranche ». Une partie équilibrée entre quatre joueurs établis produit ±16 Elo ; trois à quatre victoires nettes peuvent donc traverser un sous-rang de 50 points.

Un **seul** classement global : filtrer `rated_games >= 5`, trier `rating DESC`, départager l'affichage à Elo égal par `user_id` **en interne** pour pagination stable ; la **position** est `DENSE_RANK() OVER (ORDER BY rating DESC)` sur l'ensemble filtré. Même cote = même position. La RPC doit permettre au joueur classé de récupérer sa propre position même hors de la page demandée ; avant cinq parties elle renvoie `position = null`. Une page ne doit pas recalculer le rang sur son seul sous-ensemble. Paginer et limiter la réponse. Chaque ligne publique contient uniquement pseudo public, Elo, rang dérivé et position ; aucune clé UUID n'est exposée. `profiles` reste privé.

## 11. Matrice de tests avant mise en production

| Domaine | Scénarios indispensables |
|---|---|
| Formule | Les cinq compositions humaines/bots, favori et outsider, K 40/36/32 aux frontières 9→10 et 29→30, arrondi positif/négatif à 0,5, variation zéro et absence de plancher ; exemples du document de formule. |
| Éligibilité | Snapshot officiel `contree-kffr` v1 exact ; variante/custom, autre version, snapshot falsifié/absent, solo client, room annulée, revanche avec nouvel ID. |
| Placement | Création au premier départ, `rated_games` 0 puis 1–4 sans position ni rang officiel ; cinquième application présente ; match `void` ne compte pas. |
| Rangs | Chaque frontière ; spécialement <850, 1000, 1049/1050, 1299/1300, 1549/1550, 1749/1750, sommet sans progression suivante. |
| Bots | Cote issue du profil/version configurés, fallback central, snapshot immuable après recalibrage, aucun rating bot muté, un humain à faible impact, takeover sans changement de composition. |
| Forfeit | Déconnexion temporaire, takeover, reconnexion, forfeit officiel identifié, −24/−8 à pertes normales −16/−16, partenaire bot, `forfeits` auteur seul, aucune redistribution sans auteur fiable. |
| Sécurité | JWT client ne modifie ni cote, delta, compteur, snapshot ni cote bot ; ne falsifie pas `winner_team`/`forfeiting_seat_index` ; aucune lecture globale de `profiles`, aucune fuite de ledger tiers ; leaderboard limité aux quatre champs publics ; vrais JWT distincts et permissions SQL. |
| Idempotence | Double finalize, retry après timeout, événement Realtime répété, deux workers concurrents, `source_game_id UNIQUE`, match déjà `applied`, revanche distincte ; erreur de calcul laisse la partie finie et le match `pending`. |
| Concurrence | Deux parties d'un joueur finissent presque ensemble ; K et probabilité du snapshot ; delta ajouté au rating courant ; ordre de locks sans deadlock ; rollback si erreur au dernier participant. |
| Ledger | Quatre sièges, before + delta = after, rating courant, `peak_rating`, victoires/défaites/forfeits, historique immutable, pas de backfill ; suppression de compte sans pseudo Elo, liens anonymisés, autres historiques préservés, `pending` encore applicable aux survivants. |
| Leaderboard | 0–4 exclus, 5 présent, `DENSE_RANK` à égalité, pagination stable, position personnelle hors première page, seulement pseudo/Elo/rang/position, disparition après suppression, ancien Elo visible pendant `pending`. |

## 12. Découpage des PR futures

| PR | Contenu | Critère de sortie |
|---|---|---|
| A | Schéma, RLS/grants, configuration bot versionnée, fonctions math pures et tests DB | Invariants, calculs, permissions et contraintes validés ; aucune écriture client. |
| B | Snapshot atomique au start ; fin + archive + `pending` atomiques sur **tous** les chemins ; capture du siège forfeiter ; worker d'application idempotent | Partie clôturée malgré erreur de calcul Elo, `pending` rejouable, aucun double delta ; concurrence et rollback testés. |
| C | RPC/API de résumé, historique et classement | Position hors page, placement, bornage et confidentialité validés. |
| D | Profil Elo, rang, progression et leaderboard | Un seul rating visible, états placement/erreur accessibles et responsive. |
| E | E2E rating multi-comptes, audit sécurité final et docs d'exploitation | Parcours à quatre comptes, bots, forfeit, reprise et double appel vérifiés. |

**Décisions V1 validées :** quatre champs publics du leaderboard (pseudo, Elo, rang, position) ; `forfeiting_seat_index` dérivé de l'acteur authentifié ; suppression du rating et anonymisation du ledger à la suppression du compte ; fin de partie indépendante du calcul Elo, avec `pending → applied` idempotent. La formule V1 reste inchangée. L'implémentation devra définir les détails de supervision et de reprise opérateur des `pending`.
