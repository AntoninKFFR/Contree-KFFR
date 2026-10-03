# Mobile / PWA — QA release

## Scope

Guide de sortie du chantier #117, issue #127. La référence est le merge #137 sur `main` (`88c00bb`). Les lots #118–#126 sont fermés et mergés. La QA ajoute des tests, des artefacts et une documentation ; elle ne redessine pas l’application et ne modifie aucune règle, API, DB, progression ou décision PWA.

Audit initial : 4 octobre 2026. La release testée est identifiée par le SHA du run CI et de son rapport JSON ; les champs date/modèle/iOS du test physique restent à renseigner.

Les résultats automatisés et la checklist physique sont deux preuves distinctes. **Aucun test physique sur iPhone n’a été effectué par cette QA automatisée.** Les cases de la checklist restent volontairement non cochées jusqu’au test sur appareil.

## Matrice automatisée

| Orientation | Viewports CSS obligatoires | Moteurs |
| --- | --- | --- |
| Portrait | 320×568, 375×667, 390×844, 430×932 | Chromium et WebKit |
| Paysage | 568×320, 667×375, 844×390, 932×430 | Chromium et WebKit |
| Tablette, navigateur sans standalone | 768×900, 1024×768, UA iPad / plateforme MacIntel / touch | Chromium et WebKit |
| Desktop | 1120×800, 1440×900 | Chromium et WebKit |

Les suites spécialisées couvrent clair/sombre et les variations de données sur cette matrice. La suite finale effectue huit parcours transverses authentifiés par moteur, puis des tests ciblés de clavier, thèmes, focus, reprise, confirmations et sortie de partie. Les parcours complets ne sont pas recopiés pour chaque combinaison de thème et de taille.

## Parcours couverts

| Garantie réutilisée | Suite et preuve |
| --- | --- |
| Viewport dynamique, notice portrait, règles/menu, fin de manche | `mobileFoundations.spec.ts` |
| Drawer, keyboard trap, Escape/backdrop/navigation, audio, notifications | `mobileNavigation.spec.ts` |
| Home anonyme/niveau 1/niveau élevé, XP, weekly, loading/error | `homeMobileProgression.spec.ts` |
| Missions permanentes, hebdomadaires, collection et états vides | `progressionUI.spec.ts`, `profileCollection.spec.ts` |
| Amis 0/1/20, pseudo long, online/offline, jouer/duo/Plus/suppression | `friendsMobile.spec.ts`, `friendProfile.spec.ts` |
| Hub, ancres, records, niveaux, questions/feedback/résultat des cinq axes | `trainingMobile.spec.ts` |
| Calculer : Valeur d’un pli / Pile Count | `training.spec.ts`, `trainingPileCount.spec.ts` |
| Mémoriser : cartes maîtresses ; Déduire : coupures adverses | `trainingMobile.spec.ts` et les smoke Training |
| Annoncer : annonce et lecture, séries de dix questions | `trainingBidding.spec.ts`, `trainingBidReading.spec.ts` |
| Partie Training : setup, question réelle, pause/reprise, quatre paysages | `trainingGame.spec.ts` |
| Landing, lobby 1/4, copy, readiness/start, menus/dialogs, large/court | `multiplayerMobile.spec.ts` |
| HUD, rang/hôte/présence/timer, neuf valeurs/six modes, cartes et pli | `mobileGame*.spec.ts` |
| Coinche/Surcoinche/Capot/Générale, focus et cas sans valeur numérique | `mobileGameInteractions.spec.ts`, `mobileGameEdgeCases.spec.ts` |
| Solo réel : start, enchère, bots, clic légal, rotations | `mobileGameAccessibility.spec.ts` et smoke Solo |
| Gate phone browser, iOS/media standalone, Android, iPad, callback, offline | `pwa.spec.ts` et tests unitaires PWA |

