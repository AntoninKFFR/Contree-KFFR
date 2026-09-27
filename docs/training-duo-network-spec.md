# Spécification réseau proposée — « Lire les enchères à deux »

> **Statut : PROPOSÉE, à valider humainement avant toute implémentation de [#48](https://github.com/AntoninKFFR/Contree-KFFR/issues/48).** Ce document décrit le contrat V1 ; il ne livre ni table, ni API, ni UI. Référence fonctionnelle : [PRD entraînement](PRD-entrainement.md), PR L. Les décisions en fin de document restent ouvertes.

## Audit de l’existant

- [`bidReading.ts`](../engine/training/bidReading.ts) génère dix exercices déterministes (`generateBidReadingSeries`) et note une sélection d'affirmations avec `gradeBidReadingExercise`. [`advancedRulesBidReading.ts`](../bots/strategy/advancedRulesBidReading.ts) déduit les promesses des seules informations publiques ; [la doctrine v1](../reports/bid-reading-doctrine-v1.md) distingue garanties, lectures possibles et main d'illustration. Le [puzzle solo](../components/training/TrainingBidReadingPuzzleClient.tsx) est un patron de formulaire et de présentation, pas une autorité de score réseau.
- [`roomTypes.ts`](../lib/roomTypes.ts), [`multiplayerService.ts`](../lib/server/multiplayerService.ts), [`multiplayerGame.ts`](../lib/server/multiplayerGame.ts), [`roomIntentValidation.ts`](../lib/server/roomIntentValidation.ts) et [`multiplayerApi.ts`](../lib/multiplayerApi.ts) fournissent les patrons d'intentions validées, d'identité issue du jeton, de projection, de `state_version` et de mutation atomique. [`roomRealtime.ts`](../lib/roomRealtime.ts), [`useMultiplayerRoomSync.ts`](../components/multiplayer/useMultiplayerRoomSync.ts) et [`multiplayerPresence.ts`](../lib/multiplayerPresence.ts) donnent les patrons « notification → refetch », reprise au focus et heartbeat. Les [migrations multijoueur](../supabase/migrations/20260908000000_server_authoritative_multiplayer.sql) et [lobby](../supabase/migrations/20260914000000_lobby_realtime_host_transfer.sql) illustrent RLS, privilèges et séparation état public/secret. Les [tests serveur](../tests/multiplayerServer.test.ts), [synchronisation](../tests/multiplayerRoomSync.test.ts), [présence](../tests/presence.test.ts) et [E2E](../e2e/multiplayer.spec.ts) servent de patrons de vérification.
- [`multiplayerTurnTimer.ts`](../lib/multiplayerTurnTimer.ts) et [`RoomPageClient.tsx`](../app/multiplayer/[roomId]/RoomPageClient.tsx) concernent les tours d'une vraie partie : aucun timer de tour, bot ou `GameState` partagé n'est repris. Les `rooms`, `room_players` et `room_game_states` portent quatre sièges, enchères/jeu, takeover, forfait, rematch, archives, historique et Elo. Le duo pédagogique n'est pas une partie et n'écrit jamais `multiplayer_games`.
- Le [PRD social](PRD-social.md), [`socialService.ts`](../lib/server/socialService.ts), [`socialApi.ts`](../lib/socialApi.ts), la [migration sociale](../supabase/migrations/20260921000000_social_schema_security.sql) et [`GameInvitationDialog.tsx`](../components/multiplayer/GameInvitationDialog.tsx) montrent l'authentification et les invitations à une **room**. `game_invitations.room_id` ne convient pas au duo ; aucune fausse room ni FK polymorphe en V1. Les conventions de couverture sont dans [E2E_TESTING](E2E_TESTING.md) et [QA_MATRIX](QA_MATRIX.md) ; le [PRD socle](PRD-socle.md) garde le multijoueur de partie distinct.

## Contrat produit et frontière d'autorité

Deux **comptes Supabase authentifiés**, deux humains, une session synchrone. Le créateur (slot 0, hôte) choisit le niveau `bid-reading` 1 à 4 ; le rejoignant (slot 1) entre un code. Le niveau 4 est permis même si le solo ne l'a pas débloqué : la progression `localStorage` n'est pas une autorisation réseau. Une seule place par utilisateur, deux places maximum, aucun bot.

Les deux voient la **même** série publique de dix questions, dans le même ordre, et répondent indépendamment. Après le premier envoi, seul l'état « Réponse enregistrée — en attente de ton partenaire » apparaît : aucune note ni correction, y compris au répondant. La seconde réponse déclenche une transition atomique vers la correction ; les deux clients peuvent alors obtenir leur réponse, celle du partenaire, le statut correct/incorrect de chacun, `guaranteed`, `possibleMeanings`, `explanation` et la main compatible d'illustration. « Simultanément » signifie que le commit rend la vue révélée éligible **aux deux** ; la latence réseau peut différer l'affichage. Chacun confirme « Question suivante » ; les deux confirmations sont requises. Après la dixième correction et les deux confirmations, récapitulatif uniquement.

Le duo ne modifie ni progression locale, ni `training_series`, ni `training_records`, ni classement, ni Elo, ni historique de partie. Il ne crée pas de `multiplayer_game` et ne déclenche ni forfait ni abandon d'une partie. Une future évolution devra décider séparément si ces sessions comptent pour la progression.

Le navigateur envoie des **intentions**, jamais un acteur revendiqué, une note ou une réponse attendue. La route authentifiée tire `userId` du JWT Supabase, valide strictement l'intention, puis un service serveur effectue lecture, contrôle et mutation atomique. La base est canonique ; `toTrainingDuoView(canonicalSession, viewerUserId)` est l'unique frontière de sortie, analogue à `toPlayerGameView` mais propre au duo. Une clé service reste strictement côté serveur.

## Versions, génération et compatibilité

| Champ figé au démarrage | Valeur V1 |
| --- | --- |
| `axis_id`, `axis_version` | `bid-reading`, `1` |
| `doctrine_id`, `doctrine_revision` | `advanced_rules_v4`, `4.1` |
| `generator_version` | `1` |
| `ruleset_id`, `ruleset_version` | `contree-kffr`, `1` |
| `series_length` | `10` |

Le serveur tire un `seed` cryptographiquement aléatoire, entier sûr pour JavaScript **avec marge pour les neuf décalages de 1 000** utilisés par `generateBidReadingSeries({ seed, level, generatorVersion, axisVersion })`. Il le garde côté serveur. La source canonique est `{seed, versions, level, currentIndex}` ; la série peut être régénérée, sans stocker dix exercices complets. Le démarrage vérifie que les constantes runtime correspondent aux pins et que la génération réussit **avant** de committer l'état actif. Les versions et le seed sont ensuite immuables. Un runtime ultérieur qui ne sait plus lire ces pins retourne `duo_version_unsupported` et une vue d'incompatibilité sans recalcul silencieux, sans avancer l'état ni exposer de correction. Une migration d'anciennes versions nécessiterait une décision et une implémentation explicites.

## Machine d'état et intentions

```text
lobby --start (2 participants prêts et connectés)--> active/answering [index 0]
active/answering --2 réponses committées--> active/revealed
active/revealed --2 ready-next, index < 9--> active/answering [index + 1]
active/revealed --2 ready-next, index = 9--> completed
lobby ou active --cancel/leave autorisé ou expiration--> cancelled
```

`status ∈ {lobby, active, completed, cancelled}`. `question_phase ∈ {answering, revealed}` seulement en `active`, sinon `NULL`. `current_index` vaut 0 à 9 en actif ; en terminé, il reste 9 pour permettre le récap et la dernière correction. La base empêche les états impossibles. Le slot 0 est l'hôte ; il fixe le niveau à la création et peut démarrer ou annuler le lobby. Au moment de `start`, `canStart = participantCount === 2 && everyParticipantReady && everyParticipantConnected` : les deux membres doivent avoir `is_ready=true` **et** un `last_seen_at` dans la fenêtre de présence en ligne. Le bouton « Démarrer » est désactivé si l'un est hors ligne ; le serveur recalcule cette condition et refuse `start` même si le client envoie l'intention. Après `start`, réponses et passage à la question suivante sont symétriques et ne dépendent pas de la connexion de l'hôte. Pas de transfert d'hôte.

Contrat d'intentions proposé (type documentaire, aucun type runtime créé ici) :

```ts
type TrainingDuoIntent =
  | { type: "set-ready"; ready: boolean }
  | { type: "start" }
  | { type: "submit-answer"; answer: { selectedAssertionIds: string[] } }
  | { type: "ready-next" }
  | { type: "leave" }
  | { type: "cancel" };
```

| Intention | Condition et effet |
| --- | --- |
| `set-ready` | Membre en lobby ; ne change que son propre prêt. Même valeur : idempotente. |
| `start` | Hôte en lobby, exactement deux participants prêts **et connectés selon `last_seen_at`** ; tire le seed, vérifie la série, fige les versions et passe à `active/answering`. |
| `submit-answer` | Membre en `active/answering`, index courant ; sélection d'identifiants connus, distincts et de taille bornée. Une réponse immuable par joueur/question. Le deuxième commit révèle. |
| `ready-next` | Membre en `active/revealed` ; son drapeau passe à vrai. Le deuxième commit avance ou termine. Même valeur : idempotente. |
| `leave` | En lobby, le non-hôte libère le slot 1 et les `ready` sont remis à faux ; l'hôte qui quitte annule le lobby. En actif, un départ **explicite** de l'un ou l'autre annule la session, sans remplaçant. |
| `cancel` | Hôte en lobby uniquement ; annule. Un membre actif utilise `leave`. |

Un doublon `start` après succès peut renvoyer l'état courant s'il est prouvé que ce même démarrage a déjà été committé ; un nouvel `start` sans cette preuve est rejeté. `completed` et `cancelled` sont en lecture seule. Une perte réseau n'est pas `leave`.

## Projections et barrière de révélation

La vue HTTP `TrainingDuoView` contient `{session, participants, viewerSlot, exercise, result?}`. `session` expose `id`, `code` (aux membres du lobby et à l'hôte pour partage ; jamais en recherche préjoin), `status`, `questionPhase`, `level`, pins publics, `currentIndex`, `stateVersion`, dates utiles et éventuelle raison terminale. `participants` expose `slot`, pseudo snapshot, `isHost`, `isReady`, `isConnected`, `hasAnswered`, `readyForNext` ; pas d'UUID partenaire. `exercise` est une union discriminée `null | {kind:"public", ...} | {kind:"revealed", ...}`. Le résultat terminal expose `scoreA`, `scoreB`, `commonSuccesses` seulement en `completed`. Les champs inutiles à une phase sont absents, pas seulement `null`/masqués dans le DOM.

**Vue publique, `active/answering` seulement :** `questionIndex`, `level`, pins publics, `publicBids`, `targetBidIndex`, `targetPlayerId`, `targetBid`, `playerNames`/rôles, `assertionChoices`. Si l'affichage réclame `publicContext`, n'en projeter que ses éléments déjà publics (`startingPlayerId`, score public, `bidsBefore`, ruleset). La vue n'inclut **jamais** `seed`, `promise` (donc ni `guaranteed`, ni `possibleMeanings`, ni `explanation`), `illustrationHand`, réponse attendue, note, réponse partenaire ou liste de réponses du serveur. Les labels statiques des choix ne constituent pas une correction.

**Vue révélée, `active/revealed` et dernier exercice en `completed` :** ajoute la promesse doctrinale, ses `guaranteed`, `possibleMeanings`, `explanation`, `illustrationHand`, les deux réponses et les deux grades `correct`/`score`. La main est explicitement une illustration compatible, jamais une garantie de l'annonce. L'API ne prétend pas que `promise` est un fait universel hors de la doctrine V4.1.

| État vu par un membre | Métadonnées/présence | Exercice public | Réponses/grades/correction | Résultat |
| --- | --- | --- | --- | --- |
| `lobby` | oui, code aux membres | non | non | non |
| `answering`, viewer non répondu | oui, `hasAnswered` booléen | oui, formulaire | non | non |
| `answering`, viewer déjà répondu | oui, attente partenaire | oui, lecture seule | non, **même sa note** | non |
| `revealed` | oui, deux `readyForNext` | oui | oui, pour les deux | non |
| `completed` | oui | dernière question si conservée | oui | oui, X/10, Y/10, Z/10 |
| `cancelled` | oui, raison générique | non | non pour une question encore non révélée ; aucune nouvelle révélation | non |

La transition `answering → revealed` et l'insertion de la **deuxième** réponse appartiennent à la même transaction. Le GET et la réponse au premier POST, après un seul envoi, doivent physiquement omettre toute correction dans le JSON HTTP, le HTML initial, les props sérialisées, le DOM, `data-*`, les caches, les logs client et les payloads Realtime. Le premier répondant voit son propre statut soumis, pas son grade. À la correction, les deux GET deviennent éligibles immédiatement. Le passage `revealed → answering` ne se fait qu'après deux `ready-next` ; le premier prêt voit « Ton partenaire regarde encore la correction. »

## API, identité et erreurs proposées

Toutes les routes exigent un JWT Supabase valide ; chaque réponse porte `Cache-Control: no-store`. Le `userId` vient du jeton, jamais de `userId`, `actorId` ou `hostId` fournis par le navigateur. Valider schémas et tailles du JSON avant le service ; refuser propriétés inattendues et corps excessifs. Les mutations renvoient une `TrainingDuoView` projetée pour l'appelant, avec son `stateVersion` courant. Les non-membres n'obtiennent jamais une vue via ID ; réponse générique identique pour ID inconnu et interdit lorsque la confidentialité l'exige.

| Route | Corps | Succès |
| --- | --- | --- |
| `POST /api/training/duo/sessions` | `{level: 1|2|3|4}` | `201 {data: TrainingDuoView}` ; hôte slot 0, code créé |
| `POST /api/training/duo/sessions/join` | `{code: string}` | `200 {data: TrainingDuoView}` ; slot 1 réservé atomiquement, ou vue existante si même membre |
| `GET /api/training/duo/sessions/[sessionId]` | aucun | `200 {data: TrainingDuoView}` selon identité et phase |
| `POST /api/training/duo/sessions/[sessionId]` | `{expectedVersion: number, intent: TrainingDuoIntent}` | `200 {data: TrainingDuoView}` après commit |
| `POST /api/training/duo/sessions/[sessionId]/presence` | aucun | heartbeat authentifié, réponse minimale ou vue ; **pas** une intention de jeu |

Le code V1 est tiré par CSPRNG : par exemple dix caractères majuscules dans un alphabet de 32 signes non ambigus (environ 50 bits), unicité en base et nouveau tirage en cas de collision. Normaliser uniquement casse/espaces prévus, jamais accepter un code partiel. Création, tentative de code et mutations sont limitées par compte et IP, avec réponse de préjoin générique : aucun nom d'hôte, niveau, état ou liste de participants avant adhésion autorisée. Un code inconnu, complet, annulé, expiré ou non joignable produit **le même code et le même message publics** ; les raisons internes peuvent être journalisées sans code de partage. `game_invitations` reste lié à `room_id` ; invitation d'ami hors V1, future table `training_duo_invitations` ou refonte explicite distincte.

Format erreur stable : `{code, error}` où `error` est français et sans données secrètes. `401` sans jeton ; `duo_session_not_found`/`duo_not_member` (`404` public indiscernable), `duo_session_full` (code interne ou affichable uniquement à un membre déjà autorisé, jamais au préjoin), `duo_session_expired` (`410` pour membre), `duo_host_required` (`403`), `duo_wrong_status`, `duo_version_conflict`, `duo_already_answered`, `duo_waiting_for_partner`, `duo_already_ready` (`409`), `duo_partner_offline` (`409` au `start`), `duo_invalid_answer` (`400`), `duo_version_unsupported` (`409`). Exemples de messages : « Session introuvable ou inaccessible. », « La session vient de changer. », « Réponse déjà enregistrée. », « Ton partenaire doit être connecté pour démarrer. », « Cette version de la série n'est plus prise en charge. » Toute tentative de join non réussie retourne publiquement `duo_session_not_found` et le même message générique, quelle que soit la raison interne.

## Données proposées et contrôle d'accès

**Aucune migration dans cette PR.** Une future migration dédiée crée :

| Table | Colonnes et contraintes principales |
| --- | --- |
| `training_duo_sessions` | `id uuid PK`, `code text UNIQUE NOT NULL`, `host_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`, `status`, `question_phase`, `level CHECK 1..4`, pins `axis_id/axis_version/doctrine_id/doctrine_revision/generator_version/ruleset_id/ruleset_version/series_length`, `current_index CHECK 0..9`, `state_version bigint CHECK >=0`, `created_at`, `updated_at`, `started_at`, `finished_at`, `cancel_reason`. Contraintes de cohérence phase/status et timestamps ; pins imposés V1 à la création. **Aucun seed ni score secret.** |
| `training_duo_session_secrets` | `session_id uuid PK REFERENCES training_duo_sessions(id) ON DELETE CASCADE`, `seed bigint` (entier sûr borné). Lecture/écriture service uniquement ; jamais dans Realtime. Séparation analogue à `rooms`/`room_game_states`. |
| `training_duo_participants` | `id uuid PK` technique (identité de réplication, **pas** UUID utilisateur), `session_id uuid REFERENCES training_duo_sessions(id) ON DELETE CASCADE`, `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`, `slot smallint CHECK IN (0,1)`, `display_name` snapshot borné, `is_ready`, `last_seen_at`, `ready_for_next`, `joined_at`, `left_at`. `UNIQUE(session_id,user_id)` pour la FK des réponses, `UNIQUE(session_id,slot)` pour membres actifs (index partiel si historique des départs conservé). Le lobby `leave` marque le départ/libère le slot sans `DELETE` de ligne. **Aucune note courante dans la ligne Realtime.** `isConnected` est dérivé de `last_seen_at`, non une vérité concurrente à synchroniser. |
| `training_duo_answers` | `(session_id,question_index,user_id)` PK, `session_id uuid REFERENCES training_duo_sessions(id) ON DELETE CASCADE`, FK composite `(session_id,user_id)` vers `training_duo_participants(session_id,user_id) ON DELETE CASCADE`, `question_index CHECK 0..9`, `answer jsonb NOT NULL` bornée/validée, `score smallint CHECK IN (0,1)`, `submitted_at`. Pas de `UPDATE` applicatif d'une réponse. Hors Realtime et hors lecture directe client. |

Le service calcule les scores par `SUM(answer.score)` **uniquement dans une projection autorisée** ; `commonSuccesses = COUNT(question_index où les deux scores valent 1)`. Aucun classement ni vainqueur nécessaire. Un score intermédiaire n'est pas stocké dans `participants`, car une ligne publiée à Realtime pourrait divulguer le grade après le premier envoi. Le GET en `answering` peut exposer `hasAnswered` comme booléen sans exposer valeur ni note ; son changement exige un `state_version`/update de session pour notifier les deux clients.

RLS activée sur toutes les tables. Révoquer `INSERT/UPDATE/DELETE` à `anon` et `authenticated` partout, ainsi que `SELECT` direct sur `answers` et `secrets`. **Révoquer d'abord tout `SELECT` de table** sur `training_duo_sessions` et `training_duo_participants` à `anon`/`authenticated`, puis accorder à `authenticated` des `GRANT SELECT (colonnes)` explicites, protégés par une policy de membre via `auth.uid()`. Ne jamais faire `GRANT SELECT ON training_duo_sessions TO authenticated` sans liste de colonnes. Whitelist V1 minimale pour **grant et publication Realtime** : sessions = `id, status, question_phase, current_index, state_version, updated_at` ; participants = `id, session_id, slot, is_ready, ready_for_next, last_seen_at`. Les `id` publiés sont des identifiants de ligne, jamais des UUID utilisateur ; l'`id` technique de participant évite de publier `user_id` comme identité de réplication pour les UPDATE. `host_user_id`, `user_id`, `code`, noms, pins, réponses, notes et toute future colonne interne restent hors accès direct et hors payload Realtime. Le GET authentifié fournit le code et la vraie `TrainingDuoView` aux membres autorisés. Tester que la publication effective et les grants coïncident exactement avec ces listes ; aucune publication `FOR ALL` sans colonne explicite. Les contrôles d'appartenance ne doivent pas dépendre d'une policy récursive non testée. Le service privilégié vérifie toujours le membre avant de lire les secrets ou les réponses. Pas de RPC `SECURITY DEFINER` accessible sans vérification interne de `auth.uid()` ; une route avec service role ne transmet pas l'ID navigateur. Sur Supabase, vérifier les grants explicites et la publication effective, sans supposer qu'une nouvelle table est automatiquement exposée. Toute vue complète passe par l'API authentifiée.

Les sessions duo sont éphémères, sans historique utilisateur durable : supprimer un compte peut supprimer intégralement toutes les sessions duo auxquelles il participe. La FK `host_user_id ON DELETE CASCADE` supprime directement les sessions de l'hôte. Pour la suppression du compte du slot 1, `user_id ON DELETE CASCADE` supprime sa ligne participant ; un **trigger DB transactionnel `AFTER DELETE` sur `training_duo_participants`** supprime alors la session encore présente, dans la même transaction, plutôt que de laisser un état actif à un seul joueur. Le `leave` ordinaire de lobby ne supprime pas physiquement cette ligne et ne déclenche donc pas ce nettoyage. La suppression de session cascade vers **tous** ses participants, réponses et secrets ; la FK composite des réponses cascade aussi sur un participant supprimé. Le trigger est idempotent si la session a déjà disparu par la cascade de l'hôte. Aucun `NO ACTION` restant vers `auth.users` ne doit bloquer la suppression d'un compte.

## Transactions, concurrence et idempotence

Chaque mutation métier est une transaction/RPC unique : verrouiller la ligne de session, établir l'identité et l'appartenance, appliquer expiration/compatibilité, vérifier `expectedVersion` contre `state_version`, contrôler statut/phase/index, écrire le fait unique et les drapeaux concernés, effectuer l'éventuelle transition, incrémenter `state_version` **une seule fois par mutation effective**, puis committer. Réponse HTTP : refetch/projection après commit ; une erreur ne laisse pas de demi-transition. Join verrouille la session et réserve atomiquement le slot 1. Les contraintes uniques sont la dernière défense contre doubles joins/réponses.

`submit-answer` valide que `selectedAssertionIds` est un tableau de valeurs uniques appartenant à `assertionChoices` de l'exercice courant, régénéré côté serveur depuis le seed/version/niveau/index. Il appelle `gradeBidReadingExercise(exercise, answer)` et stocke `score: 0|1` ; aucune donnée `correct`, `score`, `promise` ou `expected` reçue du client n'est acceptée. Sous verrou, chercher d'abord une réponse déjà committée **pour cet index et ce membre** : une seconde soumission **identique** est idempotente et renvoie la vue courante sans version supplémentaire, même si la phase est devenue `revealed` ou si `expectedVersion` est ancien ; une seconde **différente** donne `duo_already_answered`. Ne jamais accepter un changement après attente ou révélation. Le doublon doit être comparé à une forme canonique (ensemble d'IDs trié) pour ne pas traiter l'ordre de clic comme une nouvelle réponse. Sans doublon existant, contrôler strictement phase, index et version avant insertion ; une réponse initiale sur un index/phase périmé est refusée. La deuxième réponse committée bascule vers `revealed` dans la même transaction.

`ready-next` est de même protégé : le premier prêt reste en `revealed`, le deuxième remet les deux drapeaux à faux puis avance l'index, ou clôt après la question 10. Les doubles clics n'avancent jamais deux fois. Pour deux soumissions quasi simultanées avec le même `expectedVersion`, l'une committe ; l'autre reçoit `duo_version_conflict`, refetch, constate si son fait est déjà enregistré et, sinon, **une seule** nouvelle tentative sur la version fraîche pour une intention idempotente. Même règle pour `ready-next` et `set-ready`. Pas de retry aveugle de `start`, `leave` ou `cancel`. Si un deuxième conflit survient, afficher une action de rechargement.

## Realtime, présence, reconnexion et expiration

Abonnement Postgres Changes aux seules `training_duo_sessions` et `training_duo_participants`, filtré par session et protégé par RLS, avec **uniquement** les colonnes whitelistées ci-dessus. Le payload Realtime n'est ni `TrainingDuoView` ni une source d'état métier : événement = signal d'invalidation, court debounce, puis GET authentifié `no-store`. Ne jamais fusionner/appliquer le payload comme état métier. `training_duo_answers` et `training_duo_session_secrets` ne sont ni publiées ni lues directement. Chaque premier envoi et chaque transition met à jour la session pour déclencher le refetch ; l'événement de révélation ne transporte que l'état sûr. À la reconnexion Realtime, au focus, retour de visibilité et retour réseau, refaire GET ; ignorer les réponses GET plus anciennes que la version déjà affichée (et les réponses d'une session précédente).

