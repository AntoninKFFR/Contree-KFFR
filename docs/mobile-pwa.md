# Fondations viewport et safe areas

L’issue #118 pose le shell mobile commun à Safari iPhone et au mode standalone. L’issue #119, décrite ci-dessous, ajoute le gate PWA obligatoire sur téléphone : navigateur téléphone → installation obligatoire, standalone téléphone → app, desktop/tablette → web normal. L’icône Apple déjà présente dans `main` reste inchangée.

## Audit et modèle global

L’audit de `layout`, `globals.css`, `AppTopNav`, `AppShell` et `MobileLandscapeNotice`, puis des pages Accueil, Friends, Training, Multiplayer, room/lobby, Solo et des overlays, a identifié des soustractions `56px`, `3.5rem`, `4rem`, `112px` et un ancien `48px` dans le lobby. Elles empêchaient l’ajout d’une safe area supérieure. `AppPage` masquait aussi les débordements et créait un contexte de scroll qui gênait les éléments sticky.

Le document possède le scroll des pages normales. `html`, `body` et le root ont une hauteur **minimum** dynamique et le même fond `--app-bg`, défini avant hydratation par le bootstrap thème existant. Les pages peuvent grandir sans plafond. Il n’y a aucun `overflow-x: hidden/clip` global. Les scrollers locaux restent explicites : listes d’amis, choix d’enchères, règles, paramètres, popovers et menu mobile. Les petits paysages du lobby reviennent au flux naturel pour éviter l’écrasement des sièges ; la scène de jeu conserve son shell contraint.

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

AppPage conserve 20/28 px d’espacement bas selon le breakpoint et **ajoute** safe-bottom. Aucun forfait de 100 px : le chrome navigateur est traité par `dvh`, le Home Indicator par l’inset. Le dernier contenu est atteignable en scrollant le document. Les modales réservent le bas du panneau et peuvent faire défiler leur contenu interne ; les footers restent dans la zone sûre. Le menu mobile verrouille temporairement le document, possède son seul scroll et restaure le document à la fermeture ou au passage desktop. `lib/ui/bodyScrollLock.ts` partage ce verrou avec les modales : des ouvertures simultanées ne peuvent ni libérer le document trop tôt, ni le laisser bloqué après Escape. Les popovers audio, de partie et notifications sont bornés par la hauteur disponible et les insets latéraux.

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

Les PNG opaques `/pwa/icon-192.png` et `/pwa/icon-512.png` sont des réductions du médaillon `public/brand/kffr-icon-master.png`, aplaties sur le fond KFFR. Le logo de l’application n’est pas modifié. L’icône Apple 180×180 existante (`app/apple-icon.png`) reste la source canonique Next.js. Aucun maskable déclaré : le master n’offre pas la marge sûre nécessaire.

Metadata Next.js : `appleWebApp.capable=true`, titre `KFFR`, status bar `black-translucent`. Next 15 émet la balise canonique `mobile-web-app-capable=yes`, les balises Apple titre/status bar et le lien Apple icon. `themeColor` est dans l’export `Viewport`. Le viewport #118 est inchangé et unique ; zoom conservé. La couleur native de lancement est fixe et cohérente avec le shell sombre ; le thème de contenu reste celui des préférences.

### Détection centralisée

`lib/pwa/environment.ts` ne lit ni largeur ni orientation. Les exceptions tablettes sont identifiées en premier : iPad, iPadOS UA Mac avec plusieurs points tactiles, Android sans signal Mobile, autres UA tablet explicites. Pour les appareils restants, `userAgentData.mobile` prime lorsqu’il existe, puis fallback iPhone/iPod, Android Mobile et autres téléphones connus. Le tactile seul ne transforme jamais un laptop Windows en téléphone. Un iPhone 932×430 reste téléphone lors de toutes les rotations.

L’accès standalone dépend exclusivement de `(display-mode: standalone)` **ou** `navigator.standalone === true`. Le média est écouté et peut changer sans reload ; `pageshow` réévalue également le contexte. Ni URL, cookie, localStorage, événement d’installation ni flag produit ne peuvent accorder l’accès. Les simulations sont injectées dans les APIs navigateur par les tests uniquement.

Les UA restent une approximation : navigateur qui falsifie son identité, mode bureau forcé ou appareils inconnus peuvent être mal classés. La V1 privilégie l’absence de blocage accidentel d’une tablette. Ce gate est une décision UX, pas un contrôle d’autorisation backend ; Supabase et les routes API conservent leurs protections.

### UX iOS

L’écran utilise les quatre variables safe-area et `coinche-fullscreen-safe` de #118. Logo, vrai h1, étapes ordonnées, couleurs KFFR et contraste des thèmes. En petit paysage, deux colonnes compactes ; les petits portraits peuvent faire défiler explicitement l’écran, sans agrandir le document.

Étapes affichées :

1. Appuie sur le bouton Partager de Safari.
2. Choisis « Sur l’écran d’accueil ».
3. Appuie sur « Ajouter ».
4. Ouvre ensuite KFFR depuis son icône.

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
3. Appuyer sur Partager.
4. Choisir « Sur l’écran d’accueil » ; laisser « Ouvrir comme app web » activé si proposé.
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
