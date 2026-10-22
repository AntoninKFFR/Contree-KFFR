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

## Validations reproductibles

- Web : typecheck, lint, build ; 200 fichiers / 1 999 tests réussis (suite finale avec deux workers), dont parité des questions sur projections publiques pour 200 seeds. 92 parcours smoke réussis, incluant les exercices et trois références web aux mêmes seeds/progression que les captures natives.
- Mobile : typecheck, lint ; 73 tests purs et 52 tests de navigation/UI réussis. Un lancement simultané des suites a dépassé deux délais de 5 s ; les relances isolées ont passé sans modifier les délais des tests.
- Géométrie complète : 223 réussites et un scénario interrompu pendant une suspension Windows ; le scénario final-trick/Multijoueur/844 a ensuite réussi seul. Sept parcours d’entraînement couvrent 568×320, 844×390 et 932×430, toutes les familles, corrections, série complète et persistance. La CI exécute la suite complète sur Linux.
- Export iOS avec source map, audit du graphe Metro sans serveur/DOM/fixtures, configuration native, versions Expo et Expo Doctor 21/21. Aucun binaire iOS signé ni test physique prétendu.
- scripts/testNativeTrainingLocal.ts : backend Next.js/Supabase LOCAL réel, SDK natif 2.118.0 et client web, trois séries complètes natif→web, web→natif, natif→natif, réponses différentes, opérations concurrentes, reconnexion Realtime et reprise au milieu. Invitations réelles et records du compte/amis. Les comptes sont temporaires et supprimés en fin de test ; aucun test authentifié en production.
- scripts/testNativeTrainingUiLocal.ts : contrôles React Native Web et web réels, deux contextes authentifiés, hôte dans chaque sens, dix questions, réponses privées jusqu’à révélation, correction, rechargement à la question 5, résultats. La table native Solo utilise également ses vrais endpoints/bots pour la pause pédagogique, la correction et la reprise.
- Le test DB Duo existant a également passé ses contrôles JWT, RLS, concurrence, Realtime, invitations et nettoyage sur le stack local déjà disponible. Aucun reset ou migration de ce stack n’a été exécuté par cette tâche.

Les preuves structurées sont local-integration.json et ui-local-integration.json. Les captures web/native comparables et leurs paramètres sont dans captures/ ; les captures Duo proviennent des deux interfaces authentifiées du même salon local. Elles restent des rendus navigateur de composants natifs, pas une preuve iPhone.

## Livraison et validation restante

PARITY.md présente tous les modes/niveaux et la distinction local/compte. IPHONE.md est le protocole physique. EXPO-GO.json et expo-go-qr.png donnent le tunnel de développement réellement vérifié (manifeste SDK 57 et bundle iOS), dont la validité dépend du PC et de Metro.

Le contrôle physique iPhone, VoiceOver, encoche et fluidité tactile, ainsi que le crossplay entre deux iPhone physiques, restent à effectuer par le propriétaire. Le simulateur EAS n’a pas été créé : projet non lié à EAS. La PR reste DRAFT, sans fusion. La limite de déduplication serveur ci-dessus reste explicite et sans migration implicite.
