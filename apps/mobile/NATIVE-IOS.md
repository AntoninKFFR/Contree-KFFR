# KFFR iOS : passage au binaire dédié en paysage

Décision produit du 18 octobre 2026, PR #145 conservée en draft. Le propriétaire
a validé sur iPhone 15 / iOS 27.0.1 les deux sens paysage, le pseudo, les safe
areas, la connexion/déconnexion et le clavier de la version Expo Go. Cette QA
reste acquise pour le lot inchangé ; elle ne prouve pas le lancement d'un nouveau
binaire natif. L'objectif produit est une application qui ouvre directement la
table en paysage, même lorsque le téléphone est tenu verticalement, sans étape
« Tourne ton iPhone ».

## Audit de la version précédente

Sur `f5bad740aca2757a67dee5974d580807ffef0e9e` :

| Niveau | Valeur observée | Portée |
| --- | --- | --- |
| Expo | `orientation: landscape` | Génération native / manifeste |
| Plugin ScreenOrientation | `initialOrientation: LANDSCAPE` | Info.plist du binaire construit |
| Stack Router | `orientation: landscape` | Contrôleurs natifs des écrans |
| Runtime | `supportsOrientationLockAsync` puis `lockAsync(LANDSCAPE)` | Demande à UIKit au montage et retour actif |
| Modales | `landscape-left`, `landscape-right` | Orientations autorisées des modales |
| Info.plist évalué par Expo | Deux orientations paysage, masque initial paysage | Déjà correct pour la liste d'orientations |
| Autres valeurs générées | `UIRequiresFullScreen: false`, bundle ID placeholder, aucun scene manifest | Préparation native incomplète |

Il ne manquait donc pas un appel JS de verrouillage. Les config plugins sont
appliqués lors de la génération/compilation de **notre** application ; ils ne
réécrivent pas l'Info.plist de l'application Expo Go installée depuis l'App Store.
Expo Go peut traiter certaines demandes d'orientation à l'exécution, mais ne
permet pas de valider notre configuration de lancement native.

Dans le module installé `expo-screen-orientation` 57.0.3,
`supportsOrientationLockAsync` vérifie la validité du masque pour le matériel.
`lockAsync` enregistre ce masque et déclenche une demande native ; sa promesse ne
constitue pas un accusé de rotation effective de la fenêtre. Le registre appelle
`requestGeometryUpdate` sans remonter son éventuel refus UIKit à cet appel JS.
Un résultat positif ou une promesse résolue ne prouvent donc pas le verrouillage.

La vidéo/QA montre une fenêtre portrait dans Expo Go ; nous n'avons ni le
numéro exact du binaire Expo Go ni un diagnostic UIKit de ce refus particulier.
Attribuer précisément cet essai à une erreur iOS spécifique serait une hypothèse.
Les limites du conteneur et de la plateforme sont établies ; un test du propre
binaire est nécessaire pour départager leur effet sur cet iPhone.

