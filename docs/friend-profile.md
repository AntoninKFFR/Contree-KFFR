# Profil ami V1 (#114)

`/friends/[userId]` expose un résumé uniquement aux amis acceptés. La RPC
`public.get_friend_profile(p_friend_id uuid)` utilise le JWT du visiteur,
`private.social_actor()` puis `private.social_are_friends()` avant toute lecture
sur la cible. Null, self, inconnu, demandes envoyées/reçues et ami supprimé ont
la même erreur `friend_profile_unavailable`. Une nouvelle lecture après suppression
est refusée. Cette lecture stable ne crée aucune ligne.

## Projection et calculs

Le JSON contient seulement `userId`, `username`, `level`, `equipped` (title/badge/frame
objet `{key,slot,name,visualVariant}` ou null), `solo`, `multiplayer` et `rating`.
Chaque agrégat contient games/wins/losses/winrate, arrondi au pourcentage entier,
avec zéro pour aucune partie. Solo utilise les games persistées et won, comme le
profil personnel. Multi utilise les archives, participants human et user_id cible,
une ligne par game (premier siège en cas de doublon historique), team_id=winner_team
pour une victoire. Les forfaits suivent également winner_team. Les bots sont exclus.

Le niveau est dérivé exclusivement de player_progression.total_xp, virtuellement 1
si absent. Le helper privé progression_level_from_total_xp effectue une recherche
binaire exacte sur progression_total_xp_for_level, T(N)=25*(N-1)*(N+6)/2, pour toute
XP valide jusqu’à Number.MAX_SAFE_INTEGER. La CI compare le vrai getProgression TS
aux frontières SQL, y compris de hauts niveaux.

Les trois apparats sont joints au catalogue depuis l’équipement, pas depuis les
unlocks. Le parseur vérifie les clés, slots et variantes du registry existant.
ProfileIdentity/ProfileBadge/ProfileFrame/ProfileTitle partagent le rendu du profil
personnel sans fabriquer de dates de déblocage.

Rating est null avant cinq parties classées. Sinon seuls rating/rank/position
actuels sont exposés. Le rang utilise private.rating_rank ; la position réutilise
DENSE_RANK sur les joueurs éligibles (>=5 et pseudo présent), comme le leaderboard.

Aucun XP brut, ledger, unlock, collection complète, cosmétique futur, mission,
historique, score, contrat, statistique avancée ou delta de rating n’est exposé.

## Sécurité, API et UI

Les fonctions privées/public wrapper suivent le pattern social : SECURITY DEFINER
privé avec search_path vide, références qualifiées, droits EXECUTE authenticated
seulement. Le helper niveau n’est pas exécutable par les clients. Aucune table,
policy générale ni droit d’écriture n’est ouvert. Les tests JWT prouvent que
l’accès propriétaire direct aux tables n’est pas élargi.

GET /api/social/friends/[userId]/profile valide bearer/UUID, appelle la RPC avec
le JWT du visiteur, parse et projette le JSON ; toutes les réponses sont private,
no-store. fetchFriendProfile valide aussi UUID et identité cible avant/après fetch.

La fiche contient identité, niveau, présence issue de useFriendPresence, Solo,
Multijoueur, classement pertinent et retour aux amis. Jouer/S’entraîner utilisent
friendGamePath, partagé avec FriendsPageClient : mêmes invitations et fallback.
La présence défaillante ne bloque pas le profil. Le changement de compte/logout,
les événements sociaux et focus invalident le résumé ; une réponse tardive ne peut
réafficher l’identité de la précédente session.

## Liste et déploiement

get_my_social_snapshot enrichit uniquement chaque friend avec level par LEFT JOIN
dans la requête agrégée existante. user_id/username/created_at, demandes et counts
restent inchangés ; aucune stat n’entre dans la liste. Le nouveau SocialFriend
requiert level ; les demandes conservent leur type identité séparé. La liste affiche
Niv. X, Voir le profil, Jouer, S’entraîner, Supprimer et présence. Les apparats compacts
optionnels ne sont pas ajoutés à la liste : la fiche montre les trois.

Une seule migration additive 20261001040000_friend_profile_summary.sql suit #113.
L’ancien client ignore level et n’appelle pas la nouvelle RPC. Séquence : review,
appliquer séparément la migration prod, puis merge/déployer. Codex n’applique aucune
migration prod et ne répare pas l’historique. Tests DB/E2E exclusivement Supabase local
jetable en CI ; tous les fixtures sont supprimés/rollback.