Heartbeat authentifié conceptuellement toutes les 15 s ; après 60 s sans signal, `isConnected=false` calculé côté serveur. En lobby, cette règle détermine si les deux joueurs peuvent démarrer ; le serveur vérifie leurs `last_seen_at` au moment du commit de `start`. **Une fois la session active**, une perte réseau laisse la place et les réponses intactes, ne crée aucune réponse automatique, ne révèle rien prématurément et **n'annule pas** la session. Le partenaire voit « Partenaire déconnecté — en attente de reconnexion. » La reconnexion refait GET, puis heartbeat, et reconstruit sans localStorage indispensable : `answering` sans réponse → formulaire ; avec réponse → attente ; `revealed` → correction et prêts ; `completed` → récap ; `cancelled` → explication. L'hôte hors ligne ne bloque pas la réponse de l'autre.

Politique V1 proposée : lobby inactif depuis `updated_at` pendant 30 min → `cancelled`/raison `expired` ; actif → hard TTL de 2 h depuis `started_at` (pas depuis dernière présence) ; terminal → rétention de 24 h après `finished_at` avant purge. Sur GET/mutation, expiration paresseuse transactionnelle avant projection ; maintenance ultérieure peut purger. Pas de cron temps réel nécessaire. Ce choix borne stockage et attente infinie sans confondre 60 s d'offline et abandon. Après purge, GET membre peut répondre `duo_session_expired` si marqueur conservé, sinon `duo_session_not_found` ; ne pas révéler l'existence au non-membre. Un départ actif explicite annule immédiatement, conserve une page « La session a été interrompue. », sans récap certifié ; aucune note nouvelle n'est révélée à cause de l'annulation.

