# Fondations viewport et safe areas

L’issue #118 pose le shell mobile commun à Safari iPhone et au mode standalone. L’issue #119, décrite ci-dessous, ajoute le gate PWA obligatoire sur téléphone : navigateur téléphone → installation obligatoire, standalone téléphone → app, desktop/tablette → web normal.

## Audit et modèle global

L’audit de `layout`, `globals.css`, `AppTopNav`, `AppShell` et `MobileLandscapeNotice`, puis des pages Accueil, Friends, Training, Multiplayer, room/lobby, Solo et des overlays, a identifié des soustractions `56px`, `3.5rem`, `4rem`, `112px` et un ancien `48px` dans le lobby. Elles empêchaient l’ajout d’une safe area supérieure. `AppPage` masquait aussi les débordements et créait un contexte de scroll qui gênait les éléments sticky.

Le document possède le scroll des pages normales. `html`, `body` et le root ont une hauteur **minimum** dynamique et le même fond `--app-bg`, défini avant hydratation par le bootstrap thème existant. Les pages peuvent grandir sans plafond. Il n’y a aucun `overflow-x: hidden/clip` global. Les scrollers locaux restent explicites : listes d’amis, choix d’enchères hors scène de jeu, règles, paramètres, popovers et menu mobile. Les petits paysages du lobby reviennent au flux naturel pour éviter l’écrasement des sièges ; la scène de jeu conserve son shell contraint.

La suppression du clipping a révélé un débordement réel dans l’exercice d’enchères : les `fieldset` avaient une largeur minimum intrinsèque malgré leurs scrollers internes. `min-width: 0` sur ces fieldsets conserve leurs boutons et leur scroll horizontal local, sans agrandir le document.

## Viewport Next.js

`app/layout.tsx` exporte `viewport: Viewport` :

```ts
{ width: "device-width", initialScale: 1, viewportFit: "cover" }
```

Next.js produit une seule balise canonique. Le zoom utilisateur est conservé : aucun `maximumScale` ni `userScalable: false`.

## Variables et primitives

| Variable | Fonction |
| --- | --- |
| `--safe-top/right/bottom/left` | Les quatre `env(safe-area-inset-*, 0px)`, centralisés uniquement sur `:root` |
| `--viewport-dynamic` | `100vh` par défaut → `100svh` si disponible → `100dvh` si disponible |
| `--viewport-stable` | `100vh` par défaut → `100svh` si disponible |
| `--header-height` | Hauteur existante de 56 px, bordure comprise |
| `--header-shell-height` | Header + `--safe-top` |
| `--content-height` | `max(0px, viewport dynamique − header shell)` |
| `--bottom-spacing` | Espacement de la primitive avant ajout de `--safe-bottom` |
| `--shell-padding-x/y` | Espacement existant des shells, avant ajout des insets |
| `--fullscreen-gap` | Marge minimale des overlays, combinée avec les safe areas |

Cinq primitives réutilisables :

- `coinche-viewport-dynamic` : minimum dynamique pour un root qui suit le chrome Safari.
- `coinche-viewport-stable` : minimum stable pour un futur écran d’installation qui doit éviter la variation du chrome ; ne pas l’utiliser pour contraindre la table.
- `coinche-content-min` : minimum utile sous le header.
- `coinche-fullscreen-safe` : overlay à hauteur dynamique, quatre insets avec `max(marge, safe-area)`.
- `coinche-safe-bottom` : `padding-bottom: calc(var(--bottom-spacing, 0px) + var(--safe-bottom))`.

`coinche-page-shell` compose ces règles avec les espacements de page existants. Un shell de jeu utilise `height: var(--content-height)` et déduit les safe areas via son padding. Il ne faut pas soustraire une seconde fois `safe-top` : le header l’a déjà consommé. Les modales passent par `coinche-fullscreen-safe` sur leur backdrop et bornent leur panneau à la zone restante.

## Header, bas et overlays

Le header reste sticky, garde sa zone interne de 56 px bordure comprise et ajoute `safe-top` au-dessus. Son contenu intègre séparément safe-left et safe-right. Les ancres et barres sticky secondaires utilisent la même hauteur globale. Aucun listener global `resize`, `window.innerHeight` ou variable JS `--vh` n’est introduit. Les observateurs d’orientation existants restent en place.

AppPage utilisait 20/28 px d’espacement bas dans #118 et **ajoute** safe-bottom. La couche #121 décrite en fin de document ajuste cet espacement mobile via les mêmes variables. Aucun forfait de 100 px : le chrome navigateur est traité par `dvh`, le Home Indicator par l’inset. Le dernier contenu est atteignable en scrollant le document. Les modales réservent le bas du panneau et peuvent faire défiler leur contenu interne ; les footers restent dans la zone sûre. Le menu mobile verrouille temporairement le document, possède son seul scroll et restaure le document à la fermeture ou au passage desktop. `lib/ui/bodyScrollLock.ts` partage ce verrou avec les modales : des ouvertures simultanées ne peuvent ni libérer le document trop tôt, ni le laisser bloqué après Escape. Les popovers audio, de partie et notifications sont bornés par la hauteur disponible et les insets latéraux.

`MobileLandscapeNotice` garde « Tournez votre téléphone », son aspect et les conditions produit existantes. Son shell est centré sous le header, avec hauteur minimum dynamique et quatre côtés sûrs. La notice Training imbriquée dans le shell utilise la zone sûre déjà réservée par son parent pour éviter une deuxième hauteur viewport.

Les petits inputs des primitives app, paramètres et règles passent à 16 CSS px sur petit écran et pointeur tactile ; les inputs de réponse déjà plus grands restent inchangés. Aucun bouton ni zone tactile n’est réduit.

## Tests reproductibles

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run test:e2e:smoke
npm run test:e2e:mobile
```

Le projet mobile utilise Chromium et WebKit. En environnement de fixture, construire avec `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=mobile-ui-fixture`, puis utiliser `E2E_PRODUCTION_SERVER=1`. Aucun compte réel n’est créé et aucune room réelle n’est écrite. La fixture room fournit un lobby et une projection joueur synthétiques à l’interface existante. Ne pas reconstruire `.next` pendant qu’un serveur de test production l’utilise.

`e2e/helpers/mobile.ts` expose `MOBILE_VIEWPORTS`, `DESKTOP_VIEWPORTS`, `setMobileViewport`, `expectNoPageHorizontalOverflow`, `expectInsideSafeViewport` et `simulateSafeAreas`. La simulation réassigne les **entrées** `--safe-*` sur `document.documentElement.style` ; toutes les variables dérivées se recalculent. Aucune branche test ne s’exécute dans l’app et aucune valeur fixture n’est hardcodée en production.

Matrice portrait : 320×568, 375×667, 390×844, 430×932. Paysage : 568×320, 667×375, 844×390, 932×430. Desktop : 1120×800, 1440×900. Les deux thèmes sont vérifiés. Les pages publiques incluent `/`, `/friends`, `/training`, `/multiplayer`, `/solo` avant partie, `/rules`, `/login`, `/progression`, `/profile`, `/history`, `/leaderboard`. La fixture couvre aussi Accueil, Friends, Training et Multiplayer authentifiés à 320/390 px, puis lobby et partie multi. Solo couvre notice, rotation, main conservée, absence de reload et de scroll fantôme. Safe areas : top 47, bottom 34, left 44/right 0, puis left 0/right 44. Les tests contrôlent aussi les modales, menus, inputs, fonds, enchères à 320/390 px et accès au bas.

`.github/workflows/mobile-responsive.yml` exécute cette matrice sur le build production en Chromium/WebKit. Les autres workflows existants restent les gates smoke, Social, Progression, Training, Duo et Rating. Les captures de diagnostic restent dans `test-results/`, ignoré par Git.

## Safari réel et futur standalone

WebKit desktop permet de tester le moteur CSS et les insets simulés, mais ne reproduit pas physiquement le chrome dynamique, le clavier et la rotation iOS. Sur iPhone réel, vérifier portrait → paysage → portrait, barre Safari affichée/masquée, notch à gauche puis à droite, focus input/zoom, dernier CTA et Home Indicator en dark/light. Ces vérifications matérielles ne sont pas déclarées réalisées par les E2E.

Les primitives utilisent les insets fournis par le navigateur sans supposer leur valeur ou le côté du notch. Elles fonctionnent avec les changements de viewport CSS et sont réutilisées par #119 en standalone. Les refontes navigation, densité, pages et table restent dans #120–#126 ; aucun gameplay ou modèle métier ne change ici.

## Installation PWA obligatoire sur téléphone

### Décision produit et architecture

Sur téléphone navigateur, KFFR affiche uniquement **Installer KFFR pour continuer**, sans fermeture, report ou accès au produit. Une installation antérieure ne débloque pas l’onglet : il faut lancer l’icône d’écran d’accueil. Desktop et tablettes restent accessibles sur le web dans cette V1.

`MobileInstallGate` enveloppe les providers racine et le produit. Son état SSR et de première hydratation est neutre (`detecting`) : aucun HTML métier interactif ni mismatch. Une fois les APIs navigateur interrogées, seuls desktop/tablette et standalone montent `PlayerPreferencesProvider`, `MusicProvider`, `SocialNotificationsProvider`, `ProgressionProvider`, `SocialPresenceHeartbeat`, `AppTopNav` et les pages. Les providers ne démarrent donc ni présence, realtime, progression, notifications ni musique derrière l’installation. Le bootstrap thème du `<head>` conserve dark/light sans monter Settings. Analytics et SpeedInsights sont également dans le gate.

### Manifest, icônes et iOS

`app/manifest.ts`, typé `MetadataRoute.Manifest`, fournit `/manifest.webmanifest` : `id=/`, `name=KFFR Contrée`, `short_name=KFFR`, `start_url=/`, `scope=/`, `display=standalone`, `lang=fr`, fond `#06120d`, chrome `#071c17`. Aucune orientation globale imposée ; la partie conserve sa notice paysage existante.

