# PR B — cycle de vie Elo V1

La migration `20260921020000_rating_lifecycle.sql` est à appliquer **après** la fusion de cette PR. La migration PR A reste intacte. La base distante n'est pas utilisée pour les tests destructifs.

## Démarrage

`start-game` génère un nouvel `active_game_id`, remplit les sièges vides avec `advanced_rules_v4`, puis appelle `start_multiplayer_game`. Cette RPC exécute le commit de la room et crée le snapshot Elo dans **la même transaction**. Un échec du snapshot annule le démarrage.

L'éligibilité compare le JSON normalisé complet de la room, celui de l'état de jeu et `CONTREE_KFFR_RULESET` officiel V1. Les variantes et les parties solo ne créent aucun snapshot. Pour chaque humain, la transaction crée `player_ratings` à 1000 si absent, verrouille les lignes dans l'ordre des `user_id`, puis fige la cote et K (40/36/32). Pour chaque bot, elle fige le profil, la version et la cote résolus par le registre serveur. La composition initiale détermine la fiabilité ; un takeover ultérieur ne la modifie pas.

## Fin et abandon

Les chemins ordinaires, le timer et le bot takeover appellent tous `persist_multiplayer_archive` dans leur transaction de fin. Cette fonction archive la partie et les quatre sièges, puis crée au plus un `rating_match pending` et quatre participants depuis le snapshot initial. Aucun delta Elo n'est calculé dans cette transaction. `source_game_id UNIQUE` et la validation du résultat empêchent de réécrire un match déjà enregistré. Une revanche utilise un nouvel `active_game_id`.

Pour un abandon, `forfeitRoom` dérive `forfeiting_seat_index` du `userId` authentifié et du siège humain vérifié. Le client ne fournit ni siège ni `user_id` de forfeiter. L'archive et le match pending conservent ce siège ; une déconnexion et un takeover ne sont pas des abandons.

## Application séparée

Après le commit de fin, le serveur appelle `apply_rating_match(source_game_id)` en best effort. Un échec est journalisé et laisse la room `finished`, l'archive intacte et le match `pending`. La fonction est réservée à `service_role`, verrouille le match, vérifie l'archive, le snapshot et les quatre sièges, puis verrouille les ratings humains par `user_id` croissant. Elle calcule la formule V1 depuis les valeurs du début et ajoute chaque delta au rating **courant**. Toutes les écritures du ledger, des compteurs et du statut `applied` sont dans une seule transaction. `applied` et `void` ne sont jamais recalculés.

Le transfert de forfeit est calculé après les deltas normaux. Avec deux pertes normales de −16, l'auteur reçoit −24 et son partenaire humain −8 ; un partenaire bot ne reçoit aucun transfert. À l'application seulement, le plancher absolu est `effectiveDelta = max(calculatedDelta, -ratingBeforeApply)`. Le ledger stocke ce delta réellement appliqué, ce qui maintient `before + delta = after`. Une défaite à 0 Elo compte dans `rated_games` et `losses`, même avec un delta effectif nul.

Si un compte est supprimé, sa ligne `player_ratings` disparaît ; les liens `user_id` des snapshots et du ledger deviennent nuls. Une application tardive ne recrée pas cette cote, mais peut encore créditer les autres participants. Les tables Elo ne stockent aucun pseudo.

## Reprise opérateur

`npm run rating:retry -- --allow-host=<hôte exact> --limit=20` liste les pending sans mutation. Pour traiter au plus 20 matches, ajouter `--execute`. Le script exige `RATING_RETRY_SUPABASE_URL` et `RATING_RETRY_SERVICE_ROLE_KEY` dans l'environnement serveur et un hôte explicitement confirmé ; aucune clé n'est affichée. Le traitement appelle la même RPC idempotente et affiche un résultat par `source_game_id`. Aucun Cron ou worker externe n'est ajouté.

Les RPC de lecture, le résumé personnel et le leaderboard minimal restent pour la PR C. L'interface peut montrer temporairement l'ancien Elo tant qu'un match est `pending`.

L'écran de fin multijoueur lit désormais le résultat du match par `source_game_id` dans une RPC privée au participant. Le statut `pending` reste affiché comme calcul en cours, avec quelques nouvelles lectures espacées ; `applied` affiche les trois valeurs déjà inscrites au ledger, et une partie sans match ne présente aucun faux delta. Le retour de l'hôte au lobby conserve l'archive et remet `active_game_id` à `null` ; le démarrage suivant en crée un nouveau.
