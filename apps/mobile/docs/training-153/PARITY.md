# Entraînement iOS — issue 153

Base auditée : `eeac38b2c96c1ff50ae651bfd1c127ae917aaba8` (main et branche distante le 22 octobre 2026). PR 150 et 152 fusionnées. Worktree dédié, branche existante `feat/153-ios-training`. Aucune migration, modification Auth/RLS, publication backend ou fusion autorisée.

## Inventaire web et contrat de parité

| Section / parcours | Moteur partagé | Modes / niveaux exacts | Stockage web | Livraison native (validation matérielle en attente) |
| --- | --- | --- | --- | --- |
| Calculer — Valeur d’un pli | trickValue.ts | 1 Fondamentaux, 2 Confirmé ; 10 questions, 8/10 débloque ; Confirmé avance après 190 ms | Local + série serveur vérifiée | Implémenté ; moteurs et UI testés |
| Calculer — Survie | trickValueChallenge.ts | 3 vies ; 9 s → minimum 3 s ; difficulté progressive | Local seulement | Implémenté ; moteurs et UI testés |
| Calculer — Blitz | trickValueChallenge.ts | 60 s, bonus et pénalités des erreurs consécutives du moteur | Local seulement | Implémenté ; moteurs et UI testés |
| Calculer — Compter son tas | pileCount.ts | Débutant 1500 ms, Normal 800 ms, Libre 300–3000 ms, Manuel ; Normal après 8/10 Débutant | Local ; Libre sans record, Manuel temps seulement si 10/10 | Implémenté ; moteurs et UI testés |
| Mémoriser — Cartes maîtresses | memory.ts | 3 niveaux | Local + série serveur vérifiée | Implémenté ; moteurs et UI testés |
| Mémoriser — Maîtresses en main | memory.ts | 2 niveaux | Local + série serveur vérifiée | Implémenté ; moteurs et UI testés |
| Mémoriser — Cartes tombées | memory.ts | 5 niveaux | Local + série serveur vérifiée | Implémenté ; moteurs et UI testés |
| Mémoriser — Mémoire d’un pli | memory.ts | 4 niveaux ; attribution joueurs aux niveaux 2 et 4 ; score partiel | Local + série serveur vérifiée | Implémenté ; moteurs et UI testés |
| Déduire — Jeu des autres | opponentVoids.ts | 3 niveaux ; grille joueur/couleur, nombre d’atouts au niveau 3 | Local + série serveur vérifiée | Implémenté ; moteurs et UI testés |
| Déduire — Entraînement en partie | inGame.ts + inGameScheduler.ts | vraie partie bots ; budget 1–3 questions/manche ; axes configurables | Bilan de session | Implémenté ; moteurs et UI testés |
| Annoncer — Faire son annonce | bidding.ts | 4 niveaux : Ouvrir, Réagir à l’adversaire, Répondre au partenaire, Enchère compétitive | Local, doctrine V4.1 | Implémenté ; moteurs et UI testés |
| Annoncer — Lire les enchères | bidReading.ts | 4 niveaux : Lire une ouverture, Lire le partenaire, Lire la compétition, Lire une séquence | Local, doctrine V4.1 | Implémenté ; moteurs et UI testés |
| Annoncer — Conventions | page web conventions + documents existants | contenu pédagogique intégral | Aucun | Implémenté ; moteurs et UI testés |
| Annoncer — Duo | endpoints training/duo + projections serveur | 4 niveaux, code, invitations, lobby/prêt, 10 questions, réponses privées jusqu’à révélation, résultats | Serveur, Realtime + récupération HTTP | Implémenté ; moteurs et UI testés |
| Records / amis | trainingRecordsClient / trainingLeaderboardClient | six axes de seriesContract uniquement, RPC get_friends_training_leaderboard | Compte / RLS existante | Implémenté ; moteurs et UI testés |

La phase d’observation mémoire du web est libre : aucun délai imposé. Ne pas inventer de chronomètre. Les noms ci-dessus proviennent de MEMORY_LABELS, pas des intitulés approximatifs du brief.

## Architecture et dépendances

- Les moteurs sont TypeScript, sans DOM ; ils réutilisent le moteur de partie pour générer des situations légales. `bidding`/`bidReading` embarquent la doctrine bots ; `pileCount` simule les bots épinglés. L’audit du graphe Metro autorise explicitement ces générateurs partagés ; les modules serveur, DOM, fixtures et moteur d’actions restent interdits dans le bundle.
- Remplacer les clients React DOM, Next Link, NumberPad HTML et sélections par des composants natifs. Réutiliser CardFace, palette, panneaux, feutrine, préférences Reduce Motion et Safe Areas existants.
- Extraire sans changer leurs règles les fonctions pures de `components/training/progress.ts`. Le wrapper web conserve localStorage et sa clé historique. Le natif utilise AsyncStorage par identité ; aucune lecture/écriture du stockage web depuis iOS.
- Progression locale : format v1, versions d’axes annonces, validation par axe, seuil 8/10. Les scores mémoire peuvent être fractionnaires. Ne pas calculer les déblocages depuis les records compte.
- Les exercices solo générés peuvent fonctionner hors réseau après authentification/chargement de l’application ; le gate de compte existant reste applicable. Duo, records et classements nécessitent le backend.
- Séries vérifiables : POST officiel avec JWT, réponses brutes, seed, axisVersion, generatorVersion, rulesetVersion, durée ; aucune écriture directe de score/XP/missions. Journal natif de soumission ; le serveur existant ne déduplique pas un POST identique (voir IMPLEMENTATION.md).
- Duo : ne jamais générer localement sa série à partir d’une seed ; consommer seulement les projections publiques de l’API, et utiliser Realtime comme invalidation d’un GET autoritaire.
- En partie : la table native utilise une projection Solo publique, alors que le scheduler web reçoit GameState. L’adaptation utilise exclusivement les connaissances publiques ; aucune reconstruction des mains adverses ou mutation du moteur autoritaire.

## Limite produit persistante

Les records vérifiés du compte web restent lisibles sur iPhone pour les six axes pris en charge. Les déblocages localStorage web et records locaux (annonces, défis, tas) ne migrent pas automatiquement vers iPhone. Ils restent intacts dans le navigateur. Chaque compte a sa progression locale iPhone distincte. Un changement de compte doit vider immédiatement les vues privées et ignorer les réponses asynchrones devenues obsolètes.

## Suivi de livraison

Ce document est un inventaire et un contrat, pas une preuve de fonctionnalité. La couverture, les preuves et limites sont décrites dans IMPLEMENTATION.md ; IPHONE.md guide la validation matérielle. Aucun test de production ou capture RN Web ne constitue une preuve iPhone physique.
