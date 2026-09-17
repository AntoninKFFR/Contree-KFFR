# Guide de contribution — Contrée KFFR

Ce document décrit **comment on travaille à deux** sur ce projet. Il s'adresse
aux deux développeurs **et à leurs agents de code** (Claude Code, Cursor, etc.).
Objectif : que tout le monde pousse dans la même direction, sans casser `main`
ni le site en ligne.

> **Règle d'or : personne ne pousse directement sur `main`.**
> Tout passe par une branche + une Pull Request.

---

## 1. Le modèle : trois lieux distincts

| Lieu | Où | Rôle |
|---|---|---|
| **Local** | ton PC | Là où on écrit le code et où on peut le lancer (`npm run dev` → `http://localhost:3000`) |
| **GitHub** | cloud | Le dépôt central partagé, la référence commune (`AntoninKFFR/Contree-KFFR`) |
| **Vercel** | cloud | Déploie le code : une **preview** par branche/PR, et la **production** depuis `main` |

Flux : `local → git push (sur une branche) → Pull Request → Vercel preview → test → merge dans main → Vercel production`

---

## 2. Le workflow au quotidien

### a. Partir d'un `main` à jour
```bash
git checkout main
git pull
```

### b. Créer une branche dédiée à la fonctionnalité
```bash
git checkout -b feat/nom-court-de-la-fonctionnalite
```
Convention de nommage :
- `feat/...` : nouvelle fonctionnalité
- `fix/...` : correction de bug
- `chore/...` : technique (déps, config, refacto sans changement visible)

### c. Développer et commiter régulièrement
```bash
git add -A
git commit -m "feat: description courte du changement"
git push -u origin feat/nom-court-de-la-fonctionnalite
```

### d. Ouvrir une Pull Request vers `main`
- Sur GitHub, ouvrir une PR de ta branche vers `main`.
- Deux choses se déclenchent automatiquement :
  - **La CI** (GitHub Actions) : build + tests e2e smoke.
  - **Vercel** : un **déploiement de preview** avec une URL dédiée à cette PR.

### e. Test collectif
- Chacun peut tester la fonctionnalité sur l'**URL de preview Vercel** (pas la prod).
- L'autre développeur relit le code de la PR.
- On ne merge que si : ✅ CI verte, ✅ preview testée, ✅ relecture OK.

### f. Merge et nettoyage
- Merge de la PR dans `main` (le merge déclenche le déploiement en **production**).
- Puis en local :
```bash
git checkout main
git pull
git branch -d feat/nom-court-de-la-fonctionnalite
```

---

## 3. Base de données Supabase (point critique à deux)

On partage **un seul projet Supabase** (offre gratuite : `contree-kffr`). La base
est donc **commune** aux deux développeurs.

**Règle absolue : ne jamais modifier le schéma à la main dans l'interface Supabase.**

Tout changement de schéma (table, colonne, fonction SQL, policy RLS…) se fait via
un **nouveau fichier de migration** versionné :

```
supabase/migrations/AAAAMMJJHHMMSS_description.sql
```

- Le fichier est **commité avec la fonctionnalité** dans la même PR.
- Il sert de trace reproductible et garde les deux environnements synchronisés.
- Application / vérification via la CLI Supabase :
```bash
supabase db push
supabase migration list
```

> Comme la base est partagée, un changement destructeur impacte l'autre.
> En cas de doute sur une migration risquée, se concerter avant de l'appliquer.

---

## 4. Secrets et variables d'environnement

- Les clés vivent **uniquement** dans `.env.local` (ignoré par git — ne jamais le commiter).
- Modèle des variables attendues : voir `.env.example`.
- `SUPABASE_SECRET_KEY` est **secrète** : côté serveur uniquement, **jamais** préfixée par `NEXT_PUBLIC_`, jamais dans le code, jamais dans une PR.
- Les mêmes valeurs Supabase sont partagées entre les deux développeurs (même projet), transmises par un canal privé.
- Sur Vercel, ces variables sont configurées dans les réglages du projet (Environment Variables), pas dans le repo.
- En cas de fuite d'une clé : la régénérer dans Supabase (Settings → API), puis mettre à jour `.env.local` et Vercel.

---

## 5. Vérifications avant d'ouvrir une PR

Lancer en local avant de pousser :
```bash
npm run typecheck   # types TypeScript
npm run lint        # règles ESLint
npm test            # tests unitaires (Vitest)
```
La CI relance de son côté le build et les tests e2e smoke sur chaque PR.

---

## 6. Contraintes des offres gratuites (Vercel / Supabase)

- **Vercel (Hobby)** : les preview deployments par branche/PR sont inclus. Usage non commercial. Vérifier une fois dans les réglages du projet que les previews sont activés (défaut).
- **Supabase (Free)** : un projet partagé, quotas limités. Le projet peut se mettre en pause après une période d'inactivité — il suffit de le réactiver depuis le dashboard.

---

## 7. Résumé pour un agent de code

Quand tu travailles sur ce repo :
1. **Ne jamais commiter directement sur `main`.** Toujours créer une branche `feat/…`, `fix/…` ou `chore/…`.
2. Tout changement de schéma DB = un nouveau fichier dans `supabase/migrations/`, jamais de modif manuelle Supabase.
3. Ne jamais écrire de secret en dur ni exposer une clé serveur via `NEXT_PUBLIC_`.
4. Avant de proposer un push : `npm run typecheck`, `npm run lint`, `npm test`.
5. Livrer le travail via une Pull Request vers `main`, testable sur la preview Vercel.
