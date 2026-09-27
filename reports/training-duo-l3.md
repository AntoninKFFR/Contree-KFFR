# Lire les enchères à deux — vérification L3

## Architecture livrée

L1 conserve l'état canonique, les réponses et la graine dans les tables duo dédiées. Le service note les réponses et projette `TrainingDuoView` selon la phase ; les secrets et les UUID internes restent hors de la réponse membre. L2 utilise les routes authentifiées, Realtime comme signal de rafraîchissement et GET comme source de vérité, y compris après reconnexion. L3 ajoute un test Playwright de bout en bout avec deux comptes Auth et deux contextes de navigateur indépendants.

## Preuves E2E

Le projet `training-duo` crée et rejoint un salon de niveau 4 sans déblocage solo, vérifie présence, readiness et démarrage, puis compare les deux projections publiques. Il inspecte les réponses JSON des routes duo avant la deuxième réponse pour interdire graine, promesse, explication, main d'illustration, grade, réponse partenaire et UUID utilisateur. Il vérifie aussi l'absence de correction dans le DOM et l'absence de POST vers la progression solo, le classement, l'historique, le multijoueur ou les invitations.

Le scénario soumet les dix exercices, teste la barrière des deux réponses et des deux confirmations, un passage simultané, la fermeture d'un contexte jusqu'au statut hors ligne, puis sa reconnexion. Des sessions courtes couvrent le départ invité en lobby (`204`) suivi d'une nouvelle adhésion, l'annulation par l'hôte, un départ en session active, la récupération d'un état terminal après un événement Realtime manqué, ainsi que le refus de démarrer avec un partenaire prêt mais hors ligne. Les vues salon, formulaire, correction et résultat sont contrôlées à 390×844, 667×375, 844×390 et 1366×768. Le test vérifie les scores par place, les réussites communes et la progression locale inchangée.

## CI et limites

Le workflow `Training duo E2E` démarre un Supabase jetable, applique les migrations, crée deux comptes Auth confirmés temporaires sous les noms de variables `E2E_USER_1_*` et `E2E_USER_2_*`, construit l'application puis lance Playwright en production. Les traces d'authentification sont désactivées et le rapport Playwright n'est téléversé qu'en échec. La suite peut être ignorée localement sans ces identifiants ; le job CI doit l'exécuter réellement.

Vérification L3 sur la PR #80 : le job authentifié exécute six scénarios réels, dont la rafale de tentatives d'adhésion, sur deux `BrowserContext`, sans test duo ignoré. Le GET de reconnexion est inspecté avant la seconde réponse, en phase `answering`. Le job Training DB vérifie sur Supabase local le quota exact sous concurrence, la limite IP commune, la réouverture de fenêtre, l'isolation des rôles et l'absence de publication Realtime. La suite unitaire passe 1 481 tests et le smoke public 78 scénarios.

Le limiteur V1 utilise une table Postgres service-only et une fonction atomique qui consomme dans la même transaction un quota par compte et un quota par IP. Les deux clés sont des HMAC SHA-256 calculés côté serveur à partir du JWT authentifié et, sur Vercel, de l'en-tête IP réécrit par la plateforme ; aucune IP brute n'est stockée ni journalisée. Hors de cet environnement de confiance, les requêtes partagent un seau IP conservateur. Chaque seau ouvre une fenêtre de 60 secondes à sa première requête : création 10/compte et 30/IP, adhésion 12/compte et 30/IP, mutations 120/compte et 240/IP, présence 60/compte et 180/IP. Les quatre POST consomment leur quota avant tout lookup ou mutation. Le dépassement renvoie `429 duo_rate_limited` avec `Retry-After` et un message générique ; l'échec préjoin normal reste indiscernable entre codes inconnus et indisponibles. Les tests unitaires, DB concurrentiels et E2E authentifiés contrôlent cette limite.

La purge physique après 24 h reste une maintenance séparée conformément à la spécification ; l'expiration paresseuse et le TTL actif sont livrés. La journalisation duo courante ne contient que la route et le code d'erreur, sans code de session complet, graine, réponse brute, courriel, IP ni jeton.
