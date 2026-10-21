# Parité web / React Native

Complément après test physique : [preuves et mesures des quatre corrections](IOS-FIXES.md). Les captures initiales restent historiques ; le lobby corrige ses cibles et son bandeau, la main partagée interpole toute sa position et les deux plateformes trient selon le contrat annoncé pendant les enchères.

Les captures proviennent des véritables pages Next.js et de la véritable route native, rendue par React Native Web avec Expo UI et Reanimated réels. Les seules substitutions concernent les comptes, le stockage, l’orientation/safe areas et le transport de test. Aucun mockup n’est présenté comme une partie réelle. Les projections sont générées par le moteur serveur existant ; aucune main adverse n’entre dans le graphe iOS.

| Fonctionnalité | Web | Natif livré | Tests / écarts |
| --- | --- | --- | --- |
| Créer/rejoindre | API create/find, code | Mêmes intentions, éditeur de règles Solo | Contrôles natifs + parcours croisé ; présentation compacte, code dans une feuille pour le clavier |
| Reprise | UUID/code connu, pas d’inventaire serveur | Dernière table locale liée au compte + code/invitation | GET sans création ; pas de découverte automatique interappareil |
| Lobby | Quatre places et état serveur | Quatre positions autour de la feutrine, noms/prêts/présence/hôte | Captures places libres et quatre humains aux trois tailles ; place concurrente et salon occupé refusés serveur |
| Bots | Remplissage des places au start | Même start-game ; pas d’ajout de bot inventé | Partie complète deux humains/deux bots, timers/takeover |
| Projection | viewerSeatIndex, partenaire en face | Même helper `tableSeatsFor`, centre/collecte tournés | Quatre viewers × cinq états × trois tailles ; scores nous/eux selon parité d’équipe |
| Table | GameTable/HumanHand/PlayerPanel | Composants natifs du Solo, partagés directement | Feutrine/cartes/éventail/HUD/annonces ; insets vérifiés, même jeu public |
| Enchères | Sélecteurs et autorité serveur | Sélecteurs et contrôles Solo avec viewer réel | Valeurs, modes, annonces spéciales et confirmations du Solo conservés ; tests payloads/moteur |
| Carte | Pose provisoire/version/confirmation | Animation Solo immédiatement, une intention | Doubles appuis, refus/409/réseau/timeout, réponse tardive, pas de spinner ; pas de prédiction du résultat |
| Realtime | Postgres Changes puis GET | Même mécanisme + AppState/focus | Parcours croisé avec deux vrais SDK Supabase et WebSocket local simulé ; déconnexion/reprise et subscriptions nettoyées |
| Heartbeat/tick | 15 s / tick 4 s + délai bots | Constantes/helpers communs, boucle séquentielle native | Tests cadence, arrêt, timeout/takeover, reconnexion ; délais serveur inchangés |
| Plis | Présentation publique + dernier pli | Store de présentation Solo, même queue | Captures pli/dernier pli, pas de replay à la reprise ; collecte commune |
| Résultats | Résultat serveur, fin, Elo | Résultat final, détails/historique de manches, Elo et XP/niveau lus | Parties complètes et forfait/rematch ; ledger, Elo et attribution XP restent serveur |
| Invitations | Résoudre puis accepter après place | Mêmes endpoints et parseurs partagés | Test natif reçue/résolution/place/acceptation ; erreurs/expiration conservées ; liste reçue actualisée au focus et toutes les 30 s |
| Hôte/absence | Transfert, claim, bot temporaire | Intentions correspondantes, permissions d’affichage | Tests serveur/transport ; reprise humaine par présence, confirmation du forfait |
| Règles/préférences | Règles lobby, rythme partagé, préférences locales | Éditeur Solo, paramètres de table hôte, préférences personnelles | Les contrôles de rythme local sont masqués en Multi ; changement des règles redemande les prêts côté serveur |
| Audio/accessibilité | Sons/musique, contrastes, mouvement réduit | Audio natif Solo et préférences communes à l’appareil | Export/contrôles/animations réelles en RN Web ; écoute, VoiceOver et performances iPhone encore à vérifier |

## Écarts explicites

- Polices, ombres, flous et contrôles de formulaire suivent leur plateforme. Le lobby et l’accueil multijoueur sont composés pour l’écran paysage ; ils ne reproduisent pas le long défilement de la page web.
- Le menu natif remplace la navigation globale du site. Les pages web complètes Amis, Historique, Classement et Progression ne sont pas de nouvelles routes natives dans cette PR. Le jeu conserve leurs données communes ; la table affiche ses manches, le résultat Elo et le total XP/niveau disponibles.
- Les invitations sont actualisées en premier plan (focus/retour et 30 s). Pas de push notification en arrière-plan, comme aucune nouvelle infrastructure de notification n’a été créée.
- La scène de résultat reprend les composants natifs du Solo, avec titre final victoire/défaite/forfait et score final. La version web utilise sa carte de fin dédiée.
- L’app ne force pas automatiquement la dernière carte du joueur en multijoueur ; il peut la toucher. L’arbitrage et le timeout serveur restent identiques. Aucun délai serveur n’a été modifié.
- Aucune liste de salons interappareil, ni delta XP inventé par partie. Le total XP/niveau vient du RPC existant ; une erreur de lecture est affichée comme indisponibilité.
- Les tests mémoire ne remplacent pas les RPC atomiques/RLS en base : les suites existantes de réservation et de Supabase local restent en CI. Aucun test n’utilise la production.
- QA physique iPhone + PC, conditions radio réelles, VoiceOver, son et FPS : à réaliser selon la checklist distincte.
