# KFFR Contrée

KFFR Contrée est une application web de Coinche / Contrée à quatre joueurs. Elle propose un mode Solo contre trois bots, des parties multijoueurs autoritaires côté serveur, des règles versionnées, des bots avancés et un historique avec statistiques détaillées.

## Fonctionnalités actuelles

- Solo contre trois bots et multijoueur à quatre sièges.
- Création et accès aux tables par code, ajout de bots, reprise d'un siège et reconnexion.
- Règles configurables et figées au démarrage de la partie.
- Contrats à la couleur, Sans Atout et Tout Atout.
- Coinche, Surcoinche, Capot et Générale lorsque le ruleset les autorise.
- Annonces et Belote selon les règles choisies.
- Historique des parties solo et multijoueurs.
- Statistiques détaillées par contrat, couleur, résultat et période.
- Authentification par email ou Google, avec pseudo de profil unique.
- Préférences locales pour le rythme, l'affichage, le son et l'accessibilité.
- Bot officiel `advanced_rules_v4` pour le Solo et le Multiplayer.

Le preset Contrée KFFR fournit les règles par défaut. Certaines options avancées, comme Sans Atout, Tout Atout, Générale ou les annonces, restent désactivées dans ce preset et peuvent être activées dans une partie personnalisée.

## Architecture

- `engine/` : moteur de jeu pur, indépendant de React et du réseau.
- `bots/` : profils, enchères, choix de cartes et traces de décision.
- `simulation/` : harnais de simulation et mesures hors ligne.
- `lib/server/` : autorité multijoueur, validation des actions et persistance.
- `app/` : routes et écrans Next.js.
- `components/` : composants React partagés.
- `supabase/migrations/` : schéma Supabase entièrement versionné.

Le serveur conserve l'état multijoueur complet et n'envoie à chaque navigateur qu'une `PlayerGameView` filtrée. Les secrets Supabase restent dans les routes serveur. Toute évolution du schéma passe par une nouvelle migration suivie dans Git.

## Bot officiel

`bots/profiles.ts` définit `OFFICIAL_BOT_PROFILE_ID = "advanced_rules_v4"`. `bots/simpleBot.ts` constitue le point d'entrée commun utilisé par le Solo et le Multiplayer.

La stratégie V3.1 reste enregistrée comme solution de repli et comme référence historique des benchmarks. Les détails des doctrines, des profils et de leur validation sont dans [BOT_STRATEGY.md](BOT_STRATEGY.md).

## Installation locale

Prérequis : Node.js 22 et npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Renseigne dans `.env.local` les variables clientes Supabase indiquées par `.env.example` ainsi que `SUPABASE_SECRET_KEY` pour les opérations serveur. Le fallback historique `SUPABASE_SERVICE_ROLE_KEY` reste accepté. `.env.local` est ignoré par Git : aucun secret ne doit être ajouté au dépôt ou à un commit.

L'application est ensuite disponible à l'adresse affichée par Next.js, généralement `http://localhost:3000`.

## Validation

Avant une livraison :

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e:smoke
```

Les benchmarks de bots sont des commandes séparées dans `scripts/`. Ils ne font pas partie de la suite Vitest ni du smoke test.

## Supabase et migrations

Le schéma partagé ne doit jamais être modifié manuellement. Ajoute chaque changement dans un nouveau fichier de `supabase/migrations/`, puis applique et vérifie les migrations sur le projet lié :

```bash
supabase db push
supabase migration list
```

## Documentation utile

- [Règles du preset par défaut](RULES.md)
- [Stratégie des bots](BOT_STRATEGY.md)
- [Parties personnalisées](docs/CUSTOM_GAMES.md)
- [Préférences joueur](docs/PLAYER_PREFERENCES.md)
- [Tests end-to-end](docs/E2E_TESTING.md)
- [Matrice de qualité](docs/QA_MATRIX.md)
- [Socle produit](docs/PRD-socle.md)
- [Guide de contribution](CONTRIBUTING.md)
