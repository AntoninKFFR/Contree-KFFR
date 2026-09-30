# Missions hebdomadaires V1 (#105)

## Semaine et sélection

La DB définit `week_start` comme `date_trunc('week', at AT TIME ZONE
'Europe/Paris')::date`. L’intervalle actif est [lundi 00:00 Paris, lundi suivant
00:00 Paris). Le reset est `(week_start + 7)::timestamp AT TIME ZONE
'Europe/Paris'` : les semaines DST peuvent durer 167 ou 169 heures UTC.
Le 30 mars 2026 à minuit Paris est le 29 mars à 22:00 UTC ; le 26 octobre
à minuit Paris est le 25 octobre à 23:00 UTC. Aucune date canonique côté client.

`progression_weekly_catalog_versions` choisit la dernière version dont
`active_from_week <= week_start`. Version initiale 1, active depuis 2026-09-28.
Les futures migrations doivent AJOUTER une version et ses missions, sans modifier
rétroactivement un ancien catalogue. Le serveur est la source des versions.

| Clé | Famille | Objectif | Target | XP |
| --- | --- | --- | --- | --- |
| regular_games | games | completed_game | 5 | 300 |
| wins | wins | won_game | 3 | 300 |
| solo_games | solo | completed_solo | 3 | 200 |
| multiplayer_games | multiplayer | completed_multiplayer | 2 | 250 |
| training_series | training | completed_training | 3 | 200 |

Le sélecteur classe chaque candidat par `md5('v'||version||'|'||YYYY-MM-DD||'|'||key)`,
puis clé comme tie-break, avec collation C explicite indépendante du serveur. Il retient le premier de chaque famille, puis les trois
premiers du classement global. Moins de trois familles est une erreur de catalogue.
Pour 2026-09-28 : wins, training_series, solo_games (ordre du ranking).
L’affichage utilise `sort_order` : wins, solo_games, training_series.
La sélection est identique pour tous les comptes et stable toute la semaine.
Aucun random, cron ou table d’assignation par joueur.

## Progression, déduplication et récompense

Quatre nouvelles tables : versions, catalogue `progression_weekly_missions`,
`progression_weekly_progress`, `progression_weekly_events`. RLS propriétaire pour
progress/events, lecture authentifiée du catalogue. Aucune écriture directe,
y compris pour service_role. Helpers privés non exécutables par les rôles API.

La PK progress est `(user,week,version,mission)`. Le target stocké pour le CHECK
`0 <= progress <= target` est contraint par FK au catalogue, sans montant dupliqué.
La PK events est `(user,week,version,mission,source_type,source_id UUID)`.
Chaque événement peut compter une fois pour chacune des missions correspondantes.
Les événements après complétion restent audités, mais le compteur est plafonné.
Les anciennes semaines restent en DB sans purge automatique.

`private.apply_weekly_progression_event` valide type/mode, compare semaine événement
et traitement, verrouille d’abord player_progression, puis revérifie l’expiration
après l’attente du verrou. Il sélectionne les objectifs, déduplique, incrémente et
récompense le passage au target via `credit_progression_xp`. Identité reward :
`weekly_mission / v1:2026-09-28:solo_games`, soit version:semaine:clé.
Toutes les mutations et récompenses restent dans la transaction appelante.
Une erreur reward annule compteur, déduplication et autres crédits de la tentative.

## Sources autoritaires et expiration

- Solo : même trigger #104 sur un nouveau games lié à une session serveur. Une
  défaite compte partie/Solo ; une victoire compte aussi wins. Client non fiable
  et historique importé ne déclenchent rien.
- Multi : outbox existante, humains par UUID stable ; game XP, permanent, weekly
  pour un joueur avant le suivant. Fin normale : tous les humains comptent ;
  forfait : uniquement les humains gagnants. Bots exclus, humain repris par bot
  reste participant humain. Aucun deuxième outbox.
- Training : appel explicite dans record_verified_training_series après insertion,
  à la suite du JWT, replay et grading serveur. Aucun XP direct de série. Duo,
  Survival, Blitz, local/non persisté et simple ouverture sont exclus.

L’événement garde son timestamp réel (`games.created_at`, `finished_at`,
`training_series.created_at`). Le traitement utilise l’horloge DB après acquisition
du verrou. Si les semaines diffèrent, aucun compteur weekly de l’ancienne OU
nouvelle semaine n’est touché. Un Multi delayed conserve ses game XP et missions
permanentes éligibles, mais ne ressuscite pas une weekly expirée. Le paramètre
processing_at existe uniquement dans le helper privé pour des tests temporels.

## Lecture, UI et rollover

`get_my_weekly_missions()` sans argument dérive auth.uid(), filtre explicitement
le compte courant et ne crée aucune ligne. JSON : catalogVersion, weekStart,
nextResetAt, missions [{key,target,progress,rewardXp,completed,completedAt}].
Compte neuf : trois objectifs à zéro. La query valide ce contrat et retire les
identités techniques. TypeScript ne contient que copie produit ; descriptions
interpolent le target du serveur.

Le Provider charge weekly avec XP/récents/permanent et isole weeklyError.
Il conserve l’événement partagé, debounce 150 ms, coalescing et refresh existants.
Un seul timeout jusqu’à nextResetAt invalide la lecture ; les délais supérieurs
au maximum JS sont réarmés séquentiellement. Cleanup sur compte, erreur et unmount,
StrictMode couvert. Un reset déjà tenté n’est pas repollé si une réponse périmée
revient. Focus/navigation/online permettent ensuite de récupérer une erreur.
Le nouveau snapshot programme le prochain reset, sans hard refresh.

Cette semaine précède Missions de départ sur /progression : trois cartes, compteur,
barre ARIA plafonnée, reward, Terminé et reset commun. Home reste serveur et utilise
un aperçu client compact, non terminées avant terminées, avec CTA existant.
Home déconnecté inchangé et aucune query weekly. Le countdown est recalculé
localement toutes les 60 secondes, sans réseau. XP récents : Mission hebdomadaire.

## Activation et validation

Une seule migration additive : 20261001010000_progression_weekly_missions.sql.
Appliquer séparément AVANT merge/déploiement du client #105. Le client #104 et ses
RPC continuent de fonctionner. Aucune opération production dans cette PR ; ne pas
réparer l’historique de migration production.

Aucun scan/backfill : activation en milieu de semaine compte seulement les nouveaux
événements. La nouvelle colonne outbox weekly_missions_eligible vaut false pour
les anciens jobs, même pending. Le nouvel enqueue renseigne true pour les DEUX
marqueurs permanent/weekly. #104 et tous ses montants restent inchangés.
Aucun claim, daily, streak, Battle Pass, reroll ou changement gameplay/Elo/scoring.

Tests SQL : catalogue/familles/versions, sélections explicites, DST, limites reset,
expiration, déduplication, triple complétion, plafonds et rollback des trois hooks.
Deux sessions SQL concurrentes vérifient N-1 + deux sources, avec une seule reward.
Tests JWT/Next vérifient lecture sans écriture, RLS/grants, Training réellement
gradé, étapes/rewards et Multi concurrents aux sièges inversés. La CI teste
l’application réelle depuis #104 avec ancien job pending et historique Training.
Vitest couvre Provider, fake timers/StrictMode, UI/query/Home ; Playwright couvre
Home/progression, thèmes et 320 px. Les anciennes suites DB restent exécutées.
