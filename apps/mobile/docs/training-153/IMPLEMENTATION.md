# Portage natif — état de travail

Branche `feat/153-ios-training`, issue #153, PR DRAFT #154. Ce suivi décrit le code et les validations réellement exécutées ; il ne remplace pas la validation physique iPhone.

## Couverture implémentée

- Route Expo Router `/training`, catalogue des 17 entrées, niveaux réellement verrouillés, progression et records locaux distincts des records de compte. Navigation d’accueil et absence de barre inférieure conservées.
- Valeur d’un pli (2 niveaux), Survie, Blitz, quatre modes du tas, quatre axes mémoire (3/2/5/4 niveaux), Jeu des autres (3 niveaux), annonces et lecture (4 niveaux chacun), conventions intégrales. Tous appellent les générateurs et corrections existants ; aucune règle de score recopiée.
- Sélections de cartes et attribution aux joueurs, grille des coupures, correction par cartes, illustrations de mains, clavier numérique natif, aide, résultat et déblocages.
- Table d’entraînement réutilisant SoloRoom, ses bots serveur, sa présentation de plis et son contrôleur. Bookmark distinct, configuration des axes et budget 1–3, questions sur projection publique, pause avant tout nouveau tour, bilan accessible dans les détails. Aucun accès aux mains adverses ni mutation pédagogique de la partie.
- Duo : client HTTP partagé avec le web, contrôleur natif, code, niveaux 1–4, état prêt, réponses indépendantes, révélation, fin de série, reprise par bookmark, Realtime comme invalidation HTTP, heartbeat et retour AppState. Invitations via les endpoints existants, sélection des amis réels.
- Records de compte via RLS propriétaire et classements via `get_friends_training_leaderboard`. Seuls les six axes de seriesContract sont envoyés au serveur, avec réponses/seed/versions/JWT ; jamais un score ou une attribution XP venant du client.

## Stockage et identité

Les règles pures de progression résident dans `lib/training/progress.ts` ; le wrapper web conserve exactement sa clé localStorage et ses fonctions publiques. Le format natif enveloppe ce même v1, ajoute des reçus durables et utilise AsyncStorage par identité. Les écritures d’une instance sont sérialisées. Les JSON corrompus sont conservés pour récupération ; un format futur est refusé sans écrasement. Les données privées sont masquées pendant la revérification de session ; un changement d’identité remonte un nouvel arbre de contrôleurs. Les défis conservent leur temps pendant cette revérification.

Les records serveur du web sont lisibles, mais ses déblocages localStorage et ses records locaux ne sont pas transférés automatiquement sur iPhone. Cette limite est affichée dans le catalogue.

## Limite backend reproduite : POST de série non idempotent

Le test réel sur Next.js + Supabase local a montré que deux POST identiques à `/api/training/series` créent deux UUID de série. La RPC existante sérialise l’écriture et attribue les missions selon leur logique, mais elle ne déduplique pas les mêmes seed/réponses. Le client natif ne peut donc pas supposer qu’un renvoi est sans effet.

Le natif écrit un journal durable **avant** le POST. Plusieurs validations, un rafraîchissement de jeton et un redémarrage réutilisent le reçu. Après une réponse ambiguë (réseau/5xx), une nouvelle action vérifie uniquement l’historique autorisé du compte ; elle n’émet pas un deuxième POST. Un rejet explicite 401/429 permet une nouvelle tentative après correction. Les résultats locaux restent acquis si la synchronisation ne peut être confirmée.

Cela protège les envois de cet appareil. Cela ne fournit pas une déduplication globale entre appareils ni pour les anciens clients web. Une garantie globale nécessiterait une évolution transactionnelle de la RPC avec une clé de soumission durable et une migration revue. **Aucune migration, modification RLS/Auth, écriture XP cliente ou intervention en production n’a été faite.**

## Validations acquises avant le commit du portage

- Web : typecheck, lint, build ; 200 fichiers / 1 999 tests réussis, dont parité des questions sur projections publiques pour 200 seeds.
- Mobile : 73 tests purs réussis (stockage, tous les niveaux/générateurs/corrections, horloges, transport, journal d’envoi et contrôleur Duo) ; 52 tests de navigation/UI réussis.
- Sept nouveaux parcours RN Web réussis : catalogue et navigation, exercices et corrections, cartes/mémoire/déduction/annonces/conventions/tas/défis/configuration en partie aux trois tailles, série complète et rechargement. Les captures sont des vrais composants React Native Web, **pas des captures matérielles iOS**.
- Export iOS avec source map réussi ; configuration native, compatibilité des packages et Expo Doctor 21/21 réussis.
- La suite géométrique complète et le Duo réel local restent en cours. Une suspension Windows a interrompu un scénario long et des sockets ; les résultats interrompus ne sont pas comptés comme réussis. L’idempotence serveur manquante ci-dessus a été découverte par le test local, pas masquée par des mocks.

## À finaliser avant livraison

Validation complète des scénarios locaux Duo et de la table d’entraînement, preuves comparatives web/RN, contrôles au SHA exact, captures finales et lancement Expo Go avec URL fraîchement vérifiée. Maintenir la PR en DRAFT jusqu’à la validation physique du propriétaire.