`mobilePwaFinalQa.spec.ts` (`@mobile @pwa-final-qa`) complète cet inventaire. Son parcours principal suit Home → Progression → Amis → profil ami avec apparats/statistiques → retour Amis → ancre Calculer via drawer → landing Multi → création UI de lobby. Les fixtures réutilisent un seul bootstrap auth/préférences ; les pages et composants sont ceux du produit. Elles ne remplacent pas les tests authentifiés serveur.

Les parcours de thème suivent les liens de l’app, puis redimensionnent Home, Friends, Training et lobby sans rechargement. La préférence est également conservée après un rechargement dans le parcours anonyme. Les contrôles audio et les valeurs de volume 0/100 sont accessibles ; ce test ne prouve pas une restitution acoustique.

## Assertions communes

- Largeur globale : `documentElement.scrollWidth <= documentElement.clientWidth + 1`. Les listes et tables explicitement scrollables ne sont pas assimilées à un overflow de page.
- Cibles critiques : largeur **et** hauteur ≥44 CSS px, mesure DOMRect arrondie à trois décimales pour éliminer le bruit de soustraction flottante ; bounding box dans le viewport sûr et centre exposé à `elementFromPoint`.
- Une action située plus bas dans une page normale est atteinte par scroll natif avant la mesure. Aucun paragraphe secondaire n’est forcé dans le premier viewport.
- Pas de scroller vertical supplémentaire sur `main` ou les shells de page. FriendPresenceList, dialogs et drawer gardent leurs scrolls légitimes.
- Drawer : blocage du scroll arrière-plan, Tab/Shift+Tab, Escape, fermeture sur navigation et focus restauré. Les quatre destinations Training restent atteignables.
- Collecteur commun : `pageerror` et toutes les `console.error`, y compris React/hydration. **Aucune erreur console n’est mise en liste blanche dans la QA finale.**
- Les réponses API/RPC inattendues ≥400 et les échecs de requêtes métier échouent. Seules les annulations natives précises `net::ERR_ABORTED`, `cancelled`, `Load request cancelled` ne sont pas des erreurs réseau métier ; les erreurs console/page associées restent contrôlées. Les requêtes externes facultatives ne sont pas des API métier.
- Les rapports ne collectent ni corps de requête, ni mot de passe, ni JWT, ni query string. Ils contiennent route, moteur, viewport, overflow, contrôles mesurés, erreurs et tentative/retry.

## Résultats Chromium

La matrice historique contient 320 tests Chromium ; la QA finale ajoute 27 tests, soit **347 tests mobile/PWA** par moteur. Les huit tailles officielles sont testées dans les suites spécialisées et les huit parcours transverses. Le résultat du commit livré doit être `347 passed`, sans skip de scénario critique.

## Résultats WebKit

Même couverture : **347 tests**, y compris 320×568 et 568×320 bloquants. Aucun `skip` WebKit ajouté. Les préférences clavier Safari peuvent modifier l’ordre des liens ; les assertions vérifient le confinement du focus dans le drawer, ses extrémités et le retour à l’opener.

## Safe areas

Portrait : top 47 / bottom 34. Paysage : notch gauche 44 ou notch droit 44, bottom 21 ou 34. Les variables #118 sont injectées par les helpers de test, sans bypass produit. Les suites spécialisées complètent les deux sens du notch sur les quatre paysages ; les parcours transverses alternent ces insets. Header, drawer, cartes, enchères et actions finales sont mesurés. Les ancres Training doivent se trouver entre 0 et 56 px sous le header, pas simplement quelque part plus bas dans le document.

## PWA / standalone

`pwa.spec.ts` vérifie le gate iOS browser en portrait/paysage, notamment 844 et 932 px de largeur, l’absence de bouton « Continuer dans le navigateur », les faux flags sans effet, les deux détections standalone, Android-like avec prompt sur geste utilisateur, iPad/MacIntel sans gate et les routes techniques de callback. Après callback, le navigateur téléphone reste gated.

Manifest : id/start_url/scope `/`, display `standalone`, couleurs `#071c17` / `#06120d`, PNG 192/512 et métadonnées iOS. Les octets et dimensions des fichiers sont vérifiés. Aucun nouvel icon, manifest ou service worker n’est généré pour #127.

