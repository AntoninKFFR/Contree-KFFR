# PRD — Amis et invitations de partie

> **Statut : spécification du MVP, non implémentée.** Ce document décrit le comportement à livrer dans de futures PR. Il est fondé sur `main` après la PR #19 (`48e6404`). Aucun schéma, endpoint ou composant social n'existe encore.

## 1. Objectif et socle audité

Un compte connecté peut trouver un joueur par pseudo, établir une amitié réciproque, puis l'inviter dans une table multijoueur existante. L'invitation facilite l'accès à la table ; elle ne donne aucun droit de jeu et ne réserve aucun siège.

| Existant | Conséquence pour le module |
|---|---|
| `profiles(id, username)` : pseudo unique **sensible à la casse**, validé sur 1–40 caractères ; RLS propriétaire seulement ([migration identité](../supabase/migrations/20260916000000_account_profile_identity.sql), [helpers](../lib/profiles.ts)) | Conserver `profiles` privé. La recherche renvoie seulement `id` et `username` via une fonction bornée. Deux pseudos qui ne diffèrent que par la casse restent possibles ; afficher le pseudo exact et utiliser l'UUID pour agir. |
| `is_username_taken(text)` est actuellement exécutable par `anon` pour l'inscription ([migration identité](../supabase/migrations/20260916000000_account_profile_identity.sql), [inscription](../app/login/page.tsx)) | Cette vérification exacte préexistante reste une surface d'énumération. La PR schéma devra l'auditer et proposer un bornage compatible avec l'inscription ; les limites de la nouvelle recherche ne suffisent pas à supprimer ce risque. |
| `/profile` et `AppTopNav` connaissent la session et le pseudo ([profil](../app/profile/page.tsx), [navigation](../components/AppTopNav.tsx)) | Afficher `/friends` conditionnellement dans la topbar ; réutiliser l'auth existante. L'email affiché sur **son propre** profil ne doit jamais apparaître dans une réponse sociale. |
| Les rooms sont créées/retrouvées par API authentifiée ; `roomView` autorise un non-membre seulement en lobby ; `join-seat` décide de l'occupation avec `state_version` ([service](../lib/server/multiplayerService.ts), [intentions](../lib/server/roomIntentValidation.ts), [types](../lib/roomTypes.ts), [API client](../lib/multiplayerApi.ts)) | Après résolution d'une invitation, naviguer vers `/multiplayer/[roomId]`, puis employer **le même** `join-seat`. Ne jamais écrire directement `room_players` depuis le module social. |
| `rooms` est lisible par l'hôte ou un membre ; `room_players` n'expose aux membres que des colonnes limitées pour Realtime ; `room_game_states` reste côté service ([migration serveur](../supabase/migrations/20260908000000_server_authoritative_multiplayer.sql), [migration lobby](../supabase/migrations/20260914000000_lobby_realtime_host_transfer.sql)) | L'invité non assis ne peut pas valider la room par un `SELECT rooms` direct. La vérification d'invitation doit lire ces tables dans une fonction/route privilégiée et ne renvoyer que le résultat autorisé. Aucun `GameState` dans une réponse sociale. |
| Le client room utilise déjà Realtime comme signal de **refetch** authentifié ([roomRealtime](../lib/roomRealtime.ts), [synchronisation](../components/multiplayer/useMultiplayerRoomSync.ts)) | Répliquer ce principe pour les changements sociaux, avec relecture et fallback ; ne pas faire du payload Realtime une source de vérité. |

Les règles de contribution de [CONTRIBUTING.md](../CONTRIBUTING.md) s'appliquent : migrations versionnées, clé secrète strictement serveur, branche et PR sans merge automatique.

## 2. Périmètre et décisions MVP

