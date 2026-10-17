# KFFR Contrée — iPhone / Expo Go

Socle natif autonome dans apps/mobile : connexion email/mot de passe aux comptes
KFFR existants, lecture du vrai pseudo, reprise de session et déconnexion.

## Versions et méthode

Expo SDK **54** (React Native 0.81.5, React 19.1.0, Expo Router 6, TypeScript 5.9).
La [documentation officielle Expo](https://docs.expo.dev/get-started/create-a-project/)
consultée le 17 octobre 2026 recommande SDK 54 pour Expo Go sur appareil physique
pendant la transition SDK 57. Aucun compte Apple Developer requis pour ce test.
La disponibilité du store évolue : revérifier cette page si Expo Go refuse le SDK.

[BeThatGirl](https://github.com/ilonaplsr/BeThatGirl) sert de référence pour
Expo Router (src/app), TypeScript strict, alias @/* vers src/*, lint et commandes
de validation. Ses dépendances SDK 57 / React Native 0.86 / React 19.2 ne sont
pas reprises. React DOM est explicitement aligné sur React 19.1 pour les peers
d'Expo Router, même si ce prototype cible uniquement iOS.

Utiliser **Node.js 22 LTS** (22.13 minimum), npm et PowerShell sous Windows.
Les deux projets ont leur propre package.json, package-lock.json, node_modules,
TypeScript et ESLint. Aucun workspace npm ni installation racine n'est nécessaire
pour Expo. Le typecheck et le lint Next.js excluent apps/mobile ; le build web
ne dépend pas d'Expo. Les alias des deux projets restent indépendants.

## Démarrer depuis Windows

1. Installer les dépendances depuis la racine du dépôt :

   ~~~powershell
   cd apps/mobile
   npm ci
   Copy-Item .env.example .env
   ~~~

2. Éditer **localement** apps/mobile/.env avec les deux paramètres publics du
   **projet Supabase KFFR existant**, identiques à ceux du web :
   EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
   L'URL doit commencer par https:// et la clé par sb_publishable_. Les valeurs
   factices de .env.example ne permettent pas la connexion. Ne pas créer de
   deuxième projet Supabase, de nouveaux comptes ou de migrations.

3. Démarrer Metro :

   ~~~powershell
   npx expo start --clear
   ~~~

4. Installer Expo Go sur l'iPhone. Si Expo demande une connexion, utiliser le
   même compte Expo dans Expo Go et sur l'ordinateur (npx expo login). Le compte
   Expo sert au développement ; le compte KFFR sert à la connexion dans l'app.

5. Placer Windows et l'iPhone sur le même réseau Wi-Fi. Scanner le QR code avec
   l'appareil photo iPhone et ouvrir dans Expo Go. Autoriser le réseau local sur
   iPhone et l'accès réseau privé pour Node dans le pare-feu Windows si demandé.
   Si le réseau bloque le LAN, npm run tunnel propose le mode tunnel (son outil
   additionnel peut demander une installation). Redémarrer Metro après tout
   changement du .env.

6. Se connecter avec l'email et le mot de passe d'un **compte de test KFFR existant**.
   Vérifier que le pseudo affiché correspond à celui du site.

7. Fermer complètement Expo Go, le rouvrir et rouvrir le projet. Vérifier la
   reprise de session, puis se déconnecter et vérifier l'écran de connexion.

Ne jamais publier une clé privée, un mot de passe, un JWT ou le fichier .env.
Les variables EXPO_PUBLIC_ sont lisibles dans le bundle : elles contiennent
uniquement des paramètres publics. Le client refuse les clés sans préfixe
publishable ; cela ne remplace pas la vérification des variables avant export.

## Authentification et limites

- Projet, auth.users et public.profiles partagés avec le site ; SELECT du seul
  username, filtré sur l'identité vérifiée. Aucun profil créé ou modifié.
  Les politiques RLS existantes restent l'autorité serveur.
- [Configuration React Native Supabase](https://supabase.com/docs/guides/auth/quickstarts/react-native) :
  polyfill URL, AsyncStorage, persistSession, autoRefreshToken,
  detectSessionInUrl: false. Le SDK Supabase est épinglé en 2.118.0 et verrouillé ;
  sa coordination intégrée remplace l'option processLock désormais dépréciée
  ([migration officielle](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md)).
- Le profil n'est affiché qu'après validation Auth par getUser et lecture sous
  RLS. Sans réseau au démarrage/retour au premier plan, le profil reste masqué
  et un bouton permet de réessayer. Aucun mode profil privé hors ligne.
- Au passage en arrière-plan, les lectures en cours deviennent obsolètes,
  le profil est masqué et le rafraîchissement automatique s'arrête. Au retour,
  il redémarre et la session est relue/vérifiée. Les callbacks Auth restent
  synchrones ; les lectures sont différées hors des événements Auth.
- Une réponse d'un ancien compte, d'avant déconnexion ou d'un écran démonté
  ne peut pas repeupler l'interface. Les requêtes HTTP ont un délai de 15 s par
  tentative ; les éventuelles nouvelles tentatives internes du SDK s'y ajoutent.
- Déconnexion scope local : concerne cette session mobile, sans déconnecter le
  navigateur. Le profil est masqué immédiatement. En cas d'échec réseau, l'app
  indique une déconnexion incomplète et demande de réessayer ; la suppression
  persistante n'est pas annoncée comme acquise. Le SDK tente d'effacer la session
  locale même si la révocation réseau échoue ; une erreur du stockage peut
  toutefois empêcher cet effacement. Les JWT émis restent valables jusqu'à leur
  expiration selon le fonctionnement Supabase ; la révocation distante n'est
  pas confirmée en cas d'erreur réseau.
- **AsyncStorage n'est pas chiffré.** Il contient les jetons de session, jamais
  le mot de passe. Le masquage du profil ne sécurise pas les données sur disque.
  Utiliser un compte de test sans privilèges. Avant distribution publique :
  conception et validation d'un stockage sécurisé, revue des appareils compromis,
  sauvegardes et révocation. Ce prototype ne constitue pas une validation sécurité
  pour une distribution App Store.

## Contrôles reproductibles

~~~powershell
npm ci
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo-doctor
npm run export:ios
~~~

Le lockfile mobile est versionné : npm ci fonctionne indépendamment de la racine.
Pour une mise à jour volontaire des dépendances SDK 54, utiliser npx expo install
--fix, puis relancer les contrôles et committer package.json et package-lock.json.
Expo Doctor est aussi épinglé en devDependency. La CI Expo iOS foundation exécute
ces contrôles dans apps/mobile, avec des paramètres factices sans accès aux données.
L'export produit dist/ (ignoré) : c'est un bundle JavaScript/assets, pas un .ipa.

L'audit npm du 17 octobre 2026 signale encore 40 vulnérabilités transitives
(16 modérées, 24 élevées), notamment dans l'outillage Expo/Metro/React Native.
Une tentative de correction npm sans changement majeur ne les élimine pas.
Les correctifs proposés imposent notamment d'autres versions majeures Expo/RN ;
ne pas lancer npm audit fix --force au détriment du SDK 54 requis par Expo Go.
Cette dette doit être réévaluée avec le SDK avant une distribution publique.

## Validation physique iPhone à réaliser

- Ouverture depuis QR, rendu, safe areas, clavier et bouton de connexion accessibles.
- Mauvais identifiants, champs vides, puis connexion valide et pseudo identique au web.
- Fermeture forcée et réouverture : session persistée et pseudo vérifié avec réseau.
- Arrière-plan prolongé, expiration/renouvellement du jeton, retour au premier plan.
- Mode avion au démarrage, à la connexion, au chargement du profil et à la
  déconnexion ; reprise réseau et boutons de nouvelle tentative.
- Déconnexion pendant une lecture lente : aucun pseudo tardif ; après réussite,
  fermeture/réouverture sans reconnexion automatique.
- Compte A puis compte B : aucun pseudo du compte précédent.

Les tests automatisés couvrent les courses asynchrones et erreurs avec un client
simulé, ainsi qu'un cycle connexion/persistance/restauration/profil/déconnexion
avec le véritable SDK Supabase et un transport/stockage de test. Ils ne prouvent
pas une connexion réelle à KFFR ni le stockage AsyncStorage sur iOS.
**Ni Expo Doctor ni l'export iOS ne valident le fonctionnement sur un iPhone réel.**
OAuth, création de compte, deep links, Solo/Multi natifs et distribution App Store
restent hors périmètre. Le serveur, les règles, les données et la compatibilité
future web/iOS ne sont pas modifiés par ce socle.
