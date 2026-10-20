# Audit multijoueur iOS — #151

Base distante vérifiée : 0314cfb ; #147 et #150 fusionnées ; aucune PR ouverte. Branche feat/151-ios-multiplayer en worktree dédié ; checkout initial préservé.

API communes create/find, GET, intentions avec expectedVersion, presence et tick. Types riches MultiplayerRoomView/PlayerGameView. Autorité serveur pour places atomiques, règles, cartes, bots, hôte, forfait, archives, Elo, XP ; aucun changement backend/SQL/RLS/Auth ni déploiement.

Réutilisation : scène/main/enchères et présentation/audio/préférences/règles du Solo #150. Projection via tableSeatsFor et viewerPlayerId. Purs : règles de légalité/enchères, tri, trickPresentation, annonces et paramètres de table. Hors bundle : transitions engine/game/actions, bots, lib/server, DOM/Next.

Hooks web adaptés à AppState/focus Router : heartbeat 15 s ; tick humain 4 s ; délai bot via helper existant. Realtime invalide puis GET ; jamais afficher un payload DB. Ignorer versions obsolètes et réponses hors identité/écran. Une intention à la fois ; animation provisoire ; GET après 409/ambiguïté sans rejouer une mutation.

Audit des pages et composants multiplayer web, GameTable/HumanHand/BiddingPanel/PlayerPanel/RoundCompletionCard, roomTypes/API/Realtime/présence/optimisme/timers/préférences/hôte/historique, service/game/validation/routes rooms/social, et sources/tests/docs parity-150 natifs.

Pas d'API de liste des salons : reprise locale par UUID liée au compte, code pour autre appareil. Places libres remplies automatiquement par bots officiels au start ; pas d'action inventée. Invitations existantes : résoudre salon puis accepter après réservation d'une place. Changer les règles réinitialise les prêts.

Références : https://docs.expo.dev/versions/v57.0.0/ ; https://supabase.com/docs/guides/realtime/subscribing-to-database-changes ; https://supabase.com/docs/guides/realtime/postgres-changes ; https://reactnative.dev/docs/appstate . Postgres Changes conservé ; Broadcast demanderait triggers/RLS hors périmètre. Captures RN Web identifiées ; QA physique iPhone + PC distincte.
