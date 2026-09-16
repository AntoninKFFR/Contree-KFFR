# Coinche / Contree V1

Application pédagogique en Next.js, TypeScript et Tailwind.

## Ce que contient la V1

- 1 joueur humain contre 3 bots
- Distribution de 32 cartes
- Tours de jeu
- Gestion des plis
- Score des cartes et bonus du dernier pli
- Annonces, coinche et surcoinche
- Partie complète en plusieurs manches
- Score total et historique des manches
- Moteur de jeu séparé de l'interface
- Tests unitaires sur les règles importantes
- Bot principal officiel `main` utilise par l'application web
- Profils secondaires disponibles pour les simulations

## Structure

- `app/`: pages Next.js et styles globaux.
- `components/`: composants React simples pour afficher la table, la main et le score.
- `engine/`: logique pure du jeu, sans React.
- `bots/`: profils, annonces et choix automatique des cartes des bots.
- `simulation/`: lancement de parties automatiques entre bots et statistiques.
- `scripts/`: commandes terminal, dont la simulation des bots.
- `tests/`: tests unitaires du moteur.
- `RULES.md`: hypothèses de règles retenues pour cette V1.
- `BOT_STRATEGY.md`: explication simple de la strategie des bots.
- `TRAINING.md`: explication simple pour lancer et lire les simulations.

## Lancer le projet

Installe d'abord Node.js si la commande `node --version` ne fonctionne pas.

Puis lance:

```bash
npm install
npm run dev
```

Ouvre ensuite l'adresse indiquée par Next.js, généralement `http://localhost:3000`.

## Backend multijoueur

Le multijoueur est server-authoritative. Copie `.env.example` vers `.env.local`, renseigne les
identifiants Supabase, puis applique les migrations versionnées du dossier `supabase/migrations`.
La clé serveur `SUPABASE_SECRET_KEY` est privilégiée par les Route Handlers Next.js, avec
`SUPABASE_SERVICE_ROLE_KEY` comme fallback de compatibilité. Ces clés restent côté serveur et ne
doivent jamais être préfixées par `NEXT_PUBLIC_`.

Le `GameState` complet est stocké dans `room_game_states`, une table sans permission ni policy
pour `anon` ou `authenticated`. Le navigateur reçoit uniquement sa `PlayerGameView`; Realtime ne
sert qu'à déclencher une nouvelle lecture authentifiée auprès de l'API Next.js.

### Identité des comptes

La migration `20260916000000_account_profile_identity.sql` conserve les profils existants, garantit
l'unicité et la validation de `profiles.username`, limite la lecture et l'écriture du profil à son
propriétaire via RLS, puis crée le profil lors de l'inscription à partir des métadonnées Auth.
Un compte ancien sans pseudo peut le renseigner une fois dans `/profile`. Le pseudo du profil est
la seule identité utilisée par le serveur lors de la création ou de la prise d'un siège en lobby ;
les noms déjà enregistrés dans une partie restent des snapshots. Après déploiement de la migration,
autorise `/auth/callback` dans les URL de redirection Supabase pour la confirmation par email.

Pour appliquer et vérifier cette migration sur le projet Supabase lié :

```bash
supabase db push
supabase migration list
```

## Préférences joueur

Les réglages de confort sont locaux à chaque navigateur et restent séparés des règles partagées de
la partie. Leur architecture, leur stockage et leurs garanties d'isolation sont décrits dans
[`docs/PLAYER_PREFERENCES.md`](docs/PLAYER_PREFERENCES.md).

## Lancer les tests

```bash
npm test
```

Pour relancer les tests automatiquement pendant que tu modifies le moteur:

```bash
npm run test:watch
```

## Simuler des bots

Pour comparer les profils de bots sans ouvrir l'interface web:

```bash
npm run simulate:bots -- --games=1000 --team0=main --team1=aggressive
```

Profils disponibles:

- `main`
- `prudent`
- `balanced`
- `aggressive`

L'application web utilise toujours `main`. Les autres profils servent au simulateur et au benchmarking. Lis `TRAINING.md` pour comprendre les statistiques affichees.