Sources : [config native du module](https://docs.expo.dev/versions/v57.0.0/sdk/screen-orientation/),
[development builds](https://docs.expo.dev/develop/development-builds/introduction/).

## Configuration préparée

- `ios.bundleIdentifier: com.antoninkffr.kffrcontree.dev` : identifiant de
  développement proposé, **non enregistré chez Apple**, à confirmer avant la
  première signature. Aucun identifiant de production ni projet EAS inventé.
- `supportsTablet: false` : cible iPhone. Cela n'interdit pas à iPadOS d'exécuter
  ultérieurement une application iPhone en mode de compatibilité.
- `UISupportedInterfaceOrientations` et sa variante `~ipad` contiennent
  **uniquement** `UIInterfaceOrientationLandscapeLeft` et
  `UIInterfaceOrientationLandscapeRight`. Aucun portrait déclaré.
- `EXDefaultScreenOrientationMask: UIInterfaceOrientationMaskLandscape`, produit
  par le plugin officiel ; Stack et modales conservent les mêmes restrictions.
- `requireFullScreen: true` produit `UIRequiresFullScreen: true`. Aucun
  `UIRequiresFullScreenIgnoredStartingWithVersion` n'annule cette préférence.
- `expo-dev-client ~57.0.20` : outils nécessaires au client KFFR dédié ; lancement
  du dernier projet utilisé lorsque Metro est joignable. Au premier démarrage,
  ou serveur indisponible, son lanceur de développement peut apparaître. Ce
  client n'est pas encore une application finale autonome/offline.
- `expo-build-properties` compatible SDK 57, avec `ios.enableSceneSupport: true` :
  adoption officielle des scenes UIKit. Expo 57.0.30 inclut le runtime requis.
  Le plugin génère le scene manifest et adapte l'AppDelegate à
  `ExpoReactNativeFactoryProvider` / `EXExpoAppSceneDelegate`.
- `eas.json` contient seulement `development` (iPhone signé en interne) et
  `development-simulator` (simulateur, non installable sur iPhone). Aucune
  configuration Submit, TestFlight, production ou mise à jour OTA ajoutée.

Les profils épinglent `macos-tahoe-26.6-xcode-27.0`, image stable répertoriée par
Expo le 18 octobre 2026. L'alias SDK 57 utilise alors Xcode 26.6 ; ce choix
explicite permet d'évaluer le comportement d'un binaire lié au SDK iOS 27.
La compilation réelle et la compatibilité de toutes les dépendances avec cette
image restent à prouver : aucune compilation Xcode n'a été lancée.

Sources : [opt-in scenes SDK 57](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27),
[DevClient SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/),
[images EAS](https://docs.expo.dev/build-reference/infrastructure/#ios-server-images).

## Limites iOS 27 à conserver dans le diagnostic

En plein écran sur un iPhone physique, les orientations déclarées et le masque
initial sont la voie native pour demander l'ouverture en paysage. Elles doivent
être vérifiées sur le binaire signé, pas sur Expo Go ni sur un export JavaScript.

Dans les environnements redimensionnables (notamment iPhone Mirroring et app
iPhone exécutée sur iPad), iOS 27 peut traiter l'orientation comme une préférence.
L'orientation annoncée peut rester portrait alors que la fenêtre est large.
`lockAsync` ne garantit pas que le système acceptera sa demande.

Apple précise aussi une nuance pour les jeux : avec un binaire lié au SDK iOS
27 et `UIRequiresFullScreen = YES`, le système utilise un redimensionnement par
étapes, en tenant compte des orientations déclarées. Ce n'est ni l'ancien
opt-out universel du redimensionnement, ni une garantie que toute fenêtre reste
en paysage. La clé est dépréciée ; ne pas la présenter comme un verrou éternel.
Même `prefersInterfaceOrientationLocked` est une préférence que le système
peut refuser ; remplacer notre demande par un autre appel n'apporterait pas
la preuve manquante.

Les écrans utilisent déjà les dimensions de fenêtre, pas l'orientation du capteur.
Aucune transformation `rotate`, aucune inversion artificielle des axes et aucune
nouvelle boucle de verrouillage ne sont ajoutées. Le rendu validé, le clavier,
les safe areas et l'authentification restent inchangés.

Le guard actuel reste une **protection du banc Expo Go pendant la préparation**,
pas la solution produit. Il n'est pas supprimé pour cacher un échec natif ou
exposer une interface cassée. Si un binaire dédié affiche encore ce guard lors
du scénario plein écran cible, le critère produit est en échec : collecter la
géométrie et le diagnostic UIKit, puis corriger la cause avant toute livraison.
Le comportement hors plein écran devra être évalué séparément ; sa compatibilité
universelle n'est pas annoncée.

Sources : [limites Expo iOS 27](https://docs.expo.dev/versions/latest/sdk/screen-orientation/#orientation-locks-on-ios-27-and-later),
[Apple TN3192](https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key),
[Apple WWDC26 : jeux et orientation](https://developer.apple.com/videos/play/wwdc2026/278/).

## Choisir la voie de compilation

| Voie | Prérequis | Permet de tester l'iPhone 15 ? |
| --- | --- | --- |
| Expo Go depuis Windows | Expo Go compatible SDK 57 | Oui pour l'UI ; aucune preuve de notre lancement natif |
| EAS development build depuis Windows | Compte Expo/projet EAS, accès à une équipe Apple Developer Program, signature et appareil enregistré, Developer Mode sur iPhone | Oui, après autorisation et installation du binaire signé |
| Compilation locale Xcode sur Mac | Mac/Xcode 27, iPhone, Apple Account ; Personal Team possible pour test personnel | Oui ; sans adhésion payante pour ce test local, sous les limites Apple |
| Build simulateur EAS | Compte/projet Expo, Mac pour exécuter le simulateur ; pas de signature appareil requise | Non, le résultat ne s'installe pas sur l'iPhone |

La Personal Team gratuite Xcode impose notamment un reprovisionnement après
7 jours et des limites d'apps/appareils. Elle ne remplace pas les identifiants
de signature exigés par la voie EAS iPhone. Aucun achat, enregistrement d'appareil,
création de certificat ou installation n'est réalisé dans cette préparation.

Sources : [EAS iPhone physique](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/),
[compilation locale Expo](https://docs.expo.dev/develop/development-builds/introduction/#build-locally),
[Apple Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account#enable-a-personal-team-in-xcode).

## Plan après décision du propriétaire — commandes non exécutées

1. Choisir EAS depuis Windows ou Xcode sur Mac, confirmer le bundle ID de
   développement et les droits de signature. Ne pas acheter automatiquement
   d'adhésion. La création/l'association du projet EAS et l'enregistrement de
   l'iPhone nécessitent cette décision ; aucun `extra.eas.projectId` factice.
2. Préparer les mêmes paramètres **publics** Supabase KFFR pour l'environnement
   EAS `development` ou le `.env` local ignoré. Ne jamais utiliser de secret
   serveur, changer Auth/RLS, ni publier le `.env`. Un nouveau bundle ID a son
   propre stockage : se reconnecter au même compte KFFR, sans créer de compte.
3. Depuis `apps/mobile`, après autorisation de la compilation/signature :

   ```powershell
   # Voie EAS iPhone, après association du projet et enregistrement de l'appareil
   npx eas-cli@latest build --platform ios --profile development

   # Une fois le client KFFR signé installé et Developer Mode activé
   npm run tunnel:dev-client
   ```

   Ouvrir le lien dans **KFFR**, et non dans Expo Go ; le QR de l'ancien tunnel
   Expo Go n'installe pas ce client. Le serveur Metro reste nécessaire au debug.
   Pour la voie Mac, utiliser `npx expo run:ios --device` avec l'équipe Xcode
   choisie ; cette commande compile et installe, elle n'a pas été exécutée ici.
4. Inspecter le plist du **.app/.ipa réellement produit**, son bundle ID, ses
   deux orientations, son scene delegate et l'image/SDK de compilation dans
   les logs. Les sources générées ne suffisent pas à prouver le contenu signé.
5. Tester spécifiquement le nouveau binaire : lancement à froid et reprise
   alors que l'iPhone est tenu verticalement, verrouillage portrait système
   activé/désactivé, arrivée directe sur KFFR en paysage sans écran de rotation,
   deux sens, modale clavier et retour de suspension. Les contrôles auth/clavier
   acquis sous Expo Go restent la référence, mais le cycle de vie natif changé
   impose un contrôle de non-régression de ce nouveau binaire.
6. Si le système refuse : relever version/build, fenêtre réelle, contexte
   plein écran ou Mirroring et erreur UIKit ; ne pas masquer le refus en
   supprimant le guard. Aucune fusion avant décision du propriétaire. Un binaire
   final autonome sans lanceur de debug sera un lot ultérieur autorisé.

## Vérifications reproductibles sans compte Apple

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:geometry
npm run native:check
npx expo install --check
npx expo-doctor
npm run export:ios
git diff --check
```

`native:check` évalue les mods Expo réels et vérifie le plist, le scene manifest
et les profils EAS. Il n'appelle aucun service de signature. La CI Ubuntu
exécute en plus `expo prebuild --platform ios --no-install`, vérifie le plist
écrit, le démarrage via scene delegate et les cibles Xcode iPhone, puis conserve
les sources dans l'artefact `ios-native-configuration`. Aucun Xcode, CocoaPods,
build EAS, certificat ou `.ipa` n'est produit par ce contrôle.

La génération iOS par `expo prebuild` est refusée sous Windows par la CLI SDK
57 : l'essai dans une copie isolée est conservé localement comme tel, sans le
présenter comme réussi. L'introspection fonctionne localement ; la génération
des vrais fichiers est vérifiée sur le runner Linux. Ces preuves ne remplacent
pas une compilation et un lancement du véritable binaire iOS.
