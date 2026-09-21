# PR A — schéma et sécurité sociale

La migration `20260921000000_social_schema_security.sql` crée les quatre tables sociales, leurs contraintes, leurs politiques RLS, les fonctions privilégiées `private` et les RPC publiques. Les RPC publiques utilisent le JWT `authenticated` ; aucune route, page, bouton ou publication Realtime sociale n'est ajoutée dans cette PR.

Les quotas SQL lèvent `PT429` pour que PostgREST réponde directement en HTTP 429, y compris quand la RPC est appelée hors des futures routes Next.

## Vérifier sur une base locale jetable

Une installation Supabase locale avec Docker ou Podman est nécessaire. Ne pas employer le projet Supabase partagé pour ces tests.

1. `supabase start`, puis `supabase db reset` pour reconstruire la base locale à partir des migrations.
2. Récupérer les clés **locales** avec `supabase status -o env` et affecter `SOCIAL_TEST_SUPABASE_URL`, `SOCIAL_TEST_SUPABASE_ANON_KEY` et `SOCIAL_TEST_SUPABASE_SERVICE_ROLE_KEY` dans le terminal, sans les écrire dans Git.
3. Exécuter `npm run test:db:social`.

Le script refuse une URL qui ne cible pas `localhost`, `127.0.0.1` ou `::1`. Il crée des comptes Auth temporaires distincts, se connecte avec leurs JWT, teste RLS et les RPC sous ces identités, puis supprime uniquement ses comptes et rooms de fixture. Les mutations d'administration servent exclusivement à préparer les fixtures et à tester les contraintes directement. `npm test` couvre les tests Vitest ordinaires ; il ne remplace pas ce test DB.

Le workflow `social-db.yml` reconstruit aussi une instance Supabase locale jetable dans GitHub Actions sur les PR touchant la migration ou ces tests. Il n'utilise aucune clé du projet partagé.

## Audit de `is_username_taken`

L'inscription existante appelle `public.is_username_taken(text)` avant `auth.signUp`, alors que l'utilisateur est encore `anon`. Révoquer `anon` ou exiger `auth.uid()` casserait ce parcours. La migration conserve donc la réponse exacte pour les pseudos valides et borne l'entrée à 40 caractères. Elle ne modifie pas la lecture propriétaire de `profiles` et n'expose pas d'autre colonne.

**Dette de sécurité restante :** un client anonyme peut tester des pseudos exacts valides de 1 à 40 caractères. Un quota fiable par visiteur ne peut pas être imposé dans cette RPC SQL sans identité ou signal réseau de confiance. Une future PR devra déplacer la vérification préinscription derrière une route serveur avec limitation par origine de requête et protection anti-abus adaptée, puis retirer `EXECUTE` à `anon` après des tests d'inscription. Les quotas de la nouvelle recherche authentifiée ne résolvent pas cette surface préexistante.

Les anciennes entrées `social_rate_limits` peuvent être purgées lors de la maintenance DB après leur fenêtre active. Aucune purge globale n'est exécutée par les RPC du chemin de requête.