Le scénario offline de production existant reste dans la matrice : fallback minimal, aucun gameplay offline et aucun cache privé API/Supabase/RSC. Les tests unitaires `pwaServiceWorker`, `pwaOfflineArtifact`, `pwaEnvironment` et `mobileInstallGate` conservent ces invariants.

## Jeu paysage

Les scènes Solo/Multi partagent GameTable. Header `compact-game` : 44 px sur téléphone actif ; header normal : 56 px. La QA vérifie la sortie Solo → Home, Multi → Home et Training → Home : header `default`, sans état compact résiduel. Setup Solo/Training et lobby gardent le header normal ; desktop/tablette gardent 56 px.

Ces hauteurs sont celles du contenu du header : le shell ajoute le safe-top. En portrait avec top 47, le retour Solo playing → Home doit donc mesurer 103 px, ce qui vérifie à la fois le cleanup et le maintien de l’inset.

Les suites #126 conservent les contrôles de neuf valeurs, quatre suits, SA/TA, Coinche/Surcoinche, Capot/Générale, huit cartes réellement cliquables, main 8→1, pli 1→4, collecte manuelle, dernier pli et overlay. La suite finale recontrôle Capot et **Surcoinche sans valeur numérique** : layout hidden/inert, message vide masqué, Annuler/Confirmer sûrs, Escape et focus restauré.

Les garanties serveur sont exécutées par les workflows authentifiés, sans mocks : Multiplayer/Rating couvre join, ready, start, bidding, play, CAS/privacy, Realtime, reconnexion, takeover, finish, history/rematch et Rating. Social, Training DB/Duo et Progression gardent leurs propres bases/comptes jetables.

## Clavier

Trois scénarios layout, dans les deux moteurs : login (email puis password), recherche ami et code de table. Le viewport passe de 390×844 à 390×380 avec bottom 34 ; valeur et focus conservés, input ≥16 px, champ et bouton/résultat atteignables par scroll normal. Le retour au viewport initial conserve la saisie. Aucun vrai login externe n’est effectué dans ces fixtures ; les comptes réels sont couverts par les E2E authentifiés CI.

## Rotation

Solo et Multi : 390×844 → 844×390 → 390×844 → 844×390, même ID, état complet (donne/main/scores), aucun intent induit par la rotation. Friends conserve la recherche ; lobby conserve code/joueurs/ready ; Home et Training restent fonctionnels après resize.

Le test de reprise émet blur/focus et visibilitychange hidden/visible sur une partie chargée, puis contrôle absence de reset/crash. Il ne simule **pas** la suspension réelle du processus iOS. La reprise réseau est prouvée par les scénarios authentifiés reconnect/takeover de `multiplayer.spec.ts`, pas par un faux offline de fixture responsive.

## Performance / assets

`collectMobilePwaQa.mjs` produit une observation reproductible après le build : nombre/octets des chunks `.next/static/chunks`, union des chunks initiaux `/layout` + `/page`, tailles brutes/gzip, dix plus gros chunks et assets `public/`. Ces chiffres figurent dans `mobile-pwa-qa-report.json`, avec le SHA GitHub du run. Ils ne constituent pas un seuil arbitraire de performance.

Référence du build de #126, dont les sources runtime sont identiques au merge `88c00bb` : **83 chunks / 1 877 460 octets** ; `public/` : **23 fichiers / 35 380 847 octets**. Les principaux assets existants sont les pistes MP3 (environ 2,5–3,5 Mo) et `TapisKFFR.png` (3 019 270 octets). Aucun PNG de QA, vidéo, archive ou rapport n’est ajouté dans public. Ce total statique n’est pas le volume transféré au démarrage ; le sous-ensemble initial Home est rapporté séparément.

Aucune dépendance runtime ni fonctionnalité ajoutée. Les images/PWA/audio et le comportement de chargement existants sont conservés. Le build affiche aussi les tailles First Load JS par route. Les chiffres du build livré doivent être lus dans l’artefact associé à son SHA, pas dans un run précédent.

