# Quatre corrections après le test physique — PR #152

Référence avant correction : `8d1ac9d98c81840401a36b3a401bd06a76b8d60a`, branche `feat/151-ios-multiplayer`. Le SHA livré et les résultats CI au SHA exact figurent dans la [PR DRAFT #152](https://github.com/AntoninKFFR/Contree-KFFR/pull/152). Aucun merge, changement de moteur, backend, SQL, RLS ou Auth, ni déploiement de production.

Le propriétaire a validé sur iPhone Expo Go et PC, avec deux comptes, la création/connexion au salon, les enchères, les cartes, la synchronisation, la reprise et une manche complète. Les corrections ci-dessous ont été vérifiées automatiquement ; leur confort tactile et leur fluidité sur iPhone restent à revalider. Les futures captures de fin de partie sont hors de ce correctif.

## Causes et changements

| Défaut | Cause démontrée | Correction |
| --- | --- | --- |
| Places difficiles à toucher | Après un conflit de réservation, le bandeau absolu à `top: 50`, `zIndex: 70`, masque la place du haut et intercepte son centre. Les cibles faisaient 128 × 54 et n’indiquaient pas la réservation en cours. | Message dans l’en-tête du lobby, sans chevauchement ; décor non interactif, cibles réelles 128 × 64 minimum, hitSlop 4 et rétention 16. Retour pressé immédiat, « Réservation… », état accessible, verrou contre le double appui. « Moi » seulement après confirmation serveur. |
| `local-supabase` rouge | Les artifacts exacts du [run 39593013996](https://github.com/AntoninKFFR/Contree-KFFR/actions/runs/39593013996), job `119198400851`, montrent **« Chargement… »** à l’assertion : la liste avait été démontée entre les assertions de texte et le `.count()` immédiat. La classe CSS existe et les couleurs sont correctes. | Même assertion de cardinalité, attendue avec `toHaveCount(1)`. Reproduction déterministe supplémentaire du rafraîchissement SDK de la même session, snapshot local suspendu puis relâché. Aucun timeout augmenté, retry ajouté, test retiré ou changement de produit/Auth. |
| Regroupement saccadé Solo et Multi | À chaque retrait, les cartes conservées changent immédiatement de `left` de 22,5 px alors que seule leur transformation est interpolée. Les nœuds conservent pourtant leur identité. | Ancres `left: 0`, `top: 0` stables ; toute la position X/Y de l’éventail entre dans le transform Reanimated. Même durée 160 ms, même courbe et mêmes cartes ; vol provisoire 180 ms préservé et coordonnées équivalentes. Pas d’animation pilotée par setState à chaque frame. |
| Tri pendant les enchères | Le contrat définitif est encore null ; `resolveContractMode(game)` produit le repli standard. L’audit retrouve aussi ce comportement dans les deux pages web. | Helper partagé **d’affichage seulement** `handDisplayMode` : contrat effectivement annoncé via `getCurrentContractFromBids`, puis contrat final en jeu. Une couleur seulement sélectionnée ne trie pas la main. Légalité et moteur restent sur leurs helpers existants. |

La réservation/changement direct de place utilise uniquement `join-seat` et l’arbitrage existant. Une place occupée n’envoie rien. Lors d’une réservation concurrente, un 409 puis le GET autoritaire montrent l’autre joueur sur la place prise ; l’utilisateur conserve sa place et peut choisir explicitement une autre place libre. Aucune mutation n’est rejouée.

Le tri reste `J, 9, A, 10, K, Q, 8, 7` à l’atout et `A, 10, K, Q, J, 9, 8, 7` hors atout. Sans annonce, le repli existant est conservé. Surenchère, SA, TA, passe, coinche, surcoinche, contrat confirmé, tri manuel, regroupement et ordre personnalisé des couleurs sont couverts. Aucun nouvel ordre de force n’est inventé.

## Preuves visuelles et mesures

Les planches assemblent uniquement des captures des véritables composants, avec transport/comptes de test. **RN Web n’est pas iOS matériel.** La référence avant correction charge les trois composants mobiles originaux par `git show` au SHA ci-dessus, dans le même harness et avec les dépendances courantes. Ce n’est pas la reproduction de tout l’environnement logiciel historique. Les fonctions de test restent exclues du bundle natif.

- Lobby avant/après : [568 × 320](ios-fixes/lobby-568.png), [844 × 390](ios-fixes/lobby-844.png), [932 × 430](ios-fixes/lobby-932.png). Chaque planche montre les deux côtés de safe area ; les assertions touchent effectivement les quatre places, avec 216 points de hit-test dans leurs surfaces visibles.
- [Bandeau avant/après](ios-fixes/lobby-banner.png) : la place du haut reste lisible, sans superposition, et le toucher déclenche la deuxième réservation attendue. Le test couvre les trois tailles et les deux côtés.
- [Main 8 → 1 Solo et Multi](ios-fixes/hand-sequence.png), [échantillons intermédiaires avant/après](ios-fixes/hand-intermediate.png). Les recadrages sont signalés ; une image fixe ne prouve pas la fluidité.
- [Tri sans annonce, cœur puis trèfle](ios-fixes/sorting-suit.png), [SA, TA et contrat confirmé](ios-fixes/sorting-modes.png). Les quatre viewers sont vérifiés sur huit états d’enchères, plus la main Native Solo sur les mêmes projections et le même composant web HumanHand : **40 comparaisons**. Les huit références web du Native Solo sont prises dans la page multijoueur, sans prétendre tester la route web Solo ici.
- [Présence : artifact CI et états local en ligne/hors ligne](ios-fixes/social-presence.png). Les comptes et runs diffèrent ; ce n’est pas une comparaison pixel à pixel.
- [Mesures et provenance SHA-256](ios-fixes/measurements.json), [traces brutes avant/après](ios-fixes/traces/).

Mesures d’une séquence de sept retraits réussis 8 → 1 à 844 × 390, animations activées, même main publique et POST de test retardé de 400 ms :

| Mesure observée dans le navigateur | Solo avant → après | Multijoueur avant → après |
| --- | --- | --- |
| Saut de l’ancre de layout `left`, pour chaque retrait | 22,5 → **0 px**, 7/7 | 22,5 → **0 px**, 7/7 |
| Transitions avec position intermédiaire mesurée | 5/7 → **7/7** | 5/7 → **7/7** |
| Plus grand déplacement X entre deux échantillons | 22,50 → 10,40 px | 22,50 → 10,38 px |
| Commits React / somme `actualDuration` | 43 / 121,9 ms → 43 / 109,4 ms | 71 / 134,4 ms → 71 / 115,3 ms |

Les cartes retenues gardent leurs nœuds à chaque retrait, avant comme après : le défaut était le repositionnement, pas un remontage complet. L’instrumentation React et requestAnimationFrame est un diagnostic navigateur, sensible au scheduling ; ces chiffres ne sont ni des FPS iPhone ni une preuve générale de gain CPU. La correction supprime le saut de layout démontré. Avec Reduce Motion ou animations désactivées, les positions finales restent correctes, sans interpolation imposée. Le refus animé restitue la carte aux mêmes X/Y et conserve son nœud, avec un seul POST et sans spinner, dans les deux modes.

## Validation locale finale

| Commande / suite | Résultat |
| --- | --- |
| Racine et mobile : `npm ci` | Réussis ; dépendances verrouillées |
| Racine : `npm run typecheck`, `npm run lint`, `npm run build` | Réussis ; builds locaux avec configuration de test |
| Racine : `npm test -- --minWorkers=2 --maxWorkers=2 --reporter=dot` | **195 fichiers, 1 966 tests** |
| Mobile : `npm run typecheck`, `npm run lint`, `npm test` | Réussis ; **40 unitaires + 26 UI/navigation** |
| Mobile : `npm run test:geometry` | **200 tests réussis**, sans retry |
| Racine : `npx playwright test --config playwright.multiplayer-parity.config.ts` | **110 tests**, aucun retry : 69 références initiales, 1 crossplay, 40 comparaisons de tri |
| `npm run test:db:social` | JWT/RLS, Realtime filtré, confidentialité, contraintes et quotas : réussi sur **Supabase local** |
| `npx playwright test e2e/socialPresence.spec.ts --project=social --repeat-each=5 --retries=0` | **5/5**, puis **4/4** avec `npx playwright test --project=social --retries=0` |
| Mobile : `npm run native:check` | Réussi, configuration native vérifiée |
| Mobile : `npx expo install --check`, `npx expo-doctor` | Dépendances à jour ; **21/21** |
| Mobile : `npm run export:ios -- --source-maps --max-workers 2`, `npm run bundle:check` | Réussis ; **1 777 sources**, sans transitions de moteur, bots, serveur, UI web ou fixtures |
| `git diff --check` | Réussi avant commit ; revérifié à la livraison |

Le test social original non modifié a également passé cinq fois localement : l’échec CI est intermittent. La reproduction contrôlée démontre le chargement transitoire avec la vraie session SDK et le vrai serveur local, puis vérifie le retour de la pastille en ligne. Les contrôles de couleurs sombre/clair, hors ligne, invitation et tailles mobiles restent présents. Aucun test automatique n’utilise un compte ou salon de production.

Sur Windows, des écritures répétées des anciennes PNG suivies dans le dépôt ont échoué avec `UNKNOWN open`, sans assertion UI en échec. Les captures du test de vol sont désormais dans ses artifacts Playwright ; `NATIVE_CAPTURE_DIR` permet d’isoler les autres écritures. Les références web et toutes les assertions de géométrie/digest restent inchangées. Le run complet final utilise un dossier externe ; la CI conserve son dossier habituel.

Trois patchs SDK 57 recommandés par Expo ont été appliqués avec son installateur pour passer le contrôle de compatibilité actuel : `expo ~57.0.31`, `@expo/ui ~57.0.26`, `expo-router ~57.0.29`. Aucune nouvelle dépendance ou montée majeure. Metro ignore les dossiers générés de build/captures, qui faisaient croître son index pendant les validations et gênaient le serveur Expo de longue durée ; les sources et dépendances utiles restent indexées.

Pour reproduire les captures ciblées depuis `apps/mobile` :

```powershell
$env:IOS_FIX_CAPTURE_DIR = '<dossier externe de preuves>'
$env:NATIVE_CAPTURE_DIR = '<dossier externe des parités>'
npm run test:geometry -- --grep 'lobby actual touch|lobby error banner|fan reflows|animated refused'
# Comparer au code initial, dans une invocation distincte :
$env:IOS_FIX_BASELINE = '1'
npm run test:geometry -- --grep 'lobby actual touch|lobby error banner|fan reflows.*on motion'
Remove-Item Env:IOS_FIX_BASELINE
```

Les fixtures publiques sont régénérables depuis la racine avec `npx vite-node --config vitest.config.ts scripts/generateNativeHandFixtures.ts` ; quatre joueurs, huit tailles de main et huit états d’enchères proviennent du moteur serveur existant en mémoire. Elles ne sont jamais chargées par la route native réelle. Utiliser une base Supabase **locale** et des comptes jetables pour la suite sociale, comme le workflow `social-db.yml` ; ne jamais utiliser la configuration de production pour ces tests.

## Rechargement et vérification sur iPhone

Le serveur du worktree reste ouvert. Le lancement tunnel a ensuite été demandé explicitement par le propriétaire : scanner le QR Expo Go fourni dans le chat ou ouvrir `exp://hkl3cpu-antoninkffr-8081.exp.direct`. Le manifeste iOS SDK 57 et le bundle ont répondu HTTP 200 ; la route Multijoueur et la configuration publique Supabase sont dans le bundle. L’URL LAN `exp://192.168.1.10:8081` n’est à réutiliser que si elle répond encore sur ce réseau ; une URL de développement n’est pas une garantie permanente. Recharger manuellement Expo Go, sans fermer inutilement la session.

- [ ] Tester les quatre places libres, dans les deux sens paysage, puis changement direct de place, place occupée et course à deux joueurs ; contrôler le retour pressé, la réservation et le choix après erreur.
- [ ] En Solo puis Multi, poser de 8 à 1 cartes : départ immédiat, regroupement fluide, absence de flash/redonne ; répéter avec animations désactivées et Reduce Motion.
- [ ] Vérifier un refus/réseau interrompu : retour cohérent de la carte, synchronisation sans double envoi ; vérifier le retour d’arrière-plan et le changement de compte.
- [ ] Annoncer puis surenchérir dans une autre couleur, SA/TA, coinche/surcoinche et contrat final. Changer la couleur sélectionnée sans annoncer ; essayer les préférences de tri et les quatre places.

Consigner modèle d’iPhone, iOS, version Expo Go, SHA et clips/captures. Ces cases restent ouvertes jusqu’à observation physique. Aucune validation de fin de partie nouvelle n’est revendiquée.
