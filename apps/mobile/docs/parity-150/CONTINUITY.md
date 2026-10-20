# Compte, sauvegarde et reprise

Audit de source, sans écriture de production, le 20 octobre 2026.

La configuration publique de `apps/mobile/.env` a été comparée à celle du dépôt
web local principal : URL Supabase identique et clé publiable identique. Les
valeurs ne sont ni copiées dans ce rapport ni committées. L’authentification,
`auth.users`, `public.profiles` et les écrans Accueil/Profil restent inchangés.

Le client natif utilise le même backend HTTPS `contree-kffr.vercel.app`, les routes
`POST /api/solo/sessions`, `GET /api/solo/sessions/:id` et
`POST /api/solo/sessions/:id`, avec le JWT du compte vérifié. Le serveur dérive
l’identité avec `authenticatedUserId` ; un identifiant transmis n’accorde aucun
accès à une autre personne. Les mains adverses restent sur le serveur.

Les règles et les bots restent dans `lib/server/soloGame.ts`. Les mutations
envoient une intention et `expectedVersion`, jamais un état calculé par le client.
La création conserve un `startKey` durable et les règles associées à ce nonce :
un essai réseau ambigu ne crée pas un second jeu avec une autre configuration.
Le natif n’effectue aucun rejeu automatique de POST. Une reconnexion recharge
l’état serveur avant toute nouvelle action.

`lib/server/soloService.ts` et la migration existante
`20260930200000_progression_game_xp.sql` montrent que la validation terminale
appelle le même `commit_solo_game_session`. Celui-ci archive dans `public.games`
et crédite l’XP Solo dans la même transaction. Aucun calcul d’XP, score final,
historique ou Elo n’est ajouté au client. Le Solo ne devient pas un mode classé
Elo par cette PR. Le test de transport utilise le vrai moteur côté serveur simulé ;
il ne constitue pas un essai de la transaction SQL déployée. Aucune partie réelle,
ligne d’historique, progression ou donnée d’utilisateur n’a été modifiée pour ces tests.

## Limite interappareil confirmée

La sauvegarde existe sur le serveur, mais sa découverte reste locale : le web
stocke un UUID dans `kffr-solo-session:<userId>` et le natif dans
`kffr-native-solo:v1:<userId>`. Entrer dans Solo reprend automatiquement l’UUID
connu de cet appareil, après GET autorisé, comme le web. Aucun démarrage n’est
effectué sans une action volontaire.

Un iPhone vierge ne retrouve donc **pas automatiquement** une partie commencée
sur un autre navigateur. Les préférences de présentation sont elles aussi
locales, comme les préférences web. Cette PR ne prétend pas les synchroniser.

## Extension proposée — non implémentée, autorisation requise

Ajouter un `GET /api/solo/sessions?status=active&limit=20&cursor=…` à la route
existante, sans changer le POST :

1. Valider le JWT avec `authenticatedUserId`, puis filtrer systématiquement
   `solo_game_sessions.user_id` avec cet utilisateur côté serveur.
2. Retourner uniquement les résumés publics : `id`, `state_version`, `updated_at`,
   phase, manche et scores. Exclure les états complets et toutes les mains.
3. Pour `active`, filtrer `completed_at IS NULL`. Trier par `(updated_at, id)`
   décroissants ; valider une limite bornée et un curseur stable. Utiliser
   `Cache-Control: private, no-store`.
4. Laisser l’utilisateur choisir sa reprise, puis appeler le GET par UUID déjà
   protégé. Conserver le contrôle de version existant pour deux appareils ouverts.
5. Tester anonymat, deux propriétaires, curseurs, partie terminée et concurrence
   dans des fixtures et une base de test autorisée.

Le serveur possède déjà un accès `service_role` en lecture et un index unique
commençant par `user_id`. Aucun nouveau droit client, RPC ou changement RLS ne
serait nécessaire au fonctionnement de ce GET. Un index de tri supplémentaire
ne serait à proposer qu’après mesure du volume. Toute modification ou publication
backend, migration, RPC ou RLS attend une autorisation explicite et est exclue de
la correction actuelle.