## Artefacts CI et reproduction

Le workflow **Mobile responsive** reste unique : suite historique + QA finale, un worker CI, timeout 45 min, retry global existant (1). Pas de sharding ou de neuvième workflow.

Les filtres de chemins des six workflows spécialisés incluent la suite finale, son helper et le collector : une PR de QA seule déclenche ainsi aussi Progression, Social, Training et Rating authentifiés. Leurs jobs, comptes jetables et assertions restent ceux des workflows existants.

- `mobile-responsive-report` : résultats spécialisés et `playwright-report/` HTML, upload `always()` aussi en cas d’échec.
- `mobile-pwa-final-qa` : **18 captures sélectionnées**, neuf vues × deux moteurs, et rapport JSON agrégé avec erreurs, checkpoints, cibles, retries et assets. Une nouvelle tentative conserve sa trace JSON et la dernière capture de la vue ; elle ne multiplie pas l’ensemble final.
- Convention : `qa-<route>-<state>-<theme>-<width>x<height>-<engine>.png`.
- Sélection : Home auth sombre 390, Home anonyme clair 390, Progression sombre 430, Friends liste longue sombre 320, Training hub sombre 390, lobby 4 sombre 844, Solo enchères sombre 568, Multi jeu sombre 844, notice Solo claire 390.
- Aucun golden PNG committé. Les screenshots sont des diagnostics complémentaires aux assertions DOM/géométrie/focus/état.

Reproduction avec les variables Supabase locales de fixtures décrites dans [mobile-pwa.md](mobile-pwa.md), jamais des identifiants de production :

```sh
npm ci
npx playwright install chromium webkit
npm run typecheck
npm run lint
npm run build
npm test
# Avec E2E_PRODUCTION_SERVER=1 :
npx playwright test --project=mobile --project=mobile-webkit --grep @pwa-final-qa
npm run test:e2e:mobile
npm run test:e2e:smoke
npx playwright test --project=progression-ui
node scripts/collectMobilePwaQa.mjs
```

Chaque invocation Playwright remplace son outputDir : collecter/copier les artefacts juste après la suite mobile, avant un autre projet. Le collector réutilisé en CI est la référence pour les captures et chiffres d’assets. Les E2E authentifiés doivent être exécutés avec les environnements jetables des workflows existants, sans les remplacer par les fixtures UI.

## Limites connues de la QA automatisée

- Playwright WebKit n’est pas Safari iOS dans tous ses détails ; les polices, préférences clavier et comportements système peuvent différer.
- Dynamic Island/notch/Home Indicator sont simulés avec les safe areas ; aucun appareil physique n’a été observé.
- Un viewport réduit vérifie le layout clavier, pas le clavier iOS natif ni son animation/zoom.
- blur/focus/visibilitychange ne reproduisent pas la suspension, l’éviction mémoire ou la restauration d’une PWA iOS.
- Le prompt Android natif et l’installation « Sur l’écran d’accueil » dépendent du navigateur/système. L’automatisation vérifie leurs règles et handlers, pas leur UI native.
- Audio hardware, casque, interruptions et volume système restent manuels.
- Les mocks responsive prouvent la présentation, pas le réseau, la sécurité, le stockage ou la Rating DB. Ces garanties appartiennent aux suites serveur authentifiées.

## Checklist release iPhone

À renseigner sur appareil réel avec date, modèle/iOS, URL/release et résultat. Ne cocher qu’après observation.

### Safari portrait et paysage

- [ ] Ouvrir l’URL release dans Safari portrait : gate visible, instructions lisibles, app métier inaccessible, safe-top/bottom corrects.
- [ ] Passer en paysage : gate toujours actif, aucune fuite de l’app, texte atteignable.
- [ ] Tourner dans les deux sens : instructions hors notch/Dynamic Island, aucun bouton de bypass navigateur.
- [ ] Effectuer le callback auth : le parcours technique se termine, puis le browser téléphone reste gated.

### Installation

