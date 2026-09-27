# Lire les enchères à deux — vérification L3

## Architecture livrée

L1 conserve l'état canonique, les réponses et la graine dans les tables duo dédiées. Le service note les réponses et projette `TrainingDuoView` selon la phase ; les secrets et les UUID internes restent hors de la réponse membre. L2 utilise les routes authentifiées, Realtime comme signal de rafraîchissement et GET comme source de vérité, y compris après reconnexion. L3 ajoute un test Playwright de bout en bout avec deux comptes Auth et deux contextes de navigateur indépendants.

## Preuves E2E

Le projet `training-duo` crée et rejoint un salon de niveau 4 sans déblocage solo, vérifie présence, readiness et démarrage, puis compare les deux projections publiques. Il inspecte les réponses JSON des routes duo avant la deuxième réponse pour interdire graine, promesse, explication, main d'illustration, grade, réponse partenaire et UUID utilisateur. Il vérifie aussi l'absence de correction dans le DOM et l'absence de POST vers la progression solo, le classement, l'historique, le multijoueur ou les invitations.

Le scénario soumet les dix exercices, teste la barrière des deux réponses et des deux confirmations, un passage simultané, la fermeture d'un contexte jusqu'au statut hors ligne, puis sa reconnexion. Des sessions courtes couvrent le départ invité en lobby (`204`) suivi d'une nouvelle adhésion, l'annulation par l'hôte, un départ en session active, la récupération d'un état terminal après un événement Realtime manqué, ainsi que le refus de démarrer avec un partenaire prêt mais hors ligne. Les vues salon, formulaire, correction et résultat sont contrôlées à 390×844, 667×375, 844×390 et 1366×768. Le test vérifie les scores par place, les réussites communes et la progression locale inchangée.

## CI et limites

Le workflow `Training duo E2E` démarre un Supabase jetable, applique les migrations, crée deux comptes Auth confirmés temporaires sous les noms de variables `E2E_USER_1_*` et `E2E_USER_2_*`, construit l'application puis lance Playwright en production. Les traces d'authentification sont désactivées et le rapport Playwright n'est téléversé qu'en échec. La suite peut être ignorée localement sans ces identifiants ; le job CI doit l'exécuter réellement.

Vérification L3 : le job authentifié de la PR #80 a exécuté les cinq scénarios sur deux `BrowserContext` et a affiché `5 passed`, sans test duo ignoré. Localement, `npm test` a réussi 1 476 tests, et le smoke séquentiel a réussi 78 tests. Le typecheck, le lint et le build sont verts.

La spécification ne fixe ni seuil ni stockage pour un limiteur compte/IP ; aucun limiteur nouveau n'a été inventé dans L3. Le code aléatoire, l'authentification et l'erreur générique protègent déjà l'adhésion. La purge physique après 24 h reste une maintenance séparée conformément à la spécification ; l'expiration paresseuse et le TTL actif sont livrés. La journalisation duo courante ne contient que la route et le code d'erreur, sans code de session complet, graine, réponse brute, courriel ni jeton.
