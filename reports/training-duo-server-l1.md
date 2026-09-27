# Entraînement duo — fondation serveur L1

Référence : [spécification réseau validée](../docs/training-duo-network-spec.md), issue #48. Ce lot n'ajoute aucune interface duo.

## Livré

- Migration `20260927000000_training_duo_server.sql` : sessions, participants, réponses privées et secrets séparés ; contraintes de phase et de versions V1 ; unicité des slots actifs et des réponses ; FK en cascade et trigger transactionnel de suppression de session lorsqu'un compte participant disparaît.
- RLS et privilèges : aucun accès `anon`, aucune écriture directe `authenticated`, aucune lecture directe des réponses ou du seed. `SELECT` et publication Realtime limités à `id,status,question_phase,current_index,state_version,updated_at` pour les sessions et `id,session_id,slot,is_ready,ready_for_next,last_seen_at` pour les participants. Les UUID des comptes, codes et corrections n'entrent pas dans ces événements.
- RPC service-role : création, adhésion atomique, expiration paresseuse, heartbeat sans incrément de version métier et mutations sous verrou de session avec CAS. L'API utilise le JWT Supabase pour l'identité, puis projette une vue HTTP propre au membre.
- `start` exige deux membres prêts et connectés ; le seed cryptographique reste serveur et la série `bid-reading` versionnée est générée avant le commit. Les réponses sont validées et notées côté serveur, immuables ; la deuxième révèle, les deux `ready-next` avancent ou terminent.
- Routes `POST /api/training/duo/sessions`, `POST /join`, `GET/POST /[sessionId]` et `POST /[sessionId]/presence`, toutes sans cache et sans acteur transmis dans le corps.

## Vérification et limites

Les tests Vitest dédiés couvrent validation, projections publiques/révélées, versions, notation, précondition de présence et routes. Le script `npm run test:db:training-duo` est destiné à un Supabase **local jetable** après migration ; il couvre JWT/RLS, payloads Realtime, accès direct, concurrence, dix questions, expiration, départs et suppression de compte dans les états lobby/actif/terminal. Il ne doit jamais être pointé vers une base distante ou de production.

Dans l'environnement de développement de cette PR, `supabase status` échoue car Docker/Podman n'est pas présent sur le PATH, et les trois variables `DUO_TEST_SUPABASE_*` ne sont pas fournies. Le script DB est donc écrit mais sa réussite réelle reste **non vérifiée** ici. La migration, les grants et les triggers doivent être exécutés et vérifiés dans un environnement Supabase local avant déploiement.

L2 reste responsable de l'UI, du formulaire et de la synchronisation navigateur ; L3 des E2E authentifiés complets, du rate limiting compte/IP, de l'observabilité et de la maintenance de purge après 24 h. Aucun enregistrement de partie, record d'entraînement, Elo ou invitation ami n'est créé par L1.
