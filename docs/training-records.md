# Records des séries puzzle

La migration `20260926000000_training_records.sql` crée `training_series` et `training_records`. La lecture du compte passe par le client Supabase authentifié et la RLS propriétaire. Les écritures utilisent uniquement la route serveur `/api/training/series`, qui vérifie le JWT, régénère les dix exercices et recalcule le score avant l'appel à la fonction SQL atomique. Les records survivent à la purge des séries anciennes.

Seuls les six axes puzzle standard sont persistés. La progression et les déblocages restent locaux. Aucune ancienne série locale n'est transférée lors d'une connexion. « Compter son tas », Survie, Blitz et l'entraînement en partie ne passent pas par cette route.

Pour vérifier la migration sur une base **locale jetable** : démarrer Supabase, exécuter `supabase db reset --local`, exporter les clés locales de `supabase status -o env` sous les noms `TRAINING_TEST_SUPABASE_URL`, `TRAINING_TEST_SUPABASE_ANON_KEY`, `TRAINING_TEST_SUPABASE_SERVICE_ROLE_KEY`, puis lancer `npm run test:db:training`. Le script refuse toute URL non locale, crée deux comptes Auth temporaires, teste les JWT, la RLS, les écritures et le quota, puis supprime ces comptes. Le workflow `training-db.yml` exécute ce parcours en CI ; les workflows social et rating se relancent aussi lorsqu'une migration change.