- Compte Supabase Auth connecté **et pseudo renseigné** requis pour rechercher, demander, accepter et inviter. Le pseudo est l'identité affichée ; l'UUID est la clé technique. Aucun annuaire accessible aux visiteurs.
- Tout **joueur humain assis dans le lobby** peut inviter un ami. Ce choix correspond à une invitation entre joueurs et évite de dépendre du rôle d'hôte, transférable en cours de vie de la room. L'hôte n'a aucun pouvoir spécial sur les invitations des autres ; une invitation n'autorise pas à démarrer ou modifier la table.
- Une invitation est possible uniquement tant que la room est `lobby` et possède au moins un siège `empty`. Une place occupée par un bot n'est pas libre dans les règles actuelles. L'hôte peut toujours démarrer et remplir les sièges vides : les invitations en attente ne le bloquent pas.
- Aucune réservation : lors de `Rejoindre`, le siège peut avoir été pris entre le contrôle et le clic `join-seat`. Le conflit normal est affiché et la room relue.
- L'amitié est nécessaire **à l'envoi**. Si elle est retirée avant l'acceptation de l'invitation, l'invitation en attente devient invalide. Une personne déjà assise dans la room ne reçoit pas d'invitation.

### Hors MVP

Chat privé, groupes, clans, présence globale ou indicateur « en ligne », blocage avancé, notifications push ou email, matchmaking, classement, ELO et spectateurs. Classement et ELO relèvent d'un module ultérieur. Le MVP n'introduit ni feed de notifications général ni nouvelle autorité de présence.

## 3. Modèle de données recommandé

Deux tables pour l'amitié sont préférables à une table unique : la **demande** a un expéditeur, un destinataire et un état ; l'**amitié** est symétrique et n'a pas d'expéditeur permanent. La séparation évite de déduire une relation acceptée de deux lignes orientées ou d'un statut ambigu. Les transitions se font dans une transaction RPC.

Toutes les tables ci-dessous sont nouvelles, en `public` avec RLS activée ; leurs créations et politiques doivent figurer dans une **nouvelle migration** de la PR A. Les clés étrangères vers `auth.users(id)` sont internes à la base ; aucune lecture de `auth.users` n'est accordée au client.

| Table | Colonnes et contraintes | Index / suppression |
|---|---|---|
| `friend_requests` | `id uuid PK`, `requester_id uuid NOT NULL`, `recipient_id uuid NOT NULL`, `user_low uuid GENERATED ALWAYS AS least(requester_id,recipient_id) STORED`, `user_high uuid GENERATED ALWAYS AS greatest(...) STORED`, `status text CHECK IN ('pending','accepted','declined','cancelled')`, `created_at`, `resolved_at`. `CHECK requester_id <> recipient_id` ; `resolved_at IS NULL` ssi `pending`. | Index unique partiel `(user_low,user_high) WHERE status='pending'` : interdit A→B et B→A simultanés. Index `(recipient_id,status,created_at DESC)` et `(requester_id,status,created_at DESC)`. FK utilisateurs `ON DELETE CASCADE`. |
| `friendships` | `user_low uuid`, `user_high uuid`, `created_at` ; `PRIMARY KEY(user_low,user_high)`, `CHECK user_low < user_high`. | Deux FK utilisateurs `ON DELETE CASCADE` ; index `(user_high,user_low)` pour la seconde extrémité. Une seule ligne par paire, sans doublon orienté. |
| `game_invitations` | `id uuid PK`, `room_id uuid NOT NULL`, `inviter_id uuid NOT NULL`, `invitee_id uuid NOT NULL`, `status text CHECK IN ('pending','accepted','declined','expired','cancelled')`, `created_at`, `expires_at`, `resolved_at`. `CHECK inviter_id <> invitee_id` ; expiration initiale **30 minutes** ; `resolved_at` nul ssi `pending`. | FK room `ON DELETE CASCADE`, FK utilisateurs `ON DELETE CASCADE`, unique partiel `(room_id,invitee_id) WHERE status='pending'`, index `(invitee_id,status,created_at DESC)` et `(inviter_id,status,created_at DESC)`. L'absence de réservation ne change aucune contrainte `room_players`. |
| `social_rate_limits` | Petite table technique `actor_id`, `action`, `scope`, `window_start`, `count` ; clé composite, FK utilisateur `ON DELETE CASCADE`. | Accès réservé aux fonctions sécurisées. Incrément atomique par fenêtre, purge des fenêtres anciennes à prévoir avec la maintenance DB ; aucun état social affiché au client. |

`created_at` est horodaté par la base, jamais accepté du navigateur. Les colonnes d'identité, de paire et de room sont immuables après insertion ; les fonctions ne modifient que `status/resolved_at`. Une suppression de compte retire ses demandes, relations et invitations par cascade. Les noms des autres comptes ne sont lus depuis `profiles` que par des fonctions contrôlées ; leur changement apparaît au prochain refetch, sans recopier d'email. Les archives de partie conservent leur propre snapshot de nom existant.

