# API de lecture Elo V1

Cette API expose l'Elo aux utilisateurs authentifiés sans ouvrir l'accès direct aux tables Elo ou aux profils.

## Résumé personnel

`get_my_rating_summary()` ne prend aucun identifiant utilisateur. La fonction utilise uniquement `auth.uid()` et renvoie :

- `rating`, `rated_games`, `wins`, `losses`, `forfeits`, `peak_rating` ;
- `rank`, `position`, `placement_games`, `is_ranked` ;
- `pending_matches`, soit le nombre de matchs Elo `pending` auxquels l'utilisateur participe comme humain identifié.

Sans ligne dans `player_ratings`, la réponse est un état virtuel à 1000 Elo avec des compteurs à zéro. Aucun enregistrement n'est créé par la lecture. Avant cinq parties appliquées, `rank` et `position` valent `null`, `is_ranked` vaut `false` et `placement_games` vaut le nombre de parties appliquées.

Après cinq parties, un joueur sans pseudo public conserve son Elo et ses compteurs, mais reste non publiable : `is_ranked=false`, `rank=null` et `position=null`. `placement_games` reste plafonné à 5. Il devient classé dès qu'il possède un pseudo public valide.

La position personnelle est calculée sur tous les joueurs classés, indépendamment de la page de leaderboard affichée.

## Leaderboard

`get_rating_leaderboard(p_limit := 50, p_offset := 0)` accepte une limite de 1 à 100 et un offset positif ou nul. Seuls les joueurs ayant au moins cinq parties appliquées et un pseudo public non nul sont inclus.

Le rang de position est calculé avec `DENSE_RANK()` sur l'Elo décroissant avant pagination. L'ordre est stable : Elo décroissant, puis identifiant interne. La réponse contient exactement :

- `username` ;
- `rating` ;
- `rank` ;
- `position`.

L'identifiant interne sert uniquement à stabiliser l'ordre et n'est jamais renvoyé. Aucun email, UUID, compteur privé ou autre donnée de profil n'est exposé.

## Sécurité

Les deux RPC publiques sont accordées à `authenticated` seulement. Elles appellent des fonctions privées bornées qui vérifient `auth.uid()`. Les rôles `public` et `anon` n'ont aucun droit d'exécution. Les politiques et droits de `profiles` restent inchangés : un utilisateur ne peut lire directement que son propre profil.

Les tables Elo restent sans accès direct pour `anon` et `authenticated`. `apply_rating_match` reste réservé à `service_role`.