## Sécurité, menaces et limites anti-cheat

| Menace | Impact | Garde proposée | Test attendu |
| --- | --- | --- | --- |
| Non-membre devine `sessionId` | lecture de métadonnées | JWT, membership sur GET/POST, 404 indiscernable | GET/POST non-membre sans vue |
| Brute force du code | adhésion/scraping | code CSPRNG ~50 bits, auth et rate limit compte/IP, erreur générique | rafale bornée, aucune métadonnée préjoin |
| `userId` forgé | usurpation | identité du JWT, rejet de champs acteur | body forgé n'agit pas pour autrui |
| Réponse au nom du partenaire | faux score | membre courant issu du JWT, PK composite | tentative refusée |
| Changement après soumission | apprentissage opportuniste | réponse immuable, doublon différent rejeté | deux réponses différentes, première conservée |
| `SELECT training_duo_answers` | réponse/grade anticipés | aucun grant/policy client, table hors Realtime | anon/membre/non-membre ne lisent rien |
| Lecture du seed | reconstruction cachée | table secrets service-only, hors projection/publication | aucune lecture client ni payload |
| Correction après premier envoi | fuite doctrinale | projection par phase serveur, transaction de révélation à deux | HTTP/HTML/DOM sans correction avant B |
| Payload Realtime sensible | fuite hors HTTP | seules tables/colonnes sûres publiées, payload ignoré | inspection des événements bruts |
| Identité interne lue via session ou Realtime | UUID du partenaire révélé | grants par colonne et publication minimale, sans `host_user_id`/`user_id` | B ne lit pas l'UUID de A ; événements bruts sans UUID utilisateur |
| Double submit concurrent | double note/révélation | verrou, PK, CAS, idempotence canonique | une ligne et une transition |
| Deux joins slot 1 | trois membres | lock et `UNIQUE(session_id,slot)` | un seul gagnant, deux membres max |
| Deux `start` simultanés | seeds/séries divergents | lock, CAS, génération avant commit | un seed et un démarrage |
| Deux `ready-next` simultanés | index sauté | lock, booléens par membre, CAS | avance exactement d'une question |
| `state_version` ancien | mutation sur mauvais état | 409, refetch, retry borné | aucun effet avec version périmée |
| Refresh pendant révélation | correction incomplète | GET reconstruit depuis état committé | deux contexts convergent après refresh |
| Déconnexion avant/après réponse | place ou réponse perdue | présence séparée, aucun auto-submit/cancel | état intact, reprise correcte |
| Ancienne `axisVersion` | correction sous doctrine neuve | pins vérifiés, `duo_version_unsupported` | aucun recalcul/score nouveau |
| JSON malformé ou énorme | surcharge/injection logique | taille max, schéma strict, IDs whitelistés | 400/413 sans mutation |

