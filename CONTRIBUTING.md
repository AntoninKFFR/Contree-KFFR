# Guide de contribution — Contrée KFFR

Ce document définit le workflow commun aux contributeurs humains et aux agents
de code. L'objectif est de garder des chantiers isolés, des Pull Requests petites
et un historique Git lisible.

> **Règle d'or : aucun push direct sur `main`.**
> Toute modification passe par une branche dédiée et une Pull Request.

## 1. Une issue = un chantier

- Chaque chantier correspond à une issue GitHub précise.
- Avant de commencer, lire son objectif, ses critères d'acceptation, ses
  dépendances et les fichiers ou références mentionnés.
- Vérifier qu'aucune autre issue, Pull Request ou branche active ne couvre déjà
  le même périmètre.
- Ne pas élargir le chantier en refonte plus générale sans décision humaine.
- Si deux chantiers risquent de modifier le même périmètre, arrêter le travail
  et signaler le conflit avant toute modification.

### Labels de délégation

- `good-for-agent` : un agent peut traiter l'issue de manière autonome lorsque
  le brief est suffisamment précis.
- `needs-human` : une décision humaine est requise. L'agent identifie la
  décision manquante et attend sa validation au lieu de faire une hypothèse.

## 2. Workflow du board

Les issues avancent dans cet ordre :

`Backlog` → `Ready` → `In progress` → `In review` → `Done`

- **Backlog** : chantier identifié, pas encore prêt à démarrer.
- **Ready** : périmètre, dépendances et décisions nécessaires sont suffisamment
  clairs.
- **In progress** : le chantier est pris et une branche dédiée est active.
- **In review** : la Pull Request est ouverte et attend une revue humaine.
- **Done** : la Pull Request a été relue et mergée par un humain.

## 3. Démarrer un chantier

Toujours repartir du `main` distant actuel :

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/nom-court
```

Utiliser une branche dédiée par issue. Les préfixes usuels sont :

- `feat/...` pour une fonctionnalité ;
- `fix/...` pour une correction ;
- `docs/...` pour la documentation ;
- `test/...` pour les tests ;
- `chore/...` pour la configuration ou la maintenance.

Ne jamais reprendre la branche d'un autre contributeur sans demande explicite.

## 4. Développer et valider

- Respecter strictement le périmètre de l'issue.
- Ne pas ajouter de fichiers locaux, de changements parasites ou de secrets.
- Effectuer les validations locales pertinentes avant la livraison, notamment
  le typecheck, le lint, les tests, le build et le smoke test lorsque le
  changement le justifie.
- Vérifier le diff final avant de commiter.

Exemple de validations pour un changement applicatif :

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e:smoke
git diff --check
```

Pour une modification limitée à la documentation ou à la configuration, lancer
les contrôles pertinents au périmètre et au minimum `git diff --check`.

## 5. Base de données Supabase

Tout changement de schéma ou de sécurité de la base doit passer par un nouveau
fichier versionné dans `supabase/migrations/` : table, colonne, fonction SQL,
trigger, contrainte, index ou policy RLS.

Ne jamais modifier le schéma manuellement dans l'interface Supabase. Une
migration risquée ou destructrice doit être discutée avant son application.

## 6. Secrets et variables d'environnement

- Ne jamais commiter de secret, de jeton, de mot de passe ou de clé privée.
- Les valeurs locales vivent dans `.env.local`, ignoré par Git.
- `.env.example` documente seulement les noms et valeurs factices attendus.
- Une clé serveur ne doit jamais être exposée avec le préfixe `NEXT_PUBLIC_`.
- Les variables des environnements déployés sont configurées hors du dépôt.

## 7. Livraison par Pull Request

Quand le chantier est prêt :

1. créer un commit lisible contenant uniquement les changements du chantier ;
2. pousser la branche dédiée ;
3. créer une Pull Request vers `main` et renseigner le template ;
4. arrêter immédiatement le travail après la création de la Pull Request.

Un agent ne merge jamais une Pull Request. Après sa création, il n'attend pas
GitHub Actions ou Vercel, ne surveille pas les checks distants et ne poursuit
pas le chantier. Les humains effectuent la revue, vérifient les résultats
distants et décident du merge.

Le merge dans `main` et le passage du board à `Done` sont des responsabilités
humaines.
