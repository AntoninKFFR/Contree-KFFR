# Fondations viewport et safe areas

L’issue #118 pose le shell mobile commun à Safari iPhone et au futur mode standalone. **#119 ajoutera ensuite le gate PWA obligatoire sur téléphone** : navigateur téléphone → installation obligatoire, standalone téléphone → app, desktop → web normal. Aucun manifest, service worker, prompt, gate ou détecteur téléphone/standalone n’est ajouté ici. L’icône Apple déjà présente dans `main` reste inchangée.

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

Les primitives utilisent les insets fournis par le navigateur sans supposer leur valeur ou le côté du notch. Elles fonctionnent avec les changements de viewport CSS et pourront être réutilisées telles quelles par #119 en standalone. Les refontes navigation, densité, pages et table restent dans #120–#126 ; aucun gameplay ou modèle métier ne change ici.

Références : [Viewport Next.js](https://nextjs.org/docs/app/api-reference/functions/generate-viewport), [unités de viewport CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length), [safe areas WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).