Le code solo embarque déjà l'interpréteur inverse V4.1 : un utilisateur motivé peut essayer de reproduire localement la doctrine à partir d'informations publiques. Le protocole ne promet donc pas un anti-cheat compétitif parfait. Il empêche les **fuites involontaires** de seed, réponse attendue, note, main d'illustration, correction et réponse partenaire avant révélation. L'absence de record, de classement et d'Elo rend cette limite acceptable en V1.

Journalisation serveur possible : création, adhésion, démarrage, réponse committée (index/acteur pseudonymisé), révélation, passage, fin, annulation, conflit, expiration. Ne journaliser ni access token, ni code complet, ni seed, ni réponse brute, ni `illustrationHand`, ni promesse avant révélation. Mesurer refus, conflits et latence de convergence sans données secrètes.

## Plan de migration proposé

Après validation humaine, ajouter une migration **nouvelle et versionnée** qui crée seulement les quatre tables du domaine duo, les contraintes/FK/index, le trigger de nettoyage transactionnel, RLS et grants par colonne minimaux. Ne modifier ni les tables `rooms`/`room_players`/`room_game_states`, ni `game_invitations`, ni les tables de records. Ajouter à la publication Realtime seulement les deux tables et leurs colonnes explicitement whitelistées ; contrôler les privilèges effectivement accordés à `anon` et `authenticated` dans un environnement migré. Déployer le service/API qui reconnaît exactement les pins V1, puis l'UI ; activer l'entrée utilisateur seulement quand les tests RLS, projection et concurrence sont verts. Un déploiement arrière incompatible doit masquer l'entrée duo et retourner `duo_version_unsupported` aux sessions existantes, sans régénérer sous une nouvelle doctrine. La purge après 24 h pourra être une maintenance séparée ; aucun cron n'est requis pour rendre la V1 correcte.