Les PNG opaques `/pwa/icon-192.png` et `/pwa/icon-512.png`, l’icône Apple 180×180 (`app/apple-icon.png`) et le favicon 48×48 (`app/icon.png`) sont des réductions sans déformation de `public/brand/kffr-icon-master.png`. Le master reprend l’image de référence : fond vert foncé sur tout le carré, grand K doré et petites cartes centrées dessous, sans contour ni coins noirs. Les chemins existants sont conservés, y compris pour `KffrLogo` en mode icône ; les logos horizontaux restent inchangés. Aucun maskable déclaré.

Metadata Next.js : `appleWebApp.capable=true`, titre `KFFR`, status bar `black-translucent`. Next 15 émet la balise canonique `mobile-web-app-capable=yes`, les balises Apple titre/status bar et le lien Apple icon. `themeColor` est dans l’export `Viewport`. Le viewport #118 est inchangé et unique ; zoom conservé. La couleur native de lancement est fixe et cohérente avec le shell sombre ; le thème de contenu reste celui des préférences.

### Détection centralisée

`lib/pwa/environment.ts` ne lit ni largeur ni orientation. Les exceptions tablettes sont identifiées en premier : iPad, iPadOS UA Mac avec plusieurs points tactiles, Android sans signal Mobile, autres UA tablet explicites. Pour les appareils restants, `userAgentData.mobile` prime lorsqu’il existe, puis fallback iPhone/iPod, Android Mobile et autres téléphones connus. Le tactile seul ne transforme jamais un laptop Windows en téléphone. Un iPhone 932×430 reste téléphone lors de toutes les rotations.

L’accès standalone dépend exclusivement de `(display-mode: standalone)` **ou** `navigator.standalone === true`. Le média est écouté et peut changer sans reload ; `pageshow` réévalue également le contexte. Ni URL, cookie, localStorage, événement d’installation ni flag produit ne peuvent accorder l’accès. Les simulations sont injectées dans les APIs navigateur par les tests uniquement.

Les UA restent une approximation : navigateur qui falsifie son identité, mode bureau forcé ou appareils inconnus peuvent être mal classés. La V1 privilégie l’absence de blocage accidentel d’une tablette. Ce gate est une décision UX, pas un contrôle d’autorisation backend ; Supabase et les routes API conservent leurs protections.

### UX iOS

L’écran utilise les quatre variables safe-area et `coinche-fullscreen-safe` de #118. Logo, vrai h1, étapes ordonnées, couleurs KFFR et contraste des thèmes. En petit paysage, deux colonnes compactes ; sur les petits écrans, les instructions peuvent défiler dans l’écran, sans agrandir le document.

Étapes affichées :

1. Ouvre le menu de partage Safari : appuie sur les 3 petites barres en bas de l’écran puis sur « Partager », ou directement sur le bouton Partager s’il est visible.
2. Dans la feuille de partage, fais défiler puis choisis « Sur l’écran d’accueil ».
3. Garde « Ouvrir comme app web » activé si iPhone le propose.
4. Appuie sur « Ajouter ».
5. Ouvre ensuite KFFR depuis son icône sur ton écran d’accueil.

Il n’y a pas de bouton Installer iOS ni de faux dialogue. Dans un autre navigateur iOS/in-app identifié, l’écran ajoute « Ouvre cette page dans Safari pour installer KFFR. » Aucun deep link automatique. Certains navigateurs iOS récents supportent aussi l’ajout natif ; Safari reste le chemin documenté commun. Sur iOS proposant « Ouvrir comme app web », laisser cette option activée. Lancée depuis l’icône en standalone, l’app n’a plus le chrome Safari classique ; aucun JS ne tente de masquer Safari.

### UX Android

L’événement `beforeinstallprompt` est différé et n’est déclenché que par le clic/clavier sur **Installer KFFR**. Chaque événement n’est utilisé qu’une fois ; refus/erreur laisse le gate et ses instructions. Sans événement, le menu navigateur → « Installer l’application » / « Ajouter à l’écran d’accueil » reste proposé. Disponibilité et libellés dépendent du navigateur et de ses critères d’engagement.

`appinstalled` affiche « KFFR est installé. Ouvre maintenant l’application depuis ton écran d’accueil. » L’onglet demeure bloqué tant qu’aucun signal standalone ne l’autorise. Les listeners et l’événement différé sont nettoyés au démontage.

### Auth réelle et routes techniques

Audit du repo : login `signInWithPassword`, signup `signUp` avec confirmation email conditionnelle, Google `signInWithOAuth`, callback existant `/auth/callback` et `completeAuthCallback`. Celui-ci vérifie la session, échange un code PKCE si nécessaire, résout le profil/pseudo puis applique un `next` interne validé. Le client Supabase utilise les réglages de session habituels du SDK. Aucun flow magic link, password recovery/reset, middleware auth ou autre callback n’est implémenté dans ce repo ; aucune route fictive n’est créée.

Sur téléphone navigateur, **seul** `/auth/callback` monte un petit composant technique sans providers produit. Il réutilise la même fonction d’échange et de résolution du profil. Après redirection, le gate reste obligatoire, y compris vers `/friends` ou `/profile`. En échec, le message demande de réessayer la connexion dans l’app ; aucun accès métier n’est accordé. API, manifest, assets et service worker ne passent pas par le layout React.

Flow nominal : installer, lancer standalone, se connecter dans KFFR. Email/Google peuvent ouvrir un navigateur externe selon l’OS ; le callback technique est permis, mais ne promet pas de transférer sa session vers un autre conteneur navigateur. Le stockage Supabase existant n’est ni déplacé ni dupliqué. Les tests exercent le véritable formulaire password, reload/réouverture de page dans le même contexte de stockage, et l’échange PKCE en browser/standalone. Ils ne prouvent pas la persistance après arrêt du processus iOS ; celle-ci doit être vérifiée matériellement et dépend des politiques du navigateur.

### Deep links

Messages, Mail, Discord ou autre app peuvent ouvrir un lien dans Safari même lorsque KFFR est installé. Dans ce cas : gate, puis ouverture manuelle de l’icône. Pas de pseudo universal link, schéma propriétaire ni flag d’URL. `start_url=/` lance l’accueil ; le routage des liens vers une PWA installée reste contrôlé par la plateforme.

### Service worker minimal, cache et offline

L’installation depuis le menu ne justifie pas un gros SW. Le worker `/sw.js` est présent pour un objectif précis : **afficher Connexion nécessaire lors d’un lancement/navigation réellement hors connexion**, sans devoir charger React ni ses bundles. Il est enregistré hors des providers métier, uniquement dans un contexte sécurisé compatible.

Une seule entrée CacheStorage : `/pwa-offline.html`, un document public sans donnée, token, API, image ou bundle métier. `scripts/buildPwaOffline.mjs` le génère avant le build depuis les variables, primitives viewport/safe-area et palette de `globals.css` : aucune seconde source d’insets ou couleur. Le worker intercepte uniquement les navigations GET de même origine hors `/api/`, tente le réseau et, seulement en erreur réseau, sert ce document. **Jamais de cache d’une navigation applicative**, y compris multiplayer/social/progression/profile/auth. API, requêtes RSC, Supabase REST/Auth/Realtime et écritures sont totalement laissés au réseau. Pas de stale-while-revalidate ni gameplay offline.

