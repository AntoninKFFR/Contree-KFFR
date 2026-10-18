# Solo iPhone — première tranche fonctionnelle (#148)

Le bouton Solo ouvre un véritable écran React Native. La partie reste sur le même
serveur que le Solo web : enchères à la couleur de 80 à 160, passer, tours des bots,
sélection/pose d’une carte, manche suivante et résultat serveur sont implémentés.
La table native représente les adversaires à l’Ouest et à l’Est, le partenaire au
Nord et le joueur au Sud. Les dos de cartes suivent exactement les comptes publics
du serveur ; les cartes jouées occupent la position de leur joueur au centre du pli.
Le contour doré désigne le joueur dont c’est le tour. Les mains adverses restent
inconnues. VoiceOver annonce place, rôle, nombre de cartes masquées et cartes publiques.
Multijoueur et Entraînement restent désactivés. Accueil et Profil conservent leur
composition validée, sans barre inférieure.

## Transport et autorité

`src/solo/api.ts` appelle uniquement `https://contree-kffr.vercel.app`, origine
vérifiée dans le champ homepage du dépôt et par un GET sans authentification sur
le chemin Solo (401 attendu, sans redirection). Aucun test n’a créé de partie dans
la base de production.

- `POST /api/solo/sessions` : démarrage volontaire, preset `contree-kffr` et UUID
  `startKey` durable. La RPC existante déduplique cette clé par utilisateur.
- `GET /api/solo/sessions/:sessionId` : reprise et réconciliation explicites.
- `POST /api/solo/sessions/:sessionId` : intention et `expectedVersion` courant.
- `Authorization: Bearer …` provient de la session vérifiée par l’AccountProvider
  existant. L’authentification serveur et les règles de propriété sont inchangées.

Le contrat est partagé par **imports TypeScript uniquement**. Aucun moteur, bot,
calcul de légalité ou calcul de score n’est exécuté dans l’application. Le parseur
valide et projette seulement les champs affichés ; il refuse notamment les mains
privées complètes et les cartes/versions/identifiants invalides. La main n’évolue
qu’après une réponse serveur validée. Le pli courant, ou le dernier pli terminé,
provient aussi de cette réponse.

`src/solo/tsconfig.json` fournit une configuration TypeScript portable aux trois
modules purs (API, contrat, contrôleur). Vitest web peut ainsi tester leur véritable
code sans résoudre `expo/tsconfig.base` ni installer Expo à la racine. Le projet
mobile conserve son typecheck complet indépendant, y compris le hook et l’adaptateur
Expo ; aucun contrôle ni test n’est désactivé pour contourner cette séparation.

## Sauvegarde, erreurs et cycle de vie

Un unique enregistrement AsyncStorage `kffr-native-solo:v1:<userId>` contient
seulement `{sessionId, startKey}`. Ni main ni jeton supplémentaire n’y est conservé.
L’ouverture de Solo fait au plus un GET du dernier identifiant de cet utilisateur :
elle ne crée aucune partie et n’avance aucun bot avant « Reprendre ».

La clé de création est persistée avant le POST. Après un résultat incertain,
un nouvel appui sur « Nouvelle partie » réutilise cette clé. Aucun POST n’est
réessayé automatiquement. Remplacer une partie sauvegardée demande confirmation
et ne supprime pas l’ancienne partie du serveur. Seul un GET répondant 404 efface
l’identifiant local ; une panne, un 401 ou une réponse mal formée le conservent.

Un verrou synchrone bloque les doubles actions. Une mutation doit renvoyer une
version strictement supérieure ; les états plus anciens sont rejetés. Un échec
réseau/version demande un GET avant de rejouer. Un refus de carte ou d’enchère
laisse la partie affichée et propose les détails ainsi que « Recharger ».
Un 401 déclenche la revérification du compte existant.

Le changement de compte/jeton, la sortie de Solo et l’arrière-plan invalident et
annulent les requêtes ; les réponses tardives ne réaffichent pas la main. Les bots
sont sollicités un à un, seulement lorsque Solo est actif. Après l’arrière-plan,
le compte est revérifié, la sauvegarde relue et « Reprendre » reste explicite.

## Dépendance justifiée