Les demandes résolues peuvent être conservées 90 jours à des fins d'anti-spam puis purgées ; elles ne sont pas affichées dans « reçues/envoyées ». Le délai de nouvelle demande après refus s'appuie sur la dernière ligne résolue, sans empêcher une amitié créée autrement. La suppression d'ami retire seulement `friendships`, pas les parties passées.

## 4. Fonctions, API et contrats

### 4.1 Frontière d'authentification

Les routes Next sous `/api/social/*` vérifient le Bearer Supabase avec `authenticatedUserId(request)`, comme les routes multijoueur. Elles appellent les RPC avec **le JWT de l'utilisateur**, afin que `auth.uid()` soit l'acteur dans SQL. Les fonctions privilégiées vivent dans un schéma `private` non exposé par l'API ; de minces wrappers `public` en `SECURITY INVOKER` sont les RPC exposées. Les fonctions privées `SECURITY DEFINER` fixent `search_path = ''`, qualifient tous les objets, vérifient `auth.uid() IS NOT NULL` et chaque permission. Accorder `USAGE` sur `private` et `EXECUTE` sur les seules signatures nécessaires à `authenticated` pour que ces wrappers fonctionnent ; révoquer `PUBLIC` et `anon`. Aucun paramètre `actor_user_id` ou `requester_id` fourni par le client.

Les routes ne doivent pas transmettre `SUPABASE_SECRET_KEY` au navigateur. Si une opération doit utiliser `service_role` côté serveur, l'identité vient uniquement du token vérifié et la fonction doit revalider les droits ; le chemin JWT + `auth.uid()` est préféré pour ce module.

### 4.2 RPC minimales

| RPC exposée (paramètres client) | Résultat / transaction | Autorisation et limites |
|---|---|---|
| `search_players_by_username(p_prefix text)` | Jusqu'à **10** lignes `{user_id, username}`, tri stable `lower(username), id`, sans total ni pagination libre. | Connecté avec pseudo ; préfixe normalisé de **3 à 40** caractères, casse ignorée, `%/_/\\` échappés avant `LIKE` ; soi-même exclu. Index de recherche `lower(username) text_pattern_ops` à ajouter si nécessaire, sans modifier la RLS de `profiles`. Quota atomique **10/min et 100/jour par compte**, erreur 429. |
| `get_my_social_snapshot()` | `friends`, demandes `received/sent`, compteurs, noms des seuls comptes liés ; clés JSON/type TS bornées. | Toutes les lignes sont liées à `auth.uid()`. Ne retourner ni email, ni profil d'un tiers hors recherche, ni historique privé. |
| `send_friend_request(p_recipient_id uuid)` | Crée `pending` ou retourne conflit déterministe. | Soi interdit ; compte cible existant avec pseudo ; pas déjà amis ; pas de demande pending dans **aucun** sens. Quota **20 envois/jour** et au plus **1 nouvelle demande vers la même personne par 24 h après refus/annulation**. |
| `accept_friend_request(p_request_id uuid)` | Verrouille la demande pending, insère la paire canonique dans `friendships`, passe la demande à `accepted` ; **une transaction**. | `auth.uid() = recipient_id` seulement ; deux acceptations concurrentes deviennent idempotentes pour ce destinataire si la relation existe. |
| `decline_friend_request(p_request_id uuid)` / `cancel_friend_request(p_request_id uuid)` | Transition pending → declined / cancelled. | Refuser : destinataire seulement. Annuler : expéditeur seulement. Transition conditionnelle et verrouillée ; 409 sur action concurrente incompatible. |
| `remove_friend(p_other_user_id uuid)` | Supprime la paire canonique ; annule dans la même transaction les invitations pending entre ces deux personnes. | Un des deux membres uniquement ; action idempotente si déjà supprimée. |
| `get_my_game_invitations()` | Invitations reçues/envoyées pertinentes avec pseudo de l'autre et état **effectif** ; les expirées sont dérivées par `expires_at` et validité room puis régularisées dans une transaction. | Un participant uniquement ; jamais `room_game_states`, autres sièges privés ou identité email. Compteurs dérivés du même résultat serveur. |
| `list_invitable_friends(p_room_id uuid)` | Amis non assis dans la room ; disponibilité de la room, pas statut « en ligne ». | Appelant humain assis, room en lobby, siège vide ; liste issue des seules relations de l'appelant. |
| `send_game_invitation(p_room_id uuid, p_invitee_id uuid)` | Crée pending, expiration 30 min. Si la pending existe déjà et appartient à l'appelant, réponse idempotente ; si elle appartient à un autre invitant, retourner seulement `already_invited` / « Ce joueur est déjà invité à cette table », sans objet, ID d'invitation ni identité de l'autre invitant. | Verrouille la room, revérifie lobby + siège empty, expéditeur humain assis, amitié active, invité non assis, unique pending par room/invité ; quotas **20 invitations/jour** et anti-rafale par paire/room. L'invitation complète reste lisible uniquement par son invitant et son invité. |
| `resolve_game_invitation(p_invitation_id uuid)` | Pour le destinataire : `{room_id, state}` si rejoignable ; sinon état expiré et raison générique. | `auth.uid() = invitee_id` ; revérifie expiration, amitié, room lobby et siège empty **ou** présence déjà assise du destinataire. Ne crée aucun siège. |
| `accept_game_invitation(p_invitation_id uuid)` | Pending → accepted **après** confirmation que l'invité est un humain assis dans cette room. | Destinataire seulement ; room lue sous verrou, état accepté idempotent ; ne remplace pas `join-seat`. |
| `decline_game_invitation(p_invitation_id uuid)` / `cancel_game_invitation(p_invitation_id uuid)` | Pending → declined / cancelled. | Refuser : invité seulement. Annuler : expéditeur seulement. Transitions verrouillées et idempotentes pour le même acteur. |

