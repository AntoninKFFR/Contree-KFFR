# KFFR Contrée — iPhone / Expo Go

Interface native autonome dans apps/mobile : accueil KFFR, onglets Accueil et
Profil, connexion aux comptes existants, vrai pseudo, reprise de session et
déconnexion. Solo, Multijoueur et Entraînement sont explicitement indisponibles
sur iPhone : aucune carte ne lance une partie.

## Navigation et session partagée

- Expo Router sépare `login` de `(connected)` (Accueil et Profil). Les routes
  privées sont protégées ; une session supprimée retire aussi leur historique.
- Un seul `AccountProvider`, au-dessus du routeur, possède le contrôleur existant,
  l'abonnement Auth et l'écoute AppState. Changer d'onglet ne les recrée pas.
- Pendant la suspension, le renouvellement du jeton ou une nouvelle vérification,
  le contenu privé est masqué et l'onglet choisi est conservé. Un échec réseau
  propose une nouvelle tentative. Un changement de compte réinitialise la navigation.
- Le profil reste en lecture seule : aucun pseudo inventé si sa lecture échoue.
  Le bouton d'actualisation relit le profil vérifié. Déconnexion locale uniquement.
- Logo issu de `public/brand/kffr-logo-dark.png`, recadré et réduit pour le bundle
  natif ; aucune dépendance aux composants DOM du site.

## Versions et méthode

Expo SDK **57** (Expo 57.0.30, React Native 0.86.3, React 19.2.3,
Expo Router 57.0.28, TypeScript 6.0.3).
La [documentation officielle Expo](https://docs.expo.dev/get-started/create-a-project/)
consultée le 17 octobre 2026 recommande SDK 57 pour Expo Go sur appareil physique
pendant la transition SDK 58. Aucun compte Apple Developer requis pour ce test.
La disponibilité du store évolue : revérifier cette page si Expo Go refuse le SDK.

[BeThatGirl](https://github.com/ilonaplsr/BeThatGirl) sert de référence pour
Expo Router (src/app), TypeScript strict, alias @/* vers src/*, lint et commandes
de validation. Les versions SDK 57 ont été alignées sur le modèle officiel Expo
et validées dans la copie locale iPhone avant leur intégration ici. React DOM
est explicitement aligné sur React 19.2.3 pour les peers d'Expo Router, même si
ce prototype cible uniquement iOS. Les types Node, React et React Native sont
explicitement déclarés pour que TypeScript 6 contrôle aussi les tests Node.

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

4. Installer Expo Go sur l'iPhone et utiliser le même compte Expo dans Expo Go
   et sur l'ordinateur (npx expo login). Le compte
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
Pour une mise à jour volontaire des dépendances SDK 57, utiliser npx expo install
--fix, puis relancer les contrôles et committer package.json et package-lock.json.
Expo Doctor est aussi épinglé en devDependency. La CI Expo iOS foundation exécute
ces contrôles dans apps/mobile, avec des paramètres factices sans accès aux données.
L'export produit dist/ (ignoré) : c'est un bundle JavaScript/assets, pas un .ipa.

L'audit npm reste non vierge : **64 paquets signalés**
(15 modérés, 49 élevés), après ajout des outils de test natifs. Voir le
[suivi de sécurité](SECURITY.md) pour les avis, leur portée, les limites
des correctifs disponibles et les conditions avant distribution publique.
Les contrôles CI de compilation ne constituent pas un audit sécurité réussi.

## Validation physique iPhone confirmée

Le 17 octobre 2026, Antonin a confirmé sur iPhone réel, avec la copie locale
SDK 57 dont les sources applicatives et les tests sont identiques à cette PR :

- Connexion au même projet Supabase avec un compte KFFR existant.
- Récupération et affichage du vrai pseudo.
- Persistance de session après fermeture et réouverture de l'application.

Ces résultats sont rapportés par le testeur humain ; le modèle d'iPhone et la
version d'iOS n'ont pas été renseignés. Aucun identifiant ni jeton n'est conservé
dans le compte rendu.

## Validation physique iPhone à réaliser

- **L'accueil, les onglets et le profil de cette phase ne sont pas encore validés
  sur iPhone réel.** La validation humaine ci-dessus concerne seulement la fondation.
- Après connexion : vérifier les trois modes désactivés et leur mention « Bientôt
  disponible », ouvrir Profil via l'onglet et « Voir mon profil », revenir à Accueil.
- Tester petit écran, portrait/paysage, grande taille de texte et VoiceOver :
  texte lisible, défilement complet, onglets accessibles au-dessus de l'indicateur iOS.
- Depuis Profil : suspendre Expo Go puis revenir, vérifier que le même onglet est
  conservé et que le pseudo réapparaît après vérification ; mode avion puis Réessayer.
- Ouverture depuis QR, rendu, safe areas, clavier et bouton de connexion accessibles.
- Mauvais identifiants, champs vides, puis connexion valide et pseudo identique au web.
- Régression de la persistance déjà confirmée : fermeture forcée d’Expo Go,
  réouverture et pseudo vérifié avec réseau.
- Arrière-plan prolongé, expiration/renouvellement du jeton, retour au premier plan.
- Mode avion au démarrage, à la connexion, au chargement du profil et à la
  déconnexion ; reprise réseau et boutons de nouvelle tentative.
- Déconnexion pendant une lecture lente : aucun pseudo tardif ; après réussite,
  fermeture/réouverture sans reconnexion automatique.
- Compte A puis compte B : aucun pseudo du compte précédent.

`npm test` exécute les tests Node existants puis les tests Jest iOS avec le vrai
routeur Expo et les vrais écrans React Native (`expo-router/testing-library`,
Testing Library 13 requise par SDK 57, jest-expo 57). Ils couvrent accès anonyme,
connexion, modes désactivés, onglets/retour, abonnement unique et nettoyage,
suspension/renouvellement/réseau, compte remplacé, déconnexion et réponse obsolète.
Le transport Auth/profils est simulé uniquement dans les tests. Voir les guides
[Expo Router](https://docs.expo.dev/router/reference/testing/) et
[Jest Expo](https://docs.expo.dev/develop/unit-testing/).

Les tests automatisés couvrent aussi un cycle connexion/persistance/restauration/profil/déconnexion
avec le véritable SDK Supabase et un transport/stockage de test. Ils ne prouvent
pas une connexion réelle à KFFR ni le stockage AsyncStorage sur iOS.
**Ni Expo Doctor ni l'export iOS ne remplacent les validations humaines restantes.**
OAuth, création de compte, liens d'auth externes, Solo/Multi natifs et distribution App Store
restent hors périmètre. Le serveur, les règles, les données et la compatibilité
future web/iOS ne sont pas modifiés par ce socle.