`expo-crypto ~57.0.4` fournit `randomUUID()` pour la clé de création durable, sans
générateur basé sur `Math.random`. Installation par `expo install`, version
SDK 57 et inclusion dans Expo Go vérifiées dans la
[documentation officielle](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/).
Il n’est pas nécessaire de reconstruire Expo Go. Aucun import direct
`expo-modules-core` ni exception Expo Doctor n’est ajouté.

Les limites AsyncStorage et la dette de dépendances existantes restent celles de
[SECURITY.md](SECURITY.md). Aucun changement Supabase, SQL, RLS, serveur Auth,
progression, moteur, règle, compte ou donnée de production n’est introduit.
Les sauvegardes/progressions continuent d’être traitées par le service existant.

## Tester avec Expo Go SDK 57

1. Ouvrir le QR du tunnel de cette branche avec Expo Go compatible SDK 57.
2. Se connecter avec son compte KFFR habituel et ouvrir Solo.
3. Sans sauvegarde locale, constater qu’aucune partie n’est créée ; appuyer sur
   « Nouvelle partie » seulement pour jouer volontairement.
4. Annoncer une enchère à la couleur ou passer. Attendre les tours des bots,
   sélectionner une carte puis « Poser la carte ». Le serveur décide sa légalité.
5. Ouvrir « Table » pour les vrais joueurs, comptes de cartes, enchères et résultat.
   Continuer avec « Manche suivante » après un résultat de manche.
6. Retourner à l’accueil, rouvrir Solo puis « Reprendre ». Tester aussi fermeture/
   réouverture et arrière-plan, et vérifier l’absence de double action au tap répété.

Pour démarrer localement : `npm ci`, config publique Supabase existante selon le
[README](README.md), puis `npm run tunnel -- --port 8088`. Le QR n’intègre aucun
identifiant Supabase. Aucun achat ni compte Apple Developer nécessaire.

Les tests automatisés utilisent exclusivement un transport/stockage de test.
Le test racine `tests/mobileSoloTransport.test.ts` fait jouer le client contre
le **véritable moteur et les véritables bots serveur en mémoire**, sans base.
Il vérifie la fin de partie, les scores, le refus d’une carte illégale, la reprise
et une nouvelle manche. Jest couvre les vrais écrans/routeur/hooks natifs avec
transport simulé. Playwright couvre géométrie, rotations, erreurs et grandes polices.
Les [captures](docs/solo-148/README.md) montrent ces vrais composants via RN Web.

## Limites et prochaines fonctionnalités

- Première tranche : enchères à la couleur uniquement. Annonces sans/tout atout,
  capot, générale, coinche/surcoinche et éditeur de règles restent à intégrer côté UI.
  Leurs valeurs éventuelles provenant des bots sont affichées, sans changer le moteur.
- L’API ne fournit pas de liste des cartes légales. Toutes les cartes de la main
  sont sélectionnables au tour humain ; le serveur refuse une pose illégale.
  Aucun faux filtrage local. Une aide visuelle autoritaire nécessiterait un contrat
  serveur supplémentaire dans un lot séparé.
- La reprise découvre la dernière partie sauvegardée **sur cet appareil et ce compte**.
  Il n’existe pas d’endpoint de liste pour retrouver automatiquement une partie
  commencée sur le web ou un autre appareil.
- Les places, mains masquées et cartes publiques sont sur le tapis ; noms complets,
  enchères et résultat détaillé sont dans « Table ». Animations de distribution/
  ramassage, historique complet des plis, préférences, statistiques et progression
  détaillée à l’écran restent à développer.
- Pas de polling hors écran, de fonctionnement hors ligne ou de résolution de
  conflit automatique entre deux appareils. Une version refusée demande « Recharger ».

QA physique iPhone encore nécessaire pour ce nouveau Solo : deux paysages et
Dynamic Island, huit cartes au toucher, grandes polices/VoiceOver, interruptions
réseau, reprise de compte et confort de lecture. Les validations du socle ne
valident pas ce nouvel écran ; ni l’export iOS ni RN Web ne remplacent cet essai.
Le fallback Expo Go « Tourne ton iPhone » et la configuration native restent conservés.