Les quotas ci-dessus sont des valeurs initiales du MVP, ajustables par migration après mesure, et s'appliquent dans SQL pour couvrir aussi les appels RPC directs. Le serveur borne la taille du corps et renvoie 400/401/403/404/409/429 selon validation, authentification, droit, ressource visible, conflit ou quota ; une ressource étrangère répond comme introuvable (404) pour ne pas révéler son existence. Les réponses de succès n'incluent que les champs nécessaires à l'écran. Journalisation sans JWT, email ni payload d'invitation.

### 4.3 Routes Next prévues

- `GET /api/social` : snapshot amis + demandes + compteurs ; `GET /api/social/search?q=...` : recherche bornée.
- `POST /api/social/friend-requests` ; `POST /api/social/friend-requests/[id]/accept|decline|cancel` ; `DELETE /api/social/friends/[userId]`.
- `GET /api/social/rooms/[roomId]/invitable-friends` ; `POST /api/social/rooms/[roomId]/invitations`.
- `GET /api/social/invitations` ; `POST /api/social/invitations/[id]/resolve|accept|decline|cancel`.

Les routes sont des adaptateurs minces : parsing strict des UUID/textes, appel RPC et mapping d'erreurs. Aucun doublon des règles de permission dans le client. Un helper `lib/socialApi.ts` reprend le Bearer et la gestion des erreurs de [`lib/multiplayerApi.ts`](../lib/multiplayerApi.ts), sans élargir `RoomIntent` à des actions sociales.

## 5. Parcours UX

### `/friends`

Page authentifiée, avec état chargement/erreur/absence de pseudo cohérent avec `/profile`. Quatre sections : **Mes amis**, **Demandes reçues**, **Demandes envoyées**, **Recherche de joueurs**. Chaque ligne montre le pseudo exact et une action claire : Ajouter, Accepter, Refuser, Annuler ou Supprimer (confirmation légère pour la suppression). Dans les résultats, montrer « Déjà ami », « Demande envoyée » ou « Répondre à la demande » au lieu d'une seconde action incompatible. Recherche déclenchée après saisie d'au moins 3 caractères, debounce court, quota affiché sans révéler le nombre total de joueurs.

Le drawer principal ajoute **Amis** seulement pour une session connectée. Un badge numérique discret compte les demandes reçues pending ; les invitations pending peuvent s'y ajouter avec libellé accessible distinct ou être montrées dans `/friends`. Compteurs plafonnés visuellement à `9+`, accessibles par texte au lecteur d'écran. Pas de chargement social pour un visiteur. `/friends` propose un lien de connexion si nécessaire. Mise en page en une colonne mobile, sections aérées en desktop, composants/tokens KFFR existants et états de focus clavier.

