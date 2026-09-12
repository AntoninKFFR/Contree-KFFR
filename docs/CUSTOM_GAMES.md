# Parties personnalisées

## Flux de confiance

Le navigateur n'envoie jamais un `GameRulesetSnapshot` arbitraire. Il envoie un `CustomRulesetInput` composé du preset `contree-kffr` et de surcharges autorisées. `parseCustomRulesetInput` refuse les sections et propriétés inconnues; `buildCustomRuleset` applique les dépendances, valide le résultat et retourne un clone profondément gelé identifié `custom` dès qu'une option diffère.

## Solo

Le configurateur prépare uniquement la prochaine partie. « Appliquer et nouvelle partie » valide puis sauvegarde le DTO dans `localStorage` (`coinche:solo-rules:v1`). La lecture a lieu côté client après le premier rendu, ce qui conserve une hydratation sûre et une seule initialisation aléatoire. Un JSON absent, ancien ou corrompu revient à Contrée KFFR.

## Multijoueur

La room possède son snapshot avant le démarrage. Tous les membres en voient le résumé via la vue de room et Realtime. Le serveur réserve les modifications à l'hôte dans le lobby, utilise un contrôle de version CAS et remet les humains à « non prêt ». Le démarrage reconstruit le snapshot depuis la base; aucune règle transmise par le navigateur n'est consultée à ce moment. Le snapshot devient immuable dès que la room quitte le lobby.

La migration `20260913010000_custom_game_rules.sql` ajoute les métadonnées aux rooms et historiques. Les anciennes lignes restent lisibles grâce au couple historique `scoring_mode` / `target_score`.
