# Stratégie des bots Contrée KFFR

Les bots utilisent des heuristiques explicites et des simulations Monte Carlo. Ils ne font pas de machine learning et ne lisent pas les mains cachées réelles.

## Profil officiel et variante avancée

`OFFICIAL_BOT_PROFILE_ID` vaut `human_doctrine_v3_1_conversation_mc_v1`. En Contrée classique, les enchères viennent de Human Doctrine V3.1 et le jeu de carte de Monte Carlo V1, avec un repli heuristique. Cette combinaison reste celle de Solo et du Multiplayer.

`advanced_rules_v4_experimental` est une stratégie distincte dans le registre de simulation. Elle étend V3.1 aux règles avancées sans promotion automatique. Les benchmarks appariés et une validation humaine sur la preview sont requis avant de changer le profil officiel.

## Choix du contrat

V3.1 conserve la conversation d'enchères à la couleur : fondation J/9, longueur d'atout, contrôles extérieurs, message du partenaire et plafond intrinsèque. V4 compare ce candidat aux modes Sans Atout et Tout Atout seulement s'ils sont autorisés par `resolveGameRules(state.settings)`.

En Sans Atout, V4 valorise les As, les 10 protégés, les séquences et les longueurs avec contrôle. Des couleurs sans As ou un 10 exposé diminuent la confiance. En Tout Atout, chaque couleur utilise la hiérarchie J, 9, As, 10 ; les J/9 associés et les contrôles répartis comptent davantage que la somme brute des points. La force de chaque mode donne un plafond : une main suffisante pour 80 ne peut pas surenchérir à 140 sans contrôle supplémentaire. À force proche, la couleur et la conversation V3.1 restent prioritaires.

Les annonces de la main propre sont calculées par le détecteur du moteur. Tierce, cinquante, cent et carré sont pris en compte uniquement si les règles les activent. Le bonus est décoté, car les annonces adverses peuvent les battre ; il est plus fort quand elles comptent réellement pour la réussite du contrat. La Belote/Rebelote connue apporte un faible bonus quand le ruleset l'autorise et la compte pour le contrat. Aucune action artificielle « annoncer » n'est ajoutée : le moteur détecte ces événements pendant le jeu.

## Capot, Générale, Coinche

V4 ne demande Capot seule que si les huit cartes sont dans des séquences maîtresses sans trou selon le mode. Sept maîtres personnels et un seul trou peuvent aussi suffire si le partenaire a annoncé au moins 110 dans le même mode : son message public apporte alors la pièce manquante probable. Cette exigence évite de transformer une main simplement riche en Capot. Générale conserve son évaluateur séparé, très conservateur : le moteur exige que le preneur gagne personnellement huit plis et rend son partenaire inactif. Les deux actions respectent les drapeaux du ruleset.

Pour Coinche, V4 estime des plis défensifs crédibles à partir des maîtres et du contrôle d'atout ; la hauteur du contrat module le seuil. Pour Surcoinche, elle exige une marge au-dessus du contrat, ou une main de Capot/Générale très forte. Ces vérifications fonctionnent aussi en Sans Atout et Tout Atout. Les actions interdites par le ruleset sont refusées avant l'envoi au moteur.

## Jeu de carte

En contrat couleur ordinaire, V4 conserve Monte Carlo V1. Le choix d'une entame atout volontaire en défense est corrigé après l'évaluation : avec des couleurs de remplacement raisonnables, elle est écartée. Une coupe, une fourniture ou une montée imposée par les règles n'est jamais pénalisée. Tard dans la manche, une entame atout redevient possible si le défenseur détient l'atout maître, au moins deux atouts et qu'au plus un atout inconnu reste hors de sa main. L'attaquant peut toujours tirer atout avec contrôle.

En Sans Atout, le bot joue les maîtres visibles, protège les 10 et cherche à affranchir les couleurs. En Tout Atout, il lit les maîtres J/9 dans chaque couleur. Les deux modes utilisent la liste de cartes légales du moteur, la main propre et les cartes déjà jouées. Un Monte Carlo de budget inférieur à la version classique examine les coups ambigus ; les rollouts ne reçoivent que des répartitions plausibles des cartes inconnues.

L'utilité interne Monte Carlo suit le contrat : réussite et marge en points pour un contrat ordinaire, succès du contrat avec poids accru après Coinche/Surcoinche, tous les plis du camp pour Capot, et huit plis personnels du preneur pour Générale. En défense de Capot, un seul pli suffit à faire chuter le contrat. Le scoring réel du moteur reste inchangé.

## Limites et validation

La prédiction des annonces du partenaire reste volontairement absente : sa main est cachée. L'évaluateur Capot peut manquer une occasion fondée sur des cartes du partenaire. Les mondes Monte Carlo sont échantillonnés et leurs continuations restent heuristiques ; un excellent coup tactique peut échapper à cette approximation. V4 demeure expérimentale tant que les simulations par ruleset et la relecture humaine ne justifient pas sa promotion.

Le harness `npm run benchmark:advanced-rules -- --pairs=2` joue des seeds appariées avec inversion des camps. Les sept configurations, fréquences de contrats, annonces, Coinches, entames atout défensives et temps de décision sont décrits dans `reports/bot-advanced-rules.md`. Les tests ciblés sont dans `tests/advancedRulesBot.test.ts`.