### Invitation depuis une room

En **lobby**, un joueur humain assis voit `Inviter des amis` dans les actions de la room. Le dialogue liste ses amis éligibles ; il peut envoyer une invitation, voir « Invitation envoyée », réessayer après erreur ou fermer. Pas de bouton si la room n'est plus joignable ; le dialogue se met à jour après refetch. L'invitation apparaît dans `/friends` du destinataire avec pseudo de l'invitant, code/nom de table déjà visible au lobby et expiration. `Refuser` décide directement.

`Rejoindre` appelle `resolve_game_invitation` : si valide, navigation vers `/multiplayer/[roomId]`. Si la personne n'a pas encore de siège, la room affiche les sièges libres et elle utilise **`join-seat` existant** ; le succès appelle ensuite `accept_game_invitation`. Si elle est déjà assise, marquer accepté et ouvrir la même room, même si le lobby vient de démarrer. Une invitation arrivée à expiration affiche « Invitation expirée » et disparaît des actions. Si la navigation réussit mais le siège devient indisponible, afficher l'erreur du flux room et proposer retour aux invitations ; ne pas marquer accepté.

La route room actuelle ne permet un non-membre qu'en `lobby` et ne fournit pas de place réservée. Les futures PR ne doivent pas relâcher ce contrôle pour une invitation. Un éventuel lien partagé doit contenir **l'ID d'invitation, pas l'ID/code de room** ; seul le destinataire peut le résoudre. Limite existante à assumer : si quelqu'un partage ensuite le code ou l'UUID de room, le modèle actuel de lobby permet à un autre compte authentifié de voir la room et de tenter `join-seat`. Le MVP social n'introduit pas une politique d'accès aux rooms sur invitation uniquement.

## 6. Realtime et cohérence

**MVP fonctionnel sans WebSocket :** relecture au chargement, après chaque mutation, au retour de focus/visibilité, à la reconnexion réseau et, tant que `/friends` est visible, toutes les **30 s**. Le badge peut relire à l'ouverture du drawer et toutes les **60 s** lorsque la page est visible. Une réponse plus ancienne ne remplace pas un snapshot plus récent ; les actions concurrentes refetchent après 409.

La PR D ajoute, si les tests d'isolation passent, des abonnements Supabase Postgres Changes **filtrés par utilisateur** : `friend_requests` (demande reçue et état envoyé), `game_invitations` (invitation reçue/état envoyé), éventuellement `friendships` sur INSERT pour mise à jour immédiate de « Mes amis ». Chaque événement déclenche uniquement un refetch du snapshot autorisé. Les tables doivent être publiées explicitement, avec `SELECT` limité par RLS aux parties concernées ; aucune publication de `profiles`, `auth.users` ou `room_game_states`. Souscriptions fermées à la déconnexion et lors du démontage. Pas de canal de présence globale.

Ne pas dépendre d'un DELETE Realtime pour faire disparaître une ligne : [Supabase précise](https://supabase.com/docs/guides/realtime/postgres-changes) que RLS ne s'applique pas aux événements DELETE de la même façon et que l'ancien enregistrement est limité ; les transitions d'état UPDATE et le refetch/focus sont préférés. Mesurer le coût des deux filtres orientés et vérifier en test qu'aucun tiers ne reçoit le payload. Si l'isolation ou le quota Realtime est insuffisant, conserver le fallback de refetch ; le badge reste utile sans nouvelle infrastructure de notifications.

## 7. Sécurité, RLS et permissions

| Surface | Lecture directe `authenticated` | Écriture directe | Fonction contrôlée |
|---|---|---|---|
| `profiles` | Inchangée : propriétaire uniquement. | Inchangée. | Recherche / noms liés via fonction bornée retournant seulement UUID + pseudo. |
| `friend_requests` | Policy `requester_id = auth.uid() OR recipient_id = auth.uid()` ; `SELECT` seulement. | Aucun `INSERT/UPDATE/DELETE` accordé. | Transitions RPC avec acteur déduit de `auth.uid()`. |
| `friendships` | Policy `user_low = auth.uid() OR user_high = auth.uid()` ; `SELECT` seulement. | Aucun. | Insertion/suppression canonique RPC. |
| `game_invitations` | Policy `inviter_id = auth.uid() OR invitee_id = auth.uid()` ; `SELECT` seulement. | Aucun. | RPC valident room, siège, amitié et rôle. |
| `social_rate_limits` | Aucun accès client. | Aucun. | Incrément atomique interne seulement. |

