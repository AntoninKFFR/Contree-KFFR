# KFFR Contrée — iOS / Expo Go

Première fondation native **iPhone** dans le dépôt Contrée. Référence de workflow : `ilonaplsr/BeThatGirl`.

## Compatibilité iPhone

Expo **SDK 54**, compatible avec l'Expo Go disponible sur l'App Store iPhone en octobre 2026. BeThatGirl utilise SDK 57, non compatible avec l'Expo Go du store iOS : seule sa **méthode** est reprise ici. Pas de compte Apple Developer nécessaire pour utiliser Expo Go.

Node.js 22 recommandé. Dans PowerShell ou un terminal (depuis la racine du dépôt) :

```sh
cd apps/mobile
npm install
npx expo install --fix
cp .env.example .env
# Sous PowerShell : Copy-Item .env.example .env
# Remplir uniquement URL et clé publique du même Supabase KFFR que le site.
npx expo start --clear
```

Ouvre **Expo Go** sur l'iPhone, puis scanne le QR code affiché. Le téléphone et l'ordinateur doivent communiquer sur le réseau local. Si le QR ne répond pas, lance `npm run tunnel` (une installation additionnelle du tunnel peut être demandée).

La commande `npm install` crée `apps/mobile/package-lock.json` : ce lockfile **doit être committé avant merge** pour des installations reproductibles. Les dépendances doivent être vérifiées par `npx expo install --check`.

## Données et authentification

- **Même projet Supabase** que Next.js : remplir `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` avec les paramètres publics du projet KFFR existant.
- **Mêmes comptes** `auth.users` et **mêmes pseudos** `public.profiles`, lus sous RLS.
- Phase A : connexion email/mot de passe, persistance de session et déconnexion. Pas de signup ou OAuth pour le moment.
- Les clés `service_role`, `secret` et les JWT utilisateurs ne doivent jamais apparaître dans des fichiers versionnés ou des logs.
- En développement, la session est persistée dans AsyncStorage, **non chiffré** : une version destinée à être distribuée devra introduire une persistance sécurisée. Éviter d'utiliser un compte administrateur sensible en Expo Go.

## Tests

```sh
npm run typecheck
npm run lint
npx expo install --check
npm run doctor
npm run export:ios
```

Vérifications manuelles indispensables : lancement Expo Go iOS, connexion d'un compte KFFR existant, lecture du pseudo, fermeture/réouverture Expo Go, déconnexion et mode avion/reprise. Ces tests ne sont **pas attestés** par la compilation.

## Périmètre

Aucune modification Next.js, des RPC, des migrations, des règles du jeu ou de la production. Table de jeu native, Solo/Multi, OAuth et navigation riche seront développés par lots dédiés. Le web reste intact.

Éviter de committer `apps/mobile/.env`, `node_modules`, `ios/` ou `android/`.