## Plan de tests et de livraison futurs

**Unitaires/service.** Parseur d'intentions et limites de taille ; projections lobby/public/revealed/terminal ; absence de secret et de score après un seul submit ; appartenance ; démarrage hôte avec A+B prêts et en ligne accepté, B prêt mais hors ligne refusé, puis accepté après son retour en ligne ; B hors ligne **après** `start` sans annulation de la session active ; deux places ; join concurrent ; doublon identique/différent ; grade serveur et série déterministe ; révélation exactement à deux réponses ; ready-next exactement à deux prêts ; question 10 terminée ; CAS ; refresh/reconnexion ; offline sans annulation ; leave actif avec annulation ; versions incompatibles. Garder les tests moteur de `bid-reading` indépendants.

**Base/RLS.** Anon ne lit rien ; non-membre authentifié ne lit rien ; membre n'a aucun `SELECT` direct sur réponses/seed ; B ne peut jamais `SELECT host_user_id`, A ne peut pas obtenir l'UUID de B via sessions/participants ; événements Realtime bruts sans UUID utilisateur, et colonnes sessions/participants exactement égales aux deux whitelists ; aucun client n'insère/ne modifie/ne supprime directement ; publication Realtime sans answers/secrets ; joins simultanés à deux slots maximum ; unicité des réponses ; transition, note et incrément de version atomiques. Supprimer le compte hôte avec session en lobby, puis active, puis terminale (`completed`/`cancelled`) : chaque suppression réussit sans session, participant, réponse ni secret orphelin. Répéter pour le compte slot 1 dans les mêmes états ; vérifier en particulier que l'actif ne garde pas un seul joueur, que le trigger et les cascades sont atomiques et qu'aucune FK ne bloque. Tester avec de vrais rôles JWT et inspecter grants/publication, pas seulement une simulation de service.

