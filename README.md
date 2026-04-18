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