Cache versionné `kffr-offline-v1-<hash>`. Le prebuild calcule le hash du document et met à jour la constante du worker : toute évolution du document ou des styles partagés change ses octets et déclenche son remplacement. À chaque installation du worker, le document statique est refetché sans credentials ; les anciens caches portant uniquement ce préfixe sont supprimés à l’activation. `skipWaiting`/`clients.claim` conviennent ici car aucun bundle/app-shell n’est conservé. `/sw.js` est servi sans cache HTTP, et l’enregistrement utilise `updateViaCache=none`. Aucune configuration Vercel manuelle requise.

Pendant une session standalone déjà chargée, les événements online/offline déclenchent un probe public `/api/pwa/connectivity` sans credentials et sans cache, avec timeout. `navigator.onLine` n’est qu’un signal : une réponse réseau réussie reste nécessaire pour considérer la connexion revenue. Le gate offline démonte le produit ; **Réessayer** sonde puis recharge le document connecté. Les erreurs réseau des services réels gardent leurs mécanismes existants ; le probe ne garantit pas la disponibilité de Supabase. Le document offline froid propose également Réessayer (nouvelle navigation réseau). La toute première visite jamais contrôlée par un SW nécessite naturellement le réseau ; suppression/éviction du cache par l’OS peut aussi empêcher le fallback.