Pour chaque table sociale : `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL FROM anon, authenticated`, puis `GRANT SELECT TO authenticated` uniquement où indiqué ; `service_role` reste strictement serveur. Aucun `USING (true)` sur `profiles`. Les fonctions privées sont `SECURITY DEFINER SET search_path = ''`, avec noms qualifiés, vérification d'acteur, `REVOKE EXECUTE FROM PUBLIC, anon` et `GRANT` minimal ; les wrappers RPC publics restent `SECURITY INVOKER`. Examiner les privilèges par défaut du schéma lors de la migration. Les droits directs SELECT ne doivent jamais suffire à lire le profil d'un tiers.

Les vérifications applicatives ne remplacent ni les contraintes DB, ni les politiques. Chaque mutation verrouille la ligne concernée (`FOR UPDATE`) et vérifie l'état courant dans la même transaction ; les index uniques tranchent les courses restantes. Pour inviter, le contrôle sur `rooms` et `room_players` est interne à la fonction : l'UUID d'une room seul ne vaut pas permission. Une réponse ne contient ni email, ni données Auth, ni historique de tiers, ni main ni `GameState`. Des comptes/rooms non visibles doivent produire une erreur générique.

La sécurité des RPC, de RLS et des publications devra être testée avec de **vrais JWT de rôles distincts**, pas seulement avec `service_role` qui contourne RLS. La [documentation Supabase sur les fonctions](https://supabase.com/docs/guides/database/functions) recommande de fixer le `search_path` et de limiter `EXECUTE` ; sa [documentation RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) rappelle que grants **et** policies sont nécessaires.

## 8. Cas limites et décisions attendues

| Cas | Résultat |
|---|---|
| A demande B, puis B recherche A | Résultat « Demande reçue » avec **Accepter/Refuser**. Une demande B→A est refusée par l'index pending canonique. |
| Demande identique répétée, A↔B simultanées | Une seule pending par paire ; retour idempotent à l'expéditeur initial ou 409 « demande reçue » pour l'autre sens. |
| Déjà amis | Pas de nouvelle demande ; « Déjà ami ». Un accept concurrent crée une seule ligne `friendships`. |
| Refus puis nouvel envoi | Autorisé après 24 h vers cette personne et sous quota global ; la demande résolue reste non active. |
| Suppression d'ami / compte supprimé | Relation et invitations pending entre eux retirées/annulées ; cascade sur suppression de compte. Un ancien lien devient indisponible. |
| Deux décisions accept/refuse concurrentes | Première transaction gagne ; seconde relit et obtient état déjà résolu/409, sans amitié incohérente. |
| Deux invitations vers même room/invité | Une seule pending grâce à l'index unique. Si A a invité B, la tentative de C dans la même room renvoie uniquement `already_invited` / « Ce joueur est déjà invité à cette table » : aucun objet, ID ou identité de A n'est divulgué à C. Seuls A et B peuvent lire l'invitation complète. |
| Room supprimée, terminée, annulée ou invitation expirée | Invitation indisponible ; statut effectif `expired` si la ligne existe, aucun accès via l'invitation. Suppression physique de la room cascade la ligne ; une vue déjà ouverte affiche alors « Invitation indisponible ». |
| Room déjà démarrée | Même décision : `expired`. L'invitation ne permet pas de rejoindre une partie en cours. |
| Room pleine / derniers sièges pris par bots ou humains | `expired` au prochain contrôle ; aucune réservation. Si le conflit survient au `join-seat`, l'API room garde son 409 et l'invitation n'est pas acceptée. |
| Invité rejoint autrement | `resolve` constate son siège humain dans la room ; `accept` marque l'invitation acceptée sans déplacer le joueur. |
| Invitation ouverte dans deux onglets | Transition atomique et idempotente ; les deux vues refetchent. Aucun second siège grâce à l'unicité déjà existante dans `room_players`. |
| Reconnexion, événement Realtime tardif ou perdu | Refetch sur focus/reconnexion et après mutation ; l'état serveur prévaut sur le badge local. |
| Pseudo modifié après amitié/invitation | Les listes montrent le pseudo courant au prochain refetch ; les identités restent les UUID, jamais le texte du pseudo. |

## 9. Stratégie de tests

1. **DB/migration/RLS.** Sur base Supabase de test reconstruite par migrations : contraintes `CHECK`, FK/cascades, unicité canonique, index pending, timestamps, rôles `anon/authenticated/service_role`, direct SELECT participant vs tiers, absence de write direct et absence de lecture publique de `profiles`. Tests de courses A↔B, accept/refuse, invitations simultanées et room qui démarre pendant l'envoi. Vérifier le quota atomique et les retours 429.
2. **Fonctions/helpers.** Validation de préfixe et échappement LIKE, normalisation, tri/limite, mapping d'erreurs et états effectifs d'expiration. Tests unitaires pour l'intégration du helper `socialApi` et le badge, sans recopier les politiques SQL en mocks.
3. **API.** JWT manquant/expiré, acteur usurpé dans le corps, cible inexistante, tiers qui accepte/annule, non-ami qui invite, invitant non assis, room non-lobby ou pleine, idempotence et 409/429. S'assurer qu'aucune réponse ne contient `email`, `auth.users` ou `GameState`.
4. **UI responsive/accessibilité.** États vide/chargement/erreur ; recherche, actions directes, compteurs, drawer conditionnel, navigation clavier, lecteur d'écran et mobile/desktop dans les deux thèmes.
5. **E2E réel à quatre comptes dédiés.** `E2E_P1`, `E2E_P2`, `E2E_P3` et `E2E_P4` peuvent conserver des données sociales entre deux runs. Chaque run établit donc un état initial déterministe et nettoie uniquement les demandes entre les comptes E2E concernés, la friendship de fixture concernée et les invitations liées à **l'ID exact de sa room E2E** ; jamais de wildcard cleanup ni de suppression de données sociales d'autres utilisateurs. Le scénario doit rester relançable après une amitié ou invitation laissée par un run précédent. Puis A demande B → B accepte → chacun voit l'amitié → A crée une room → A invite B → B reçoit l'invitation → B clique Rejoindre → B prend un siège via `join-seat` → invitation acceptée. C et D ne lisent ni demande ni invitation ; aucune donnée privée supplémentaire n'est exposée. Ajouter les cas négatifs RLS, refus/annulation, doublon envoyé par un autre invitant, room devenue pleine, course de sièges et reconnexion/retard Realtime. Ne jamais enregistrer de mots de passe dans Git ni traces Playwright.

## 10. Découpage des futures PR

| PR | Livrable reviewable | Garde de validation |
|---|---|---|
| **A — schéma et sécurité** | Nouvelle migration : quatre tables, contraintes/index, RLS/grants, fonctions privées + wrappers RPC, quotas ; tests DB avec JWT de plusieurs utilisateurs. Audit de `is_username_taken` et compatibilité inscription. | Aucun SELECT global de `profiles`, aucune écriture sociale directe, migrations reproductibles. |
| **B — amis** | Routes/helpers `/api/social`, page `/friends`, recherche et demandes/amitiés ; tests API/UI. | Parcours demande → acceptation et tous les refus d'accès. |
| **C — invitations de room** | RPC/API d'invitation si elles ne tiennent pas raisonnablement dans A, dialogue lobby et liste reçue ; intégration stricte à `join-seat`. | Room invalide/pleine et courses vérifiées ; aucune nouvelle logique de siège. |
| **D — synchronisation légère** | Abonnements filtrés si validés, refetch de secours, badge drawer et compteurs. | Isolation des événements entre comptes, fallback après déconnexion ou perte de WebSocket. |
| **E — E2E et documentation** | Parcours réel à quatre comptes, matrice négative RLS et mise à jour de la documentation d'exploitation. | Typecheck, lint, Vitest, build, smoke et E2E social passent. |

Si A devient trop grande, séparer migration demandes/amitiés de migration invitations **sans** exposer une API avant ses règles DB ; éviter une PR monolithique. Chaque PR part d'un `main` à jour, porte ses propres tests et reste soumise à revue humaine et preview avant merge.
