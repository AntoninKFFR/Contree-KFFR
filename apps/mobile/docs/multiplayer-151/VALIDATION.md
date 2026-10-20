# Validation — 21 octobre 2026

L’état CI et le SHA immuable livré sont consignés dans la description de la [PR #152](https://github.com/AntoninKFFR/Contree-KFFR/pull/152). La PR reste DRAFT. Aucun merge ou déploiement n’est demandé par ces commandes.

## Exécuté localement

| Vérification | Résultat |
| --- | --- |
| `npm ci` racine et `apps/mobile` | Réussi, lockfiles inchangés |
| Racine `npm run typecheck`, `npm run lint`, `npm run build` | Réussis ; build de test avec URL Supabase localhost et clé factice publique |
| `npm test -- --minWorkers=2 --maxWorkers=2 --reporter=dot` | **194 fichiers / 1 961 tests réussis** |
| Mobile `npm run typecheck`, `npm run lint` | Réussis ; typecheck également vérifié sans dépendances racine, comme le job Expo isolé |
| Mobile `npm test` | **40 unitaires + 26 tests UI/navigation réussis** |
| Mobile `npm run test:geometry` | **173 tests réussis**, dont 72 multijoueur ; aucun retry |
| `npx playwright test --config playwright.multiplayer-parity.config.ts` | **70 réussis** : 69 états web et un parcours croisé web/RN Web |
| `E2E_PRODUCTION_SERVER=1 npm run test:e2e:smoke -- --workers=1` | **89 réussis**, serveur Next local construit, aucun retry |
| Mobile `npm run native:check` | Configuration iPhone/paysage/scene lifecycle vérifiée ; aucun binaire compilé ou signé |
| `npx expo install --check` | Versions compatibles avec Expo SDK 57 |
| `npx expo-doctor` | **21/21** |
| `npm run export:ios -- --source-maps` puis `npm run bundle:check` | Export réussi ; **1 777 sources** auditées, modules multi/Solo présents, aucun moteur de transition, bot, serveur, composant web ou fixture |
| `node scripts/render-multiplayer-comparison.mjs` depuis mobile | **69 paires**, SHA-256 identiques pour chaque projection publique ; trois planches et HTML générés ; les 12 captures de résultat ont été revérifiées après la finition de couleur victoire/défaite |
| `git diff --check` | Réussi |
| Origine API | Homepage GitHub = origine Solo existante ; GET multijoueur non authentifié = **401**, sans mutation |

## Ce que prouvent les tests nouveaux

- Transport natif contre le vrai moteur et les helpers d’autorisation multijoueurs : parties complètes avec deux humains/deux bots et quatre humains, véritables mains publiques de chaque viewer, enchères synchronisées, carte illégale refusée, mêmes scores et résultat final, puis revanche.
- Réservations concurrentes : une réussite, un conflit, pas de doublon de place. Timeout humain, bot temporaire, retour par présence, hôte absent/récupéré/transféré et forfait.
- Une intention à la fois ; animation provisoire avant HTTP ; refus/409/timeout/réseau/malformation réconciliés uniquement par GET. Une lecture partie avant un POST ambigu ne peut pas déverrouiller la partie à sa place.
- Réponses tardives ignorées après compte/jeton/suspension/destruction, refreshs coalescés, version plus ancienne ignorée, identifiants et membres validés, mains privées rejetées.
- Route et vrais composants natifs via Expo Router/Jest : entrée depuis l’accueil, création, prêts sérialisés, debounce Realtime, retour depuis arrière-plan sur la même table, nettoyage des subscriptions, invitation résolue puis acceptée après place, changement de compte sans fuite.
- Deux pages, vrais composants web et RN Web, **vrais SDK Supabase** sur un WebSocket local simulé : créer sur PC, saisir le code côté natif, prendre une place, prêts/lancement, enchères, carte iPhone visible sur PC, retour d’arrière-plan, résultat de forfait partagé, retour au lobby. Ce test n’utilise pas deux appareils physiques.
- Captures : création/rejoindre, lobby libre/rempli, enchères, partie, pli, dernier pli, résultat ; 568×320, 844×390, 932×430. Les cinq états de jeu couvrent les quatre viewers. Les snapshots sont pris après chargement réel de l’UI/assets, avec mouvement réduit commun ; un autre test active les véritables animations.
- Zones sûres et grandes polices (1,6×), côté Dynamic Island gauche/droite, portrait puis retour paysage ; contrôles accessibles dans le rectangle sûr. La disposition compacte du lobby garde ses actions supplémentaires dans le menu.

## Réserves observées et corrections

La première suite racine complète lancée pendant les captures parallèles a dépassé les 15 s du benchmark Monte Carlo V2/V1 existant : 1 960 réussis, un timeout. Aucun fichier de simulation, timeout ou assertion n’a été modifié ; la suite complète réussit avec deux workers. Un premier essai `--maxWorkers=2` seul a été refusé par Vitest (minimum automatique incompatible) et n’a exécuté aucun test ; la commande ci-dessus fixe les deux bornes.

Les anciennes attentes « Multijoueur bientôt disponible » ont été actualisées pour l’activation réelle du mode. Le harnais Vite a été corrigé pour l’appel des timers et pour résoudre en ESM les **vraies** fonctions du compilateur RN Web utilisées par Reanimated ; aucune animation simulée n’a été introduite. Un build sans variables publiques de test affichait légitimement « Supabase indisponible » ; les captures livrées ont été refaites sur un build localhost correctement configuré, après vérification du chargement.

## Sécurité et périmètre

Les tests utilisent des comptes/HTTP/WebSockets factices et le moteur en mémoire, jamais la production. Le test de l’URL publique est uniquement un GET sans token recevant 401. Aucun secret serveur, `service_role`, SQL, migration, changement de RLS/Auth ou nouvelle dépendance native. Les RPC mobiles supplémentaires sont des **lectures** des résultats Elo/progression déjà exposés au propriétaire authentifié. Le serveur conserve seul les écritures de partie, d’archive, d’Elo et d’XP.

Les tests mémoire ne prouvent pas à eux seuls l’atomicité PostgreSQL/RLS : les suites DB locales et les jobs existants du dépôt restent la référence complémentaire en CI. Aucune suite DB de production n’est lancée.

La [QA physique](PHYSICAL-QA.md) iPhone + PC, les FPS matériels, la connexion radio et l’écoute audio restent **à faire**. Les captures sont des vrais composants RN Web, pas des captures d’Expo Go sur iPhone.
