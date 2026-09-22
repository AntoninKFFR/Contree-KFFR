# Exploitation Elo V1

## Flux normal

La fin autoritaire clôt et archive la partie, puis crée atomiquement un `rating_match` en état `pending`. Après ce commit, `apply_rating_match(source_game_id)` applique l'Elo dans une transaction distincte et passe le match à `applied`. Une erreur de calcul laisse la partie terminée et le match `pending` ; les joueurs peuvent voir temporairement leur ancien Elo.

## Vérifier et reprendre les pending

Le script opérateur existant cible uniquement l'hôte Supabase indiqué explicitement et traite au plus 100 matchs par appel. Sur une machine opérateur approuvée, fournir `RATING_RETRY_SUPABASE_URL` et `RATING_RETRY_SERVICE_ROLE_KEY` par un gestionnaire de secrets. Ne jamais les committer, copier dans un ticket ou afficher dans les logs.

Dry run, sans application :

```sh
npm run rating:retry -- --allow-host=<hostname> --limit=20
```

Le script affiche le nombre de pending sélectionnés et leurs `source_game_id`. Vérifier l'hôte, les identifiants de parties et les logs de fin/application. Une fois la cible validée, appliquer un lot borné :

```sh
npm run rating:retry -- --allow-host=<hostname> --limit=20 --execute
```

Le script appelle la même RPC idempotente que le traitement normal. Refaire un dry run après exécution ; un match déjà `applied` ne doit jamais être recalculé. Si un match reste `pending`, relever son `source_game_id`, inspecter les logs et la cause de l'échec, puis retenter un lot borné après correction. Ne pas modifier manuellement `player_ratings` ou le ledger, ni rejouer artificiellement la partie.

## Suppression de compte

La suppression enlève `player_ratings` et l'entrée du classement. Les liens personnels dans les snapshots et le ledger deviennent anonymes, tandis que l'historique nécessaire aux autres joueurs reste intact. Un retry tardif ne doit pas recréer le rating du compte supprimé. Les matchs déjà `applied` ne sont pas recalculés.

## Validation en environnement de test

`npm run test:db:rating` couvre localement la sécurité, le rollback, le retry, l'idempotence et la concurrence. `npm run test:e2e:rating` joue de vraies parties avec des comptes E2E dédiés : il modifie leur Elo de façon permanente et peut rendre leurs pseudos visibles après cinq parties. Exécuter cette suite uniquement sur un environnement de test ou staging approuvé ; la CI publique ne la lance pas.
