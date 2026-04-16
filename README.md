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

## Structure

- `app/`: pages Next.js et styles globaux.
- `components/`: composants React simples pour afficher la table, la main et le score.
- `engine/`: logique pure du jeu, sans React.
- `bots/`: choix automatique des cartes des bots.
- `tests/`: tests unitaires du moteur.
- `RULES.md`: hypothèses de règles retenues pour cette V1.

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