- [ ] Partager → Sur l’écran d’accueil → Ajouter ; garder « Ouvrir comme app web » si proposé.
- [ ] Vérifier icône et nom KFFR, puis lancer depuis l’icône.
- [ ] Vérifier l’absence de barre Safari et l’accès standalone à l’app.

### Standalone portrait

- [ ] Home anonyme/auth : CTA, XP et missions lisibles et atteignables.
- [ ] Menu : ouvrir/fermer, arrière-plan bloqué, destinations et compte accessibles, dernier lien hors Home Indicator.
- [ ] Progression : XP, missions de départ/hebdo, collection.
- [ ] Friends : online/offline, pseudo long, Jouer/S’entraîner/Plus, profil ami et retour.
- [ ] Training : hub, quatre ancres et un exercice Calculer/Mémoriser/Déduire/Annoncer jusqu’au feedback/résultat.
- [ ] Multiplayer : landing, code, préférences, lobby seul et à quatre, Copier/Prêt/Start/Inviter/Plus.

### Standalone paysage et jeu

- [ ] Lobby : quatre places à 844×390, actions et rang/présence/hôte lisibles.
- [ ] Solo puis Multi : HUD/contrat, quatre joueurs, timer, huit cartes et game menu accessibles.
- [ ] Enchères : valeurs, quatre suits, SA/TA, Capot/Générale, Coinche/Surcoinche ; confirmation et retour du focus.
- [ ] Pli complet : quatre cartes reconnaissables, Ramasser le pli, Dernier pli et Fermer.
- [ ] Notch dans les deux sens : header, joueurs, cartes, enchères et commandes hors zone matérielle.
- [ ] Home Indicator : dernière action, main, dialogs et drawer restent accessibles.
- [ ] Rotations répétées portrait ↔ paysage : notice/table, pas de reset, double modal, menu disparu ou scroll fantôme.

### Clavier, préférences et reprise

- [ ] Login email/password : pas de zoom, champ visible, bouton atteignable, retour clavier normal.
- [ ] Recherche ami : mêmes vérifications, valeur et résultats conservés.
- [ ] Code table : mêmes vérifications, Rejoindre atteignable au-dessus du Home Indicator.
- [ ] Audio mute/unmute, volume si disponible, casque/interruption : comportement correct.
- [ ] Thème dark → light → dark sur Home/Training/lobby/game, préférence conservée après navigation et reload.
- [ ] Partie en arrière-plan 10–30 s puis retour : même partie, reprise des contrôles ; reconnexion Multi si nécessaire.
- [ ] Couper brièvement Wi-Fi/réseau pendant Multi, rétablir : reprise cohérente sans double intent.
- [ ] Tester le fallback offline : écran minimal, aucun gameplay ou contenu privé mis en cache.

## Critères de validation

La PR est prête seulement après typecheck/lint/build, Vitest complet, les **694 E2E mobile/PWA**, **89 smoke**, **14 Progression UI** et **14 vrais E2E authentifiés** (4 Multi/Rating, 6 Training Duo, 4 Social), soit **811 scénarios distincts**. La suite finale représente 54 de ces 694 tests ; ne pas la compter une deuxième fois.

Les huit workflows et Vercel doivent réussir sur **le SHA final**, avec revue des P1/P2 valides et aucun scénario important skipped. Les retries éventuels doivent être identifiés et leur cause traitée/documentée. Les limites et cases manuelles non exécutées ne doivent jamais être présentées comme des tests physiques réussis.

Une attente fragile existante du smoke `manual collection leaves the next trick live and mounted` a été corrigée : après 160, un bot peut contrer et rendre le tour d’enchères à l’humain. Le test passe quand le vrai bouton Passer est disponible et attend une carte légalement jouable, au lieu d’attendre à tort le jeu pendant des enchères non terminées. Aucun sleep fixe, timeout métier ou moteur n’est modifié.

Les résultats, retries, déploiement et SHA sont identifiés par les checks et artefacts de la PR associée à l’issue #127. Le guide ne fige pas un SHA de travail provisoire. #127 et #117 restent ouverts jusqu’au merge humain ; cette QA ne merge rien.