### Tests et limites matérielles

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:e2e:mobile
npm run test:e2e:pwa
```

Les projets mobile Chromium/WebKit exécutent aussi `@pwa` dans le workflow mobile existant, avec un seul téléchargement des moteurs. La fixture Supabase locale synthétique est celle de #118 ; aucun compte/donnée de production utilisé. Tests : classification déterministe, SSR neutre et absence de montage, changement de média, appinstalled sans bypass, frontières de cache du SW ; manifest/icônes/métadonnées réels du build ; huit tailles, light/dark, notch deux côtés, absence de requêtes privées derrière gate, standalone Solo/Multi et thème/audio, Android prompt natif mocké, desktop/tablettes, login et callbacks PKCE, cold offline + retry et inspection CacheStorage.

Les E2E simulent UA et APIs standalone ; ils ne réalisent pas une installation native sur un téléphone physique. Les workers sont bloqués dans les tests à fixtures pour conserver l’interception réseau Playwright, conformément à sa documentation. Les tests offline les activent et coupent réellement les connexions via un proxy local : ils évitent le [bug d’émulation offline WebKit #42775](https://github.com/microsoft/playwright/issues/42775), sans modifier la production. Les workflows existants Social, Progression, Training, Duo et Rating restent les validations des services/auth réels sur Supabase jetable en CI. Le workflow Rating exécute aussi les suites Multiplayer/Rating avec quatre comptes jetables. Aucune migration DB ni configuration de production nécessaire.

### Checklist exacte sur un vrai iPhone

Note de validation des routes : le shell neutre peut permettre à Next.js de commencer le streaming avant qu’une page dynamique ne termine sa validation. Les URLs Training invalides restent rejetées par `notFound()` avec écran 404 et `noindex`, mais le statut de transport peut être 200 pour une réponse streamée ([comportement Next.js documenté](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)). Les tests vérifient ces deux garanties, sans changer les règles de niveaux. Les lectures de géométrie attendent également un rendu après le scroll pour tenir compte de l’hydratation.

1. Ouvrir l’URL KFFR dans Safari.
2. Vérifier le gate « Installer KFFR pour continuer », sans bouton de bypass.
3. Ouvrir le menu de partage Safari : appuyer sur les 3 petites barres en bas de l’écran puis sur « Partager », ou directement sur le bouton Partager s’il est visible.
4. Dans la feuille de partage, faire défiler puis choisir « Sur l’écran d’accueil » ; laisser « Ouvrir comme app web » activé si proposé.
5. Appuyer sur Ajouter ; vérifier l’icône et le nom KFFR.
6. Fermer Safari.
7. Ouvrir KFFR depuis l’icône d’écran d’accueil.
8. Vérifier l’absence de barre d’adresse/navigation Safari et du gate.
9. Se connecter dans la PWA.
10. Fermer puis réouvrir la PWA ; vérifier le comportement réel de la session.
11. Passer en paysage, notch à gauche puis à droite.
12. Lancer Solo.
13. Vérifier la zone de jeu et les actions au-dessus du Home Indicator.
14. Revenir en portrait : notice existante, puis repartir en paysage sans reset.
15. Tester thème clair/sombre et audio.

Compléments : ouvrir un lien depuis Messages → gate si Safari ; ouvrir une URL dans Safari après installation → gate ; mode avion après une première ouverture connectée → Connexion nécessaire → rétablir réseau → Réessayer. Vérifier aussi Google/confirmation email si utilisés, selon le conteneur ouvert par iOS.

Références plateforme : [manifest Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest), [installation et critères Chrome](https://developer.chrome.com/blog/update-install-criteria/), [Home Screen et navigateurs iOS WebKit](https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/), [installation Safari iPhone Apple](https://support.apple.com/fr-fr/guide/iphone/iphea86e5236/ios).

Références : [Viewport Next.js](https://nextjs.org/docs/app/api-reference/functions/generate-viewport), [unités de viewport CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length), [safe areas WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).

## Navigation mobile

`lib/ui/appNavigation.ts` est le catalogue commun au header desktop et au drawer mobile : libellés, destinations, sous-navigation et correspondance des routes. Le breakpoint desktop reste **1120 px**. Son identité, ses menus hover/clic, son espacement et ses contrôles Partie sont conservés. Le header mobile garde le logo horizontal KFFR, la cloche, l’audio, le thème, le burger et le contrôle Partie lorsqu’il est monté. Les contrôles principaux ont une cible de 44 × 44 px ; le compte détaillé vit dans le drawer afin de tenir à 320 px, même avec un pseudo de 40 caractères.

Le drawer `MobileNavigationDrawer` s’ouvre depuis la droite, sans déplacer la page : largeur `min(88vw, 24rem, 100%)`, soit au maximum 384 px et toujours dans la zone disponible entre les insets. Il utilise les couleurs, bordures, rayons et ombres du design system. La primitive `coinche-fullscreen-safe` de #118 réserve les quatre safe areas et la hauteur dynamique ; aucun deuxième système de viewport ou d’insets n’est créé. Le backdrop couvre le viewport, le panneau respecte le Home Indicator et **une seule zone**, `Navigation mobile`, défile. Sur 390 × 844, le menu authentifié avec Training replié tient sans scroll ; sur les petits paysages, la zone compte reste accessible par le scroll interne.

Ordre : Accueil ; Jouer (Solo et Multijoueur côte à côte) ; Classement ; Amis ; Historique ; Entraînement ; Règles ; compte. Les destinations privées restent réservées aux utilisateurs connectés. Entraînement est replié hors de ses routes, ouvert à chaque ouverture du drawer depuis une route Training, puis modifiable localement. Aucun état d’accordéon n’est persisté. Ses cinq liens utilisent les destinations existantes : Vue d’ensemble et les ancres Calculer, Mémoriser, Déduire, Annoncer. Les exercices réels sont associés à leur catégorie ; le matcher respecte les limites des segments, les routes imbriquées et les ancres, et désigne une seule destination avec `aria-current="page"`.

La zone compte réutilise les providers existants : identité/cosmétiques compacts, pseudo tronqué visuellement mais lisible avec son nom accessible complet, lien Profil, niveau, mini-barre XP et Ma progression. Ouvrir le drawer ne déclenche aucune nouvelle lecture de profil, progression ou cosmétiques. Un visiteur voit uniquement Se connecter, sans niveau ni XP fictif.

`AccessibleDialog` fournit le rôle dialog, `aria-modal`, le nom Navigation KFFR et le focus initial sur Fermer le menu. Tab/Shift+Tab restent dans le panneau ; un focus extérieur est ramené dans le dialog supérieur. Les déplacements programmatiques utilisent `preventScroll`, et les liens focalisés sont révélés dans le scroller du drawer. Fermer par Escape, croix, backdrop ou lien restitue le focus au burger et libère `lockBodyScroll` de #118. Le verrou est partagé, compté et nettoyé au démontage et en StrictMode. La position de la page est conservée lors d’une fermeture ; une nouvelle destination conserve la navigation Next.js normale. Cliquer une ancre sur la route actuelle ferme aussi le drawer. Passer au breakpoint desktop ferme le drawer et place le focus sur Accueil dans la navigation desktop.

Les couches sont explicites : header et ses popovers à 50, navigation/backdrop à 80, vrais dialogs à 90. Le drawer est rendu dans `document.body`, pour ne pas dépendre du contexte du header avec backdrop-filter. Un dialog critique ouvert ensuite possède seul Escape et le focus, puis restitue le contrôle au drawer. L’entrée CSS dure 160 ms et disparaît avec `prefers-reduced-motion: reduce`. Aucune bibliothèque ni dépendance n’est ajoutée. Audio, thème, notifications et Partie gardent leur fonctionnement existant.

L’API `AppTopNav({ variant: "default" | "compact-game" })` expose `data-header-variant` pour #126. La variante est seulement préparée ; aucune table, page ou logique de jeu n’est redesignée. Le gate PWA, sa détection, les icônes, le manifest et le service worker ne changent pas.

Validation : `tests/appNavigation.test.ts` couvre le catalogue et les routes ; `tests/mobileNavigation.test.tsx` couvre l’accordéon, les providers, le focus, les fermetures, le démontage, StrictMode et un dialog critique superposé. `e2e/mobileNavigation.spec.ts` couvre les huit tailles de #118 en Chromium/WebKit, standalone iPhone simulé, les deux thèmes, anonyme/niveau 1/XP élevé/pseudo long, les insets des deux côtés, les routes réelles et les ancres Next.js, les contrôles du header et desktop 1120/1440. Les captures de validation sont conservées localement dans `.playwright/validation/navigation-*.png`, sans goldens dans Git. La suite mobile/PWA existante et les suites smoke, progression, Social, Training, Duo et Multiplayer/Rating restent les contrôles de non-régression. Les workflows de services utilisent exclusivement une base Supabase jetable en CI.

## Primitives UI mobiles

La couche #121 densifie les composants de `components/ui/AppShell.tsx` sans modifier le contenu ou la composition propre aux pages. Aucun composant responsive JavaScript, dépendance, listener de resize ou deuxième feuille CSS. Les primitives restent dans `globals.css`, avec les couleurs, bordures, ombres et focus existants.

### Espacement et breakpoints

Six tokens communs alimentent les primitives :

| Token | Téléphone <480 px | 480–1119 px | Desktop ≥1120 px |
| --- | --- | --- | --- |
| `--page-padding-x` | 12 px | `clamp(12px, 2vw, 20px)` | 20 px, rendu existant |
| `--page-padding-y` | 12 px | `clamp(14px, 2vw, 24px)` | 28 px, rendu existant |
| `--section-gap` | 12 px | `clamp(14px, 1.8vw, 18px)` | 20 px |
| `--surface-padding` | 12 px | `clamp(14px, 1.8vw, 18px)` | 20 px par défaut, overrides conservés |
| `--header-padding` | 16 px | `clamp(16px, 2.2vw, 28px)` | `clamp(22.4px, 3vw, 38.4px)`, formule existante |
| `--header-gap` | 12 px | 12 px | 20 px |

`AppPage` conserve les variantes `narrow`, `medium` (défaut) et `wide`, leur largeur maximum et le flux naturel du document. Toutes utilisent la largeur utile sur téléphone. La classe `coinche-page-stack` applique le gap commun. Les variables existantes `--shell-padding-x` et `--bottom-spacing` consomment les nouveaux tokens sous 1120 px ; safe-left/right s'ajoutent au padding latéral, safe-bottom au padding bas. Le viewport et le shell de navigation #118/#120 sont inchangés.

`AppSurface` conserve `panel` et `plain` sans nouvelle prop de densité. Le panel reçoit un padding responsive et un rayon plafonné à 16 px sous 1120 px. La section plain conserve son canvas et son absence de padding de panel. Sur desktop, la faible spécificité du padding par défaut laisse fonctionner les overrides locaux existants ; un override explicite important reste prioritaire sur mobile aussi.

### Header et typographie

`AppPageHeader` conserve eyebrow, vrai h1, description entière, actions et children. Sous 480 px, le titre utilise `clamp(24px, 6.8vw, 30px)` ; entre 480 et 1119 px, `clamp(28px, 3.5vw, 40px)`. La line-height vaut 1.1 sur ces largeurs ; les mots longs peuvent se couper pour éviter l'overflow. La description vaut 14 px / 1.5, avec 6 px au-dessus. L'eyebrow vaut 11.2 px et tracking .1em sous 480 px. Les autres textes et la typographie gameplay conservent leurs classes.

Les actions se replient naturellement dans leur conteneur, sans imposer la pleine largeur. Deux actions courtes peuvent rester côte à côte. Une action directe du header n'ajoute pas une deuxième marge verticale au gap de sa grille. Aucun line-clamp ou suppression de contenu.

### Actions et formulaires

Les minima par défaut ont une spécificité nulle (`:where`) pour conserver les tailles plus grandes déclarées par les composants : `min-h-14` reste à 56 px, `min-w-56` à 224 px et `min-w-32` à 128 px. Cela rétablit aussi les hauteurs explicitement demandées par les contrôles de comptage ; les pages témoins desktop gardent leur géométrie existante. La suite navigateur vérifie les vrais contrôles Solo et Compter son tas, ainsi que ces overrides dans la fixture de primitives.

Les classes primary/secondary/danger conservent couleurs, focus visible, disabled et minimum tactile de 44 px. Sous 1120 px, leur padding passe à 8/12 px, avec wrap des labels longs. Les segmented items passent également à 44 px minimum ; les groupes existants restent explicites. Desktop conserve les valeurs actuelles.

`appInputClass` garde 44 px minimum ; les petits inputs/selects/textareas de cette primitive restent à 16 CSS px sous 1120 px, y compris les paysages téléphone. Les champs déjà plus grands et les contrôles de jeu hors shell app sont conservés. Le padding mobile vaut 8/12 px et une scroll-margin tient compte du header safe. Les formulaires app contenant cette primitive passent à un gap de 10 px ; les labels à 4 px entre texte et champ. Les labels, erreurs et valeurs restent présents. Le document reste scrollable lorsque le viewport se raccourcit, sans mesure permanente du clavier.

Les compositions opt-in suivantes sont disponibles sous forme de classes exportées, sans nouveau composant ou variante de page :

| Export | Composition |
| --- | --- |
| `appFormClass` / `appFieldClass` | Formulaire vertical et label avec champ |
| `appSegmentedGroupClass` | Segments en flex wrap ; les items peuvent passer sur plusieurs lignes |
| `appRowClass` | Titre/informations/actions qui se replient selon l'espace disponible |
| `appMetadataClass` | Petites informations avec wrap, min-width:0 ; truncate peut être choisi explicitement |
| `appTableScrollClass` | Overflow horizontal limité au tableau ; l'appelant fournit nom accessible et tabIndex si nécessaire |

Ces outils ne transforment aucune table ni row existante automatiquement. Le choix de composition reste à la page ; Friends, Training et Multiplayer bénéficient ici uniquement des primitives déjà utilisées. Le hero Accueil, le drawer et AccessibleDialog gardent leur structure ; le correctif summary/details de #131 est intact.

### Mesures et validation

Mesures du build production, viewport 390×844, thème dark, depuis `main` 191029a54bbf5d5590b93d07c25f96811a26e411 :

| Élément | Avant | Après |
| --- | --- | --- |
| Padding page vertical | 20 px | 12 px |
| Gap de la pile AppPage | 20 px | 12 px |
| Padding header | 22.4 px | 16 px |
| Header Amis / Entraînement, Chromium et WebKit | ≈184 px | ≈131 px |
| Header Multijoueur, Chromium | ≈235 px | ≈166 px |
| Header Multijoueur, WebKit | ≈235 px | ≈195 px (titre sur deux lignes) |
| Padding AppSurface standard | 16 px | 12 px |
| Padding action vertical/horizontal | 10/16 px | 8/12 px |
| Hauteur input et action primary | 44 px | 44 px |

Le gap entre header et élément suivant suit le token 20→12 px lorsque ces éléments sont enfants directs d'AppPage ; les compositions internes des pages ne sont pas réécrites. Sur desktop 1120×800 et 1440×900, les mesures de Friends, Training et Multiplayer sont identiques avant/après dans les deux moteurs et thèmes. Les 12 images Chromium sont identiques au pixel ; WebKit compte dix images identiques et deux écarts de 38/21 pixels sur plus de 3.5/5.1 millions de pixels, sans changement géométrique. Les captures et mesures avant/après restent dans `.playwright/density/`, non versionné.

`tests/appShell.test.tsx` vérifie les variantes, la hiérarchie du header, les informations, les actions/disabled, les sections plain/panel et les vrais labels/contrôles de formulaire. `e2e/mobileDensity.spec.ts` utilise le build production en Chromium/WebKit. La fixture SSR de test rend les vrais composants AppShell ; aucune route de test n'est livrée dans l'app. Elle couvre titre sur deux lignes avec description et actions, pseudo de 40 caractères, titre et labels longs, grandes valeurs XP, 16 px, 44 px, tableau à scroll interne et absence d'overflow global. Les vraies pages sont aussi parcourues en auth/anonyme, light/dark, portrait/paysage, tablette 768/1024. Le formulaire login est testé à 390×844 puis 390×380 : focus conservé, champ et CTA atteignables au scroll. Cette simulation ne prétend pas tester un clavier iPhone physique.

La matrice #118, la navigation/drawer #120 et les régressions de dialog #131 restent dans la suite mobile/PWA. Les workflows existants incluent automatiquement les nouveaux tests via le tag `@mobile` et les chemins `e2e/helpers/**`, sans ajout de job ou duplication de matrice CI.

## Accueil et progression mobile

L'Accueil #122 conserve son titre « La contrée, en solo ou entre amis » et ses quatre destinations. Sous 1120 px, `coinche-home-page` aligne le contenu en haut : le chargement de la progression ne recentre plus le hero verticalement. Le hero réutilise `--header-padding` et les actions de #121. Son titre fluide vaut 28–34 px sous 480 px, puis 28–40 px jusqu'au desktop ; les espacements titre/actions/règles valent 12/8 px.

Solo reste primaire et occupe la première ligne. Les deux actions secondaires utilisent une grille auto-fit de largeur minimum 136 px ; elles tiennent côte à côte sur les téléphones usuels et se replient à 320 px si l'espace disponible l'exige. Les CTA gardent au moins 44 px ; Voir les règles reste un lien compact avec focus visible. Le logo décoratif complet est masqué sous 480 px, sans garder son min-height. Entre 480 et 1119 px en portrait, il est réduit à 112–160 px. Sur les petits paysages de hauteur ≤450 px, il est masqué et titre/actions utilisent deux zones. Le logo du header est conservé.

`HomeProgressionCard` garde le provider, les formats XP et son absence de markup pour un visiteur. Son mode `compact` présente Progression et Niveau N sur une ligne, la barre XP sur toute la largeur, puis XP courant/nécessaire et Voir ma progression. Le badge Niveau redondant est masqué dans cette présentation mobile. Le lien garde une cible de 44 px et le focus existant. Les états chargement/erreur utilisent toujours `ProgressionStatusCard` et Réessayer ; l'arrivée des données laisse le hero et le début de Progression à la même position.

Les trois weekly Home deviennent des rows : titre et compteur/statut, puis barre. Le tri incomplètes avant terminées est inchangé, les descriptions/récompenses détaillées restent sur `/progression`, et ✓ Terminé ne dépend pas uniquement de la couleur. Le même `ResetLabel` et ses timers sont conservés. Niveau et weekly passent en colonnes à partir de 640 px sous le breakpoint desktop, avec des surfaces alignées en haut ; aucun remplissage artificiel en hauteur. Les titres longs peuvent se replier et les compteurs restent dans leur row.

À 390×844 standalone simulé, avec safe-top 47 px et safe-bottom 34 px :

| Mesure | Avant #122 | Après |
| --- | --- | --- |
| Hero Chromium / WebKit | ≈551 / 589 px | ≈237 / 238 px |
| Début du bloc Progression Chromium / WebKit | ≈678 / 716 px depuis le haut du viewport | ≈364 / 365 px |
| Résumé niveau | 206 px | 114 px |
| Weekly Home | 215 px | 177 px |

Header, titre, Solo, Multijoueur, Entraînement, règles, niveau, barre XP et lien Progression sont visibles dans le premier viewport sans scroll. Avec la fixture niveau 1, les trois weekly tiennent également au-dessus du safe-bottom. Le test `authenticated home exposes progression in the first iPhone viewport` contrôle les bounding boxes et échoue sur l'ancien build dans les deux moteurs/thèmes.

À partir de 1120 px, le hero, grand titre, logo décoratif et cartes Progression gardent leur composition desktop. Les huit comparaisons avant/après (1120×800 et 1440×900, Chromium/WebKit, clair/sombre) donnent une géométrie identique et zéro pixel modifié. La page `/progression` conserve summary complet, descriptions et récompenses weekly, missions permanentes, collection et XP récents. Aucun changement de provider, formule XP, catalogue/reset weekly, requête, navigation, auth, PWA ou gameplay. Pas de dépendance, listener de resize ou JS responsive ajouté.

`tests/progressionUI.test.tsx`, `tests/progressionWeekly.test.tsx` et branding couvrent les données, états, tri, liens et version complète. `e2e/homeMobileProgression.spec.ts` utilise les helpers standalone/auth existants : Chromium/WebKit, clair/sombre, anonyme/niveau 1/niveau élevé, huit tailles mobiles, tablette 768/1024, desktop 1120/1440, états weekly/chargement/erreur, routes, focus et texte long. Les mesures/captures comparatives restent dans `.playwright/home-progression/`, sans goldens dans Git. Les suites mobile/PWA, progression, smoke et services authentifiés en CI restent les validations de non-régression.

## Amis et social mobile

`/friends` conserve `AppPageHeader` (Espace social / Amis et description), les tokens de densité #121 et les groupes En ligne / Hors ligne. Une identité compacte réunit dot, pseudo, niveau et présence textuelle. Toute cette zone est un lien nommé « Voir le profil de Alice » vers le profil existant ; les trois actions sont ses voisines, jamais ses descendants. Le niveau et la présence constituent sa description accessible via `aria-describedby`, également conservée pendant pending. Les pseudos longs sont tronqués avec leur texte complet dans `title` et dans le nom accessible du lien.

Jouer reste primaire et S’entraîner devient secondaire, tous deux immédiatement visibles. Le bouton … de 44×44 px ouvre « Supprimer de mes amis » dans le flux de la row : seule cette row grandit temporairement. Le menu reste dans le scroller, sans popover absolu coupé par son overflow. Un seul mécanisme parent gère le menu actif, Escape, clic extérieur et départ du focus ; flèches/Entrée permettent de l’utiliser au clavier. Les flèches refocalisent aussi l’item lorsque Shift+Tab ramène au trigger d’un menu déjà ouvert. Escape, second tap et suppression rendent le focus au trigger ; une navigation vers un autre contrôle conserve son focus. Le menu ne déclenche aucune requête.

La confirmation `window.confirm` reste obligatoire. La suppression affiche « Suppression… », conserve la row jusqu’à la réponse API, puis utilise le message et le refresh existants. Le verrou `pendingAction` / `pendingActionRef` reste global dans `FriendsPageClient`. Pendant la création Jouer ou Duo, les identités deviennent de vrais boutons disabled sans href et les actions concurrentes sont bloquées. `gameNavigationEpoch`, son invalidation synchrone au unmount et le maintien du verrou jusqu’à navigation sont conservés.

Les demandes reçues gardent Accepter primaire et Refuser secondaire ; les demandes envoyées gardent Annuler. Les invitations conservent joueur, table, expiration, Rejoindre, Refuser et Annuler. Les classes Friends spécialisées réduisent leurs espacements sous 1120 px sans changer `.coinche-social-row` globalement. Le flux resolve → room avec invitation → acceptation après prise de place reste inchangé, comme les notifications Social/Duo.

La recherche conserve le label Pseudo, les limites 3/40 caractères, le debounce de 350 ms et les états Recherche… / erreur / aucun résultat. Déjà ami, Demande envoyée, Répondre à la demande et Ajouter gardent leurs comportements. Les inputs/selects utilisent les primitives à 16 px sur mobile. Les résultats suivent le scroll naturel de page ; un viewport réduit à 390×380 permet d’atteindre la dernière action, puis de restaurer la hauteur sans perdre la saisie.

Sous 640 px, identité et trois actions prennent deux lignes compactes ; à partir de 640 px elles partagent une ligne. Les cibles restent à 44 px minimum. Les groupes sticky et le scroll interne des 20 amis sont conservés. Desktop partage volontairement l’identité-lien et le menu secondaire, avec header et sections existants. `FriendPresenceList` offre un wrapper d’identité optionnel ; les dialogs d’invitation conservent sa composition par défaut.

Le scroller garde `overscroll-behavior: contain`. Un listener de molette unique sur cette liste bloque uniquement les dépassements de ses bornes quand elle déborde : la régression WebKit montre sinon un scroll de page au bas de la liste. Les gestes internes restent natifs, de même que les événements de zoom. Aucun listener par ami ni calcul JS du viewport n’est ajouté. L’identité explicite `tabIndex={0}` pour être parcourable également dans WebKit, sans intercepter Tab ni modifier l’ordre natif du document. Les E2E vérifient réellement Tab depuis le dernier contrôle du header vers cette identité, puis les trois actions, ainsi que le parcours inverse avec Shift+Tab.

Mesures à 390×844 standalone simulé (safe-top 47 px, safe-bottom 34 px), identiques sur Chromium/WebKit et clair/sombre :

| Mesure | Avant #123 | Après |
| --- | --- | --- |
| AppPageHeader | 131,16 px | 131,16 px |
| Row ami typique | 137,98 px | 101 px (−26,8 %) |
| Bloc actions | 96 px | 44 px |
| Rows entièrement visibles dans le conteneur | 3 | 4 |

À 844×390, l’identité et les actions restent sur une ligne de 54,59 px, comme avant ; la largeur occupée par les actions diminue. À 1120×800 et 1440×900, la hauteur du header et celle de la row restent identiques. La différence visuelle desktop est volontaire : identité-lien, S’entraîner secondaire et Supprimer derrière …, sans changement des destinations ni callbacks.

`TrainWithFriendDialog` conserve ses quatre niveaux et la création Duo. Un titre avec pseudo de 40 caractères peut se couper ; le contenu central peut scroller en petit paysage, tandis que le footer Créer le duo reste accessible. Ces ajustements ne concernent que ce dialogue.

`tests/friendsMobile.test.tsx` couvre identité, présence/niveau, menu/focus, pending, confirmation et refresh. Les régressions de création différée et d’unmount #116 restent dans `tests/playWithFriend.test.ts`. `e2e/friendsMobile.spec.ts` (`@mobile @friends-mobile`) utilise les helpers standalone/auth existants, Chromium et WebKit, les deux thèmes, huit viewports téléphone, deux tablettes et deux desktops. Les fixtures UI 0/1/20 amis et les réponses retardées complètent les suites Social DB, profil ami et Duo réellement authentifiées en CI ; elles ne les remplacent pas. Les mesures et captures avant/après sont conservées dans `.playwright/friends-social/`.

## Entraînement mobile

Le hub conserve `AppPageHeader` et les primitives de densité. Sous 1120 px, son padding reprend `--surface-padding`, le catalogue passe à 1,25 rem entre familles et les section headers réduisent padding, titre et marges. Les quatre descriptions pédagogiques restent entières. Défis et Compter son tas conservent leurs h3, leurs modes et les messages de déblocage, avec moins d’espace avant les groupes.

Les `TrainingModeCard` utilisent un padding de 0,875 rem et un gap de 0,5 rem. Les descriptions gardent tout leur texte, avec un line-height de 1,4. Niveaux, records locaux et records compte restent des informations distinctes ; les records longs peuvent se couper naturellement. Les liens Jouer à deux et Voir les conventions partagent une ligne lorsque la place le permet. Le CTA principal et la classe featured sont conservés.

Les niveaux gardent leurs hitboxes 44×44 px et deviennent des pills sous 1120 px. Le niveau courant conserve `aria-current="step"`, les noms complets restent dans les labels et les niveaux verrouillés restent des spans sans href. La règle de disponibilité et le seuil 8/10 ne changent pas.

Les cinq familles d’exercices solo et Pile Count optent pour `.training-exercise`. Le session header garde retour, kicker, titre, nom du niveau, score, exercice X/Y, pourcentage et progressbar. Sa composition utilise une colonne de titre souple et une colonne de score qui ne crée pas de ligne supplémentaire à 390 px. Le contenu commence à 0,75 rem du header. Les cartes d’exercice gardent leurs dimensions ; seuls le chrome, les gaps et le pavé numérique sont densifiés. Le pavé reste à trois colonnes en portrait, passe à six à partir de 640 px et conserve les contrôles de 44 px et un input de 20 px.

Les résultats solo partagent `.training-solo-result` : padding de 1 rem, score fort de 3,5 rem et actions qui peuvent wrap. Les messages de record et de déblocage restent visibles. Pile Count et les défis gardent leurs résultats spécifiques, leur score de 3 rem et leurs timers. Le test manuel Pile Count existant vérifie aussi le vrai résultat terminé à 320×568 et 844×390, ses records/temps et ses actions au-dessus du safe-bottom. Le setup d’entraînement en partie ajuste seulement son header ; la table ne change pas. Les styles sont opt-in : le lobby et la session Duo gardent leur présentation et leur fonctionnement réseau.

Les quatre ancres utilisent `scroll-margin-top: .75rem` uniquement pour l’espace visuel supplémentaire. Le `scroll-padding-top` global réserve déjà `--header-shell-height`, safe-top compris : les cibles ne recomptent pas le header. Le hub se monte après le gate PWA ; une fois ses données initiales prêtes, il aligne une seule fois la cible du fragment connu via `scrollIntoView({ block: "start" })`, sans modifier le focus, location ou l’historique. Le navigateur applique les offsets CSS à la cible désormais présente. Aucun scrollTo, timeout ou calcul d’offset en JS n’est ajouté. Les tests bornent le gap entre le h2 et le bas du header à 0–56 px, padding et kicker de section compris, et vérifient le titre entièrement visible. Chaque chargement direct part d’une page neuve ; le drawer est également couvert à 390×844 et 844×390 avec safe-top 47 px, dans Chromium/WebKit. Le drawer reste inchangé. Un test retarde les records puis vérifie que Calculer et Mémoriser conservent le focus du burger et l’historique après l’alignement. Le setup `/training/game` ajoute sous 1120 px un espace final `var(--bottom-spacing)` et son CTA une `scroll-margin-bottom: var(--safe-bottom)` ; AppPage fournit toujours seul le padding safe-bottom, sans inset supplémentaire et sans changement desktop. Les exercices et résultats utilisent le scroll naturel d’`AppPage` et sa primitive `coinche-safe-bottom`, sans valeur iOS dupliquée. Un viewport réduit de 390×844 à 390×380 conserve le focus et la valeur du vrai input numérique ; validation et prochain exercice restent atteignables par scroll.

La suite `e2e/trainingMobile.spec.ts` (`@mobile @training-mobile`) vérifie Chromium/WebKit, clair/sombre, les douze tailles téléphone/tablette/desktop, invité, compte vide, records multiples, erreur de lecture, niveaux verrouillés/débloqués, textes longs, ancres directes, navigation drawer, feedback, résultats et safe-bottom simulé. Calculer, Mémoriser, Déduire, Faire son annonce et Lire les enchères passent par les écrans réels, sans nouvelle route de test. Les fixtures progressent avec les fonctions existantes ; les tests DB et Duo authentifiés restent les preuves de persistance et de réseau. `tests/trainingUI.test.tsx` couvre les contrats sémantiques des quatre composants partagés. Les captures et mesures comparatives restent dans `.playwright/training-mobile/`, hors Git.

À partir de 1120 px, la densification est désactivée. La composition hub/exercice/résultat et l’impact du score desktop sont conservés. Les enchères gardent leurs connecteurs et leur orientation existante (colonne sous 640 px, ligne ensuite). Pas de dépendance, animation nécessaire au layout, listener de resize, modification de règle, génération, progression, record, XP, Supabase, RPC, PWA ou navigation globale.

Mesures avant/après depuis le main `e216aa6`, standalone simulé, fixture avec tous les niveaux débloqués et plusieurs records compte. Les deux builds attendent le même message de synchronisation impossible avant les captures de résultat. Les hauteurs clair/sombre sont identiques ; les différences d’arrondi entre moteurs restent inférieures à 0,2 px sur le hub.

| 390×844 | Avant | Après |
| --- | --- | --- |
| Header de page | 131,16 px | 120,34 px |
| Début Calculer | 211,16 px | 200,34 px |
| Section header Calculer | ≈130,6 px | ≈99 px |
| Valeur d’un pli, quatre records | ≈411,1 px | ≈347,1 px (−15,6 %) |
| Level track | 44 px | 44 px |
| Gap catalogue | 32 px | 20 px (−37,5 %) |
| Header de session | 148,14 px | ≈115,5 px (−22 %) |
| Résultat avec message de sync, Chromium / WebKit | 481,58 / 481,58 px | 360,39 / 412,39 px |

Deux cards commencent avant le premier fold dans les deux versions ; la card complète de Calculer finit désormais environ 112 px plus haut et une bien plus grande partie de Survie est visible. À 320×568, la card avec quatre records passe de 452 / 431 px à environ 365 px (Chromium / WebKit) et le résultat de 482 à 412 px. Ses actions restent scrollables avec safe-bottom 34 px, comme le vérifient les E2E.

| 844×390 | Avant | Après |
| --- | --- | --- |
| Header de page | ≈118,6 px | ≈84,9 px |
| Section header Calculer | ≈101 px | ≈55,8 px |
| Card Valeur d’un pli avec plusieurs records | ≈370,5 px | ≈309,8 px |
| Header de session | 149,66 px | ≈115,5 px |
| Résultat avec message de sync | 356,78 px | 316,39 px |

En paysage entre 640 et 1119 px, kicker/titre et description des headers du hub occupent deux colonnes ; à 844×390, les niveaux de la première card sont maintenant visibles dès le haut du hub. Les grilles utilisent un minimum de 15 rem par card, sans compresser les vraies cartes de jeu.

Les huit comparaisons desktop (1120×800 et 1440×900, deux thèmes et deux moteurs) conservent exactement les dimensions du header, du heading Calculer, de la card, du level track, du session header et du résultat. Les pixels Training sous le header global sont identiques pour hub/exercice/résultat. Une capture du header global diffère pendant le chargement de la cosmétique de compte de la fixture ; aucun code de navigation ou de cosmétique n’est modifié. Les JSON et les PNG avant/après sont dans `.playwright/training-mobile/before`, `after` et `comparison.json`.

## Multijoueur mobile

`/multiplayer` conserve `AppPageHeader`, son titre, sa description et Préférences. Sous 1120 px, son texte et son action partagent deux colonnes compactes. Les surfaces Créer/Rejoindre utilisent les tokens `--surface-padding` et `--section-gap` ; les marges des formulaires diminuent et Créer partage une rangée avec Modifier les règles. En paysage court, et sur tablette à partir de 700 px, les deux surfaces sont côte à côte. Les états chargement, connexion absente, Supabase indisponible, pseudo manquant, notice et invitations restent ceux des composants existants.

Le champ Code de table conserve uppercase, mono, tracking, `maxLength=12`, required et le callback `findMultiplayerRoom`. Sa police mobile fait 16 px et sa hauteur au moins 44 px. La simulation du clavier 390×844 → 390×380 conserve focus et saisie ; Rejoindre reste atteignable par scroll naturel, au-dessus du safe-bottom. Aucun listener de viewport n’est ajouté.

Dans le lobby, le code h1 et les métadonnées restent en tête. Prêt est primaire avant confirmation ; Pas prêt reste toujours disponible. Pour l’hôte, Lancer la partie devient primaire lorsque le `canStartGame` existant l’autorise. Les gardes `isUpdatingReady` et `isStartingGame` restent natives et inchangées. Inviter des amis reste directement visible lorsque `canInviteFriendsFromRoom` l’autorise. Préférences, Règles, Rafraîchir et le transfert hôte passent dans Plus sous 1120 px ; desktop les conserve dans la toolbar.

Plus annonce « Plus d’actions pour la table », `aria-haspopup="dialog"` et `aria-expanded`. Il ouvre un petit `AccessibleDialog` dans un portal sous body, au-dessus des surfaces à overflow. Tab/Shift+Tab, Escape, verrou du body et restauration du focus réutilisent ce composant. Le trigger reçoit explicitement le focus à l’activation, également dans WebKit, qui ne focalise pas toujours les boutons au clic. Une action ferme Plus avant d’ouvrir le dialog existant. Les configurateurs, permissions, listes de candidats, rafraîchissements et callbacks métier ne changent pas. Les dialogs d’invitation gardent `FriendPresenceList` et son scroller ; le transfert reçoit seulement une classe de présentation en lobby pour les noms longs et les cibles tactiles.

Copier le code utilise `navigator.clipboard.writeText`, puis un textarea temporaire avec commande DOM de copie si l’API est absente ou refusée. Le textarea est supprimé et le focus restauré dans tous les cas. Un verrou local évite une seconde copie pendant la première. La live region réservée annonce Code copié ou Copie indisponible ; le feedback reste affiché, sans timer ni requête. Pas de partage natif ajouté.

Le plateau conserve Bas/Droite/Haut/Gauche, ses quatre cartes et la prise directe d’une place libre. La largeur des slots est bornée selon la largeur du felt. Le pseudo tronqué conserve son texte complet dans `title` ; Toi reste séparé du texte tronqué. Hôte, rang/Placement, présence et Prêt/Pas prêt restent textuels. Les emblèmes sont compacts sur mobile, sans changement de rating ni emblème pour bot. Le felt utilise une grille CSS : quatre colonnes/trois rangées en portrait, trois colonnes/deux rangées en paysage court. Ses bases flex sont 18,75 rem et 11,5 rem ; le minimum intrinsèque réserve la hauteur réelle des cartes et de leurs métadonnées lorsqu’elles passent sur plusieurs lignes. Un test reproduit cette variation de police à 320 px pour un spectateur devant une table pleine. Le lobby occupe l’espace restant en hauteur, puis grandit avec le document lorsque nécessaire. Aucun scroller interne de page, breakpoint JS ou nouveau listener ; la rotation conserve les mêmes cartes DOM, code, place et readiness. WaitingArea utilise une identité tronquée et une action secondaire compacte. Toutes les actions critiques restent au moins 44×44 px, y compris en paysage.

`e2e/multiplayerMobile.spec.ts` utilise les vrais écrans et types avec interception UI des endpoints, dans Chromium/WebKit, clair/sombre : douze tailles, safe-top/bottom et côtés, quatre cartes sans collision, rôles, 1–4 joueurs, états pending, copie clavier/clic/fallback, dialogs, clavier réduit et rotation. À 844×390 avec safe-bottom 34 px et safe-left 44 px, le test borne le header lobby à 90 px, le top du plateau à 155 px et exige les quatre cartes entièrement visibles dans la zone sûre. En portrait 390×844 avec safe-top 47 px, le plateau commence avant 260 px. L’ouverture de Plus n’ajoute pas de lecture de room. Les fixtures UI ne remplacent aucune suite authentifiée Multiplayer/Rating ou Social. Le matcher du projet authentifié exige le tag entier `@multiplayer`, pour distinguer ces quatre vrais E2E du tag `@multiplayer-mobile` ; les deux projets mobile continuent de couvrir toutes les fixtures. Le test foundations existant ouvre désormais Règles via Plus, puis conserve toutes ses assertions de transition lobby → partie, safe areas et résultats.

Les mesures et les 13 captures avant/après par moteur sont dans `.playwright/mobile-multiplayer/baseline` et `current`, hors Git. `e2e/multiplayerMobileCapture.spec.ts` est un outil opt-in (`MULTIPLAYER_CAPTURE=current`), distinct des assertions fonctionnelles. La référence est main `2991d6f`. Les comparaisons ci-dessous utilisent les mêmes fixtures à noms de 40 caractères, sans insets simulés ; les assertions fonctionnelles ajoutent les insets indiqués ci-dessus.

| 390×844 | Avant Chromium / WebKit | Après |
| --- | --- | --- |
| Header landing | 166,16 / 195,31 px | 127,5 px |
| Card Créer | 246 px | 172,5 px |
| Card Rejoindre | 216 px | 202,5 px |
| Top du champ code | 613,16 / 642,31 px | 483,5 px |

| Lobby host seul, 390×844 | Avant Chromium / WebKit | Après |
| --- | --- | --- |
| LobbyHeader | 202 px | 130 px (−35,6 %) |
| Zone actions | 120 px | 44 px |
| Top du plateau | 278 px | 206 px (−72 px) |
| Hauteur du plateau | 352 px | 568 px, utilise l’espace restant |
| WaitingArea | 116 / 136 px | 58 px |
| Top de la première place, Haut | 328 px | 238 px |

| Lobby host seul, 844×390 | Avant | Après |
| --- | --- | --- |
| LobbyHeader | 120,125 px | 82 px (−31,7 %) |
| Top du plateau | 184,125 px | 146 px |
| Hauteur / bottom du plateau | 224 / 408,125 px | 230 / 376 px |
| Quatre positions nommées dans le premier viewport | Non, labels masqués | Oui, quatre cartes complètes |

L’ancien landscape montrait déjà quatre rectangles de places, mais masquait les positions et la présence ; le test exige désormais les quatre cartes et leurs positions textuelles, également avec safe-bottom simulé. Le gain vient du regroupement des actions et de la disposition des cartes, sans réduire les hitboxes à 30 px.

À 1440×900, le header lobby reste à 70 px, le plateau commence à 142 px et garde sa hauteur de 680 px. Les actions passent de 36 à 44 px ; la copie et le readiness textuel sont les changements de présentation partagés avec desktop. Les surfaces landing gardent leur composition desktop. Aucune modification de protocole room, API/RPC/DB, heartbeat/Realtime, intents, invitations, transfert hôte métier, rating, gameplay, portrait lock en partie ou PWA gate.

## Table de jeu mobile

`GameChromeProvider` entoure le header et les pages. `useGameChrome` enregistre explicitement une partie affichée, avec cleanup dans un layout effect au démontage ou à la fin de partie. Le Solo avant démarrage, le lobby Multi et le setup Training ne s’enregistrent pas. La notice portrait d’une partie active conserve l’enregistrement. La navigation vers Accueil restaure `default` avant le prochain paint ; aucun pathname, événement global, observer ou changement direct du body n’active ce mode.

Le wrapper possède `--header-height` et recalcule ses deux valeurs dérivées `--header-shell-height` et `--content-height`. `compact-game` passe à 44 px en portrait téléphone et en paysage court sous 1120 px. Desktop et tablette de hauteur normale gardent 56 px. Logo, navigation, notifications, audio, thème et Menu Partie restent accessibles ; les actions du header gardent 44×44 px. Le gutter de scrollbar est libéré uniquement dans cette présentation de partie sur téléphone.

La scène partagée `GameTable` conserve HUD, quatre PlayerPanel, annonces, pli, animations, main, enchères et dernier pli. Le shell utilise la hauteur dynamique restante, sans 100vh ajouté. En paysage de hauteur <=500 px, le shell réserve safe-left/right/bottom une seule fois, sans marges supplémentaires. Les contrôles utilisent cette zone sûre. Les deux rails latéraux réservent les joueurs et leurs métadonnées : gauche puis bas sur le rail gauche, haut puis droite sur le rail droit. Ce placement libère le centre pour les enchères et les quatre cartes du pli. Les noms tronqués conservent leur texte complet en `title`, comme le contrat HUD et le résultat du dernier pli. Hôte, présence, Bot temporaire, rang, emblème, P et timer restent présents. Le panneau d’aide de manche demeure masqué en paysage immersif.

La main est centrée à chaque nombre de cartes. Ses cartes de 48 px de largeur sont séparées par 3 px : chacune expose une vraie cible >=44 px, sans overlap. Leur hauteur de présentation est bornée entre 44 et 56 px selon la hauteur dynamique disponible ; la préférence enregistrée et les cartes desktop ne changent pas. La légalité, les highlights, le dimming, le refus de clic illégal et le message métier restent ceux de HumanHand ; le feedback inScene reçoit seulement une position compacte au-dessus de la main.

`coinche-bidding-layout`, `values`, `modes` et `actions` structurent les vrais boutons existants. En paysage court : valeurs sur cinq colonnes, modes sur trois colonnes, puis une rangée d’actions. Neuf valeurs et six modes tiennent sans scroller. Sans valeur numérique, les modes utilisent toute la largeur sur six colonnes et le message existant reste visible. Tous les boutons de scène ont un minimum de 44×44 px. Le contrat est borné et tronqué, avec son texte complet dans title. Les confirmations couvrent temporairement le panel sans changer sa géométrie ; son layout devient inert. Escape, Annuler/Confirmer et restauration du trigger conservent les callbacks existants. Aucune règle d’enchère, initialisation de mode ou préférence de confirmation ne change.

Ramasser le pli et Dernier pli occupent deux zones libres au-dessus de la main, avec 44 px de hauteur. Le dernier pli conserve quatre cartes, gagnant, points, ordre de jeu et Fermer dans une surface bornée. Les timings, clés de présentation, animations d’arrivée et de collecte, reduced motion et carte optimiste Multi restent ceux du composant.

La notice portrait utilise surface/border/text/accent et le texte « Passez en mode paysage pour jouer confortablement à la contrée. ». Elle remplace la table interactive et consomme les insets du shell si elle est imbriquée. Les observateurs d’orientation existants sont conservés ; seule leur couverture de paysage court inclut 932 px. La rotation ne démarre pas de partie, ne recharge pas de session et n’envoie pas d’intent.

Solo, Multi et Training utilisent ces mêmes composants et styles. Le scheduler Training, sa révélation à 600 ms, son grading et sa pause restent inchangés. Une correction minimale de layout de sa question numérique ajoute trois classes sémantiques : en paysage court, cartes et saisie occupent deux colonnes, le clavier six colonnes de cibles >=44 px et les marges se réduisent. La question et la correction tiennent avec safe-left 44 / bottom 34 dès 568×320 ; la logique et les autres questions restent identiques. Les dialogs existants gardent leur safe-area primitive, focus et verrou temporaire de scroll. Le PWA gate, le service worker et les primitives offline restent inchangés.

Les suites `mobileGame`, `mobileGameInteractions`, `mobileGameAccessibility` et `mobileGameEdgeCases` portent `@mobile @game-mobile`, dans Chromium et WebKit. Elles vérifient 568×320, 667×375, 844×390, 932×430, clair/sombre, notch à gauche/droite, bottom 21/34, géométrie dynamique réduite, cibles, collisions, clics première/milieu/dernière carte, main 8→1, confirmations, rotation, cleanup, fin de partie et un vrai Solo anonyme 8→7. Elles s’ajoutent aux suites métier authentifiées Multi/Rating et à l’ensemble mobile existant. Les captures et JSON avant/après sont hors Git dans `.playwright/validation/game`. La limite du workflow mobile passe à 45 minutes pour conserver toute la matrice sur un seul worker CI.

Mesures Chromium Solo sombre, safe-left 44 / right 0 / bottom 34, avant sur `4b3dc50` et après avec les mêmes insets :

| Mesure (px) | 568×320 avant → après | 844×390 avant → après |
| --- | --- | --- |
| Header | 56 → 44 | 56 → 44 |
| Shell / content-height effectif | 264 → 276 | 334 → 346 |
| Hauteur GameTable | 222 → 242 | 292 → 312 |
| BiddingPanel (x, y, largeur, hauteur) | (108, 64, 381, 124,69) → (116, 66, 380, 158) | (176,5, 90,52, 520, 124,69) → (116, 66, 656, 158) |
| Hauteurs valeurs / modes / actions | 28 / 38 / 26 → 44 / 44 / 44 | 28 / 38 / 26 → 44 / 44 / 44 |
| Main (x, y, largeur, hauteur) | (144,48, 206, 308,02, 72) → (103,5, 226, 405, 56) | (302,48, 220, 268,02, 128) → (241,5, 296, 405, 56) |
| x première / dernière carte | 156,73 / 382,60 → 103,5 / 460,5 | 294,73 / 520,76 → 241,5 / 598,5 |
| Distance première à safe-left / dernière à safe-right | 112,73 / 128,21 → 59,5 / 59,5 | 250,73 / 266,05 → 197,5 / 197,5 |
| Pli (x, y, largeur, hauteur), pendant enchères | (232, 97,73, 133, 119) → (244,25, 71,75, 123,5, 110,5) | (370, 127,13, 133, 119) → (382,25, 106,75, 123,5, 110,5) |

Le gain vertical de table est de 20 px : 12 px de header et 8 px de marge supérieure. Le panneau gagne 33,31 px de hauteur pour porter toutes ses cibles à 44 px ; la main expose 48 px par carte au lieu d’environ 32 px entre cartes superposées. Les positions détaillées des quatre joueurs et du pli en jeu sont conservées dans les JSON et captures. La largeur de table gagne aussi le gutter de 15 px ; à 844 px, le padding horizontal de scène précédent est supprimé. La notice portrait a un header de 44 px hors safe-top ; les pages ordinaires et desktop gardent 56 px hors safe-top.
