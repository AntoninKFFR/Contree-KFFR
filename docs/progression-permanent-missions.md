# Missions de départ permanentes (#104)

Le catalogue SQL `progression_permanent_missions` est l’unique source des montants :

| Ordre | Clé stable | Titre | XP |
| --- | --- | --- | --- |
| 1 | `first_game` | Première partie | 100 |
| 2 | `first_win` | Première victoire | 150 |
| 3 | `first_solo` | Premier Solo | 100 |
| 4 | `first_multiplayer` | Entre amis | 150 |
| 5 | `first_training` | S'entraîner | 100 |

`progression_permanent_mission_completions` conserve la première source réelle
(type Solo/Multi/Training et UUID du résultat/série), même lors d’un retry avec une
autre source. La PK `(user_id, mission_key)` rend la complétion permanente.
Le ledger utilise `permanent_mission / <mission_key>`, indépendamment de cet audit.

## Écriture et atomicité

`private.complete_permanent_mission` valide la source et le catalogue, verrouille
la progression du joueur avant la complétion, puis appelle `credit_progression_xp`.
Complétion et XP appartiennent à la transaction appelante : une erreur annule les
deux. PK, unicité du ledger et verrou du solde empêchent les doubles récompenses.
Le helper privé n’est exécutable ni par le navigateur ni par `service_role` ; les
fonctions privilégiées appelantes l’utilisent en tant que propriétaire. Les tables
ont RLS et aucun droit d’écriture directe, y compris pour `service_role`.

- **Solo** : AFTER INSERT `games`, uniquement lorsque l’ID correspond à une
  `solo_game_sessions` du même joueur. Le commit terminal serveur conserve la
  transaction résultat + missions + XP de partie. Première défaite : 220 XP ;
  première victoire : 380 XP. Les imports historiques sans session sont ignorés.
- **Multi** : `apply_progression_multiplayer_game`, dans l’outbox existante. Tous les
  humains d’une fin normale obtiennent les missions partie/Multi ; les gagnants
  obtiennent aussi victoire. Sur forfait, seule l’équipe gagnante est éligible.
  Bots exclus ; un humain repris par bot reste humain dans l’archive. Tous les
  crédits d’un joueur sont traités avant le joueur suivant, dans l’ordre UUID.
  Une erreur mission annule tous les crédits de cette tentative et laisse le job
  pending. Premier gagnant : 450 XP ; premier perdant normal : 280 XP.
- **Training** : appel explicite dans `record_verified_training_series`, juste après
  insertion. Le serveur vérifie le JWT, rejoue le générateur et grade les réponses
  dans `verifyTrainingSeriesSubmission` avant cette RPC réservée au serveur.
  Aucun XP direct de série : seul `first_training` rapporte 100 XP une fois.
  Les insertions administratives directes ne déclenchent pas de mission.
  Duo, Survival, Blitz, exercices locaux/non persistés et modules ouverts exclus.
  La quota de séries peut supprimer la ligne source ; l’UUID d’audit reste conservé.

## Lecture et UI

`get_my_permanent_missions()` sans paramètre utilise `auth.uid()` et retourne
les cinq missions triées, même pour un compte sans complétion : `key`, `rewardXp`,
`completed`, `completedAt`. RLS limite les complétions au propriétaire ; aucune
identité source ne passe dans la query de présentation. La query valide clés et
ordre. Le TypeScript ne contient que la copie produit, sans montants métier.

Le Provider #103 charge les missions en parallèle du résumé et des gains récents.
Une erreur missions préserve niveau, navbar et barre XP. Le même debounce 150 ms,
coalescing et événement partagé relisent les trois données. Training émet cet
événement uniquement après une réponse HTTP de sauvegarde réussie.
`/progression` affiche cinq lignes 0/1 ou ✓ Terminé, récompense serveur et copie
produit ; Home garde sa présentation. Les gains récents portent le libellé Mission.

## Déploiement et absence de rétroactivité

Une seule nouvelle migration : `20261001000000_progression_permanent_missions.sql`.
Déployer la migration avant le client. Aucun historique n’est scanné ni backfillé.
Les jobs Multi déjà présents ont `permanent_missions_eligible = false`, y compris
les jobs pending rejoués après déploiement. L’enqueue des nouvelles archives met
le marqueur à true. Aucun reset, claim, weekly ou changement Elo/scoring/game XP.
La production Supabase n’est jamais utilisée par les tests de cette PR.

## Vérification

`testProgressionMissionsSchema.sql` teste catalogue, permissions, helper, sources,
absence de rétroactivité, cumuls Solo, forfait et rollback Solo/Multi/Training.
`testProgressionMissionsDb.ts` teste de vrais JWT et la route Training vérifiée,
retries concurrents, RLS et deux Multi concurrents aux sièges inversés. Le workflow
Progression exécute ces tests avec Supabase et Next locaux jetables. Les autres
suites DB continuent à vérifier Training/Duo, Rating et Social. Vitest et Playwright
couvrent query, Provider, UI, erreurs isolées et notification Training.