**E2E.** Deux `BrowserContext` authentifiés distincts : A crée et partage le code, B rejoint, chacun devient prêt ; déconnecter/fermer B **avant** `start`, attendre son statut hors ligne et vérifier que A ne peut pas démarrer (bouton désactivé et intention serveur refusée) ; reconnecter B et vérifier que A peut démarrer ; même question/choix publics ; A répond, attend, B ne voit ni grade ni correction et le trafic réseau/DOM de A et B n'en contient aucun ; B répond, les deux voient les deux réponses, la même promesse et la même illustration ; A clique suivant et reste en correction, B clique et les deux reçoivent question 2 ; refresh A, déconnexion B puis statut offline **sans annulation après démarrage**, reconnexion et convergence ; finir les dix questions et vérifier X/10, Y/10 et Z/10 ; vérifier absence d'historique de partie, d'Elo, de `training_series`/`training_records`. Ajouter la soumission quasi simultanée et le conflit/retry borné. Contrôler création/rejoin, lobby, question, attente, correction, offline et résultat à 390×844, 667×375, 844×390 et 1366×768, avec même formulaire utilisable que le solo. Un screenshot seul ne prouve ni la confidentialité ni la reconnexion.

**Découpage recommandé après validation humaine.** L1 : migration dédiée, contrats réseau, validation, service transactionnel, projection, tests DB/service (`supabase/migrations/*training_duo*`, `lib/server/trainingDuo*`, `lib/trainingDuo*`, `app/api/training/duo/*`). L2 : pages/composants duo, formulaire partagé, client API, Realtime, présence, états d'attente/résultat (`app/training/duo/*`, `components/training/*Duo*`). L3 : E2E deux comptes, responsive, reconnexion, contrôle réseau, rate limiting, observabilité et durcissement (`tests/trainingDuo*`, `e2e/trainingDuo.spec.ts`). Ce sont des **emplacements envisagés**, aucun fichier de code n'est créé dans la présente PR. Chaque lot doit rester compatible avec les parties multijoueur et la progression solo existantes.

## Décisions produit à valider avant implémentation

La spécification reste **PROPOSÉE** jusqu'à validation humaine de ces choix ; aucune case n'est validée par cette PR.

- [ ] Deux comptes authentifiés obligatoires.
- [ ] Les deux participants doivent être connectés au moment du démarrage.
- [ ] Même question pour les deux participants.
- [ ] Réponses indépendantes et immuables.
- [ ] Correction seulement après les deux réponses.
- [ ] Réponse du partenaire visible après révélation.
- [ ] Question suivante seulement après les deux confirmations.
- [ ] Niveau choisi par l'hôte, sans contrainte de déblocage solo.
- [ ] Aucun record, progression ou Elo en duo V1.
- [ ] Adhésion par code uniquement en V1.
- [ ] Aucune invitation ami en V1.
- [ ] Aucun bot ni takeover.
- [ ] Hors ligne après 60 s ne vaut pas abandon.
- [ ] Départ explicite en session active annule la session.
- [ ] Aucun transfert d'hôte en V1.
- [ ] Session et données distinctes de `rooms`.
