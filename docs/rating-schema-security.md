# PR A — fondations Elo V1

La migration `20260921010000_rating_schema_security.sql` crée les fondations Elo sans brancher le démarrage, la fin ou l'abandon des parties. Aucun worker, RPC de lecture, leaderboard ou écran n'est ajouté.

## Schéma

- `player_ratings` : une cote active par compte, 1 000 au premier insert, compteurs cohérents et pic au moins égal à la cote. Sa FK `auth.users ON DELETE CASCADE` supprime la cote avec le compte.
- `rating_start_snapshots` et `rating_start_snapshot_participants` : métadonnées et quatre sièges figés à terme au passage `lobby → playing`. La structure existe seulement dans cette PR. Un compte supprimé met son `user_id` de siège à `NULL`, sans effacer le match.
- `rating_matches` et `rating_match_participants` : ledger futur, un `source_game_id` unique par partie archivée et une clé `(match_id, seat_index)`. Statuts `pending`, `applied`, `void`. La FK vers `multiplayer_games` exige une archive pour créer le `pending` dans la future PR B. Les identités de participants sont dissociées par `ON DELETE SET NULL` ; aucun email ou pseudo n'est stocké dans les tables Elo.

Les contrôles de cohérence des champs, sièges et équipes sont en base. Les quatre sièges et la fidélité du snapshot au résultat autoritaire devront être vérifiés par les fonctions transactionnelles de la PR B avant `applied` ; ces fonctions ne sont pas créées ici. Le `rating >= 0` demandé est une contrainte DB. La formule pure n'impose aucun plancher de delta : la PR B devra définir un traitement explicite si un delta calculé ferait passer une cote sous zéro, sans réécrire l'histoire ni bloquer la clôture de partie.

## Sécurité et calcul

Les cinq tables activent RLS, révoquent tout accès `PUBLIC`, `anon` et `authenticated`, et accordent l'accès direct seulement à `service_role`. Aucune policy de lecture n'est ajoutée. `profiles` et ses policies ne sont pas modifiés. Les futurs accès publics passeront par des RPC bornées distinctes ; aucun helper `SECURITY DEFINER` n'est nécessaire pour cette PR de fondation.

`lib/rating/formulaV1.ts` contient K, fiabilité, force d'équipe, probabilité, delta, arrondi symétrique, transfert de forfeit et seuils de rang. `lib/server/botRatings.ts` est le registre serveur versionné : profil officiel `advanced_rules_v4`, version de calibration V1, cote 1 000 ; fallback central V1 à 1 000 pour un profil sans calibration. Le bot et sa version sont figés dans les futures lignes de snapshot ; modifier le registre ne changera pas les anciens matches.

## Vérification locale

Employer uniquement une instance Supabase locale jetable avec Docker ou Podman :

1. `supabase start`, puis `supabase db reset --local`.
2. Affecter les trois valeurs locales `RATING_TEST_SUPABASE_URL`, `RATING_TEST_SUPABASE_ANON_KEY`, `RATING_TEST_SUPABASE_SERVICE_ROLE_KEY` à partir de `supabase status -o env`, sans les inscrire dans Git.
3. `npm run test:db:rating`.

Le script refuse les URL hors `localhost`, `127.0.0.1` ou `::1`. Il crée deux comptes Auth locaux, utilise leurs vrais JWT pour les tests de droits, prépare les fixtures sous `service_role`, vérifie contraintes et anonymisation à la suppression, puis lance les tests Vitest de formule et de rang. Il retire uniquement ses propres fixtures. Le workflow `rating-db.yml` répète cette vérification sur une Supabase locale jetable en CI, indépendamment du smoke public.
