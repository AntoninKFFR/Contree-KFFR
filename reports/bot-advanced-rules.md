# Bots et règles avancées — audit et expérimentation V4

## Audit initial

Le profil officiel reste `human_doctrine_v3_1_conversation_mc_v1` (`bots/profiles.ts`). Ses enchères couleur suivent Human Doctrine V3.1 et ses cartes Monte Carlo V1. `bots/simpleBot.ts` traitait SA/TA séparément : une main jugée suffisante pour 80 pouvait annoncer n'importe quelle valeur suivante, sans plafond lié au contrat demandé. Cette voie empêchait aussi Coinche/Surcoinche sur un contrat SA/TA courant. Le bot ne demandait pas volontairement Capot. Générale avait un évaluateur séparé et strict. Les annonces de la main ne pesaient pas sur l'enchère ; le jeu SA/TA était essentiellement un choix de carte légale peu coûteuse. Monte Carlo V1 examinait un seul candidat si `state.trump` était nul. En couleur, il pouvait choisir une entame atout volontaire en défense.

Le moteur fournit déjà les règles sélectionnées, la hiérarchie de cartes de chaque mode, les annonces automatiques, Belote/Rebelote, Capot et Générale. Générale exige huit plis **personnels** du preneur et rend son partenaire inactif. Les annonces adverses peuvent battre celles du preneur ; elles ne contribuent au contrat que si le ruleset le prévoit. Aucun changement de moteur ou de schéma n'a été nécessaire.

## Variante expérimentale

`advanced_rules_v4_experimental` est disponible dans le registre de simulation. Le profil officiel de Solo et Multiplayer n'est pas changé. V4 garde V3.1 pour les enchères couleur, compare les modes SA/TA autorisés au même plafond réel, et valorise avec prudence les annonces et la Belote connues dans sa propre main. Son jeu SA/TA utilise les maîtres et séquences propres à chaque mode ainsi qu'un Monte Carlo dont l'utilité dépend du contrat normal, doublé, Capot ou Générale. Les mondes simulés proviennent de la main propre et des cartes publiques, jamais des mains adverses réelles.

En couleur ordinaire, V4 garde Monte Carlo V1 mais écarte généralement une entame atout volontaire en défense lorsqu'une autre couleur est jouable. Les cartes d'atout imposées ne sont pas concernées ; une exception tardive reste possible avec maîtrise des derniers atouts. Le bot attaquant conserve la possibilité de tirer atout.

Après les grands benchmarks ci-dessous, trois points ont reçu des tests déterministes et des corrections limitées :

- **Coinche couleur** : six Coinches en 500 parties classiques n'ont provoqué qu'une chute. Le seuil expérimental exige maintenant un contrat adverse d'au moins 120, J et 9 d'atout en main et au moins 4,5 plis défensifs estimés. Les critères SA/TA et les règles de légalité ne changent pas. **Ce nouveau seuil n'a pas encore de validation statistique.**
- **Capot** : une main SA entièrement maîtresse pouvait être interprétée comme Capot à la couleur sans posséder d'atout ; les cartes hors atout pourraient être coupées. Un Capot couleur solitaire exige désormais au moins cinq atouts, et la variante appuyée par une enchère publique du partenaire au moins quatre. Les tests couvrent les modes couleur, SA et TA autorisés, une main insuffisante et un soutien partenaire dans le même mode.
- **Générale** : l'évaluateur couleur acceptait cinq atouts contenant J/9/A même avec un trou dans la séquence. Il exige maintenant huit cartes maîtresses sans trou, dont au moins cinq atouts. Le partenaire inactif ne Surcoinche plus sur la force de sa propre main. Les tests couvrent une main évidente, une main presque suffisante refusée, Générale SA/TA autorisée et TA interdite, ainsi qu'une donne complète avec partenaire inactif et huit plis personnels du preneur.

## Méthode et données

`scripts/benchmarkAdvancedRules.ts` oppose l'officiel à V4 sur les mêmes seeds, avec inversion des camps. Les sept configurations sont : classique, annonces, SA, TA, Capot avec modes étendus, Générale et toutes options compatibles. La cible est 1 000 points. Une action illégale fait échouer la partie via le moteur. Le script rapporte séparément par ruleset les contrats demandés/réussis, les Coinches, les annonces, les entames atout, les temps de décision moyen/p95/p99 et le CPU par partie.

Les résultats locaux fournis par Antonin sont archivés dans [`bot-advanced-rules-classic-500.json`](bot-advanced-rules-classic-500.json) et [`bot-advanced-rules-all-700.json`](bot-advanced-rules-all-700.json). Ils ont été produits **avant** les trois corrections ciblées décrites ci-dessus ; les chiffres qui suivent ne sont donc pas une mesure statistique du code corrigé. Les seeds de départ et les volumes figurent dans les JSON.

## Contrée classique — 250 seeds appariées, 500 parties

| Mesure | Officiel | V4 avant corrections ciblées |
| --- | ---: | ---: |
| Victoires | 251 | 249 |
| Score moyen | 851,72 | 853,56 |
| Contrats couleur réussis / demandés | 1 146 / 1 572 | 1 145 / 1 567 |
| Contrat moyen | 100,54 | 100,61 |
| Manque moyen sur contrat chuté | 18,62 | 17,89 |
| Chutes provoquées en défense | 422 / 1 567 (27 %) | 426 / 1 572 (27 %) |
| Coinches réussies / tentées | 0 / 0 | 1 / 6 |
| Entames atout volontaires en défense | 435 | 4 |
| Chutes après une telle entame | 199 / 435 | 4 / 4 |
| Enchère moyenne / p95 / p99 | 0,04 / 0,07 / 0,12 ms | 0,05 / 0,10 / 0,16 ms |
| Carte moyenne / p95 / p99 | 31,79 / 100,69 / 106,84 ms | 31,90 / 100,70 / 106,79 ms |
| CPU moyen par partie | 3 196,67 ms | 3 209,17 ms |

L'écart de deux victoires sur 500 ne confirme pas la crainte née de 20 parties préliminaires. Les contrats et la défense sont très proches ; la baisse de 435 à 4 entames atout volontaires est nette. La mesure « chutes après entame » décrit seulement les manches dans lesquelles une telle entame a eu lieu : elle ne démontre pas à elle seule sa causalité, et le dénominateur V4 est minuscule. Les 1/6 Coinches réussies justifient le resserrement ciblé du seuil, à revalider localement.

## Sept rulesets — 50 seeds appariées, 100 parties par ruleset

Les colonnes de contrats donnent « réussis / demandés » et les deux valeurs d'une case désignent officiel puis V4.

| Ruleset | Victoires off. / V4 | SA off. / V4 | TA off. / V4 | Capot off. / V4 | Générale off. / V4 | Entames atout défensives off. / V4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Classique | 52 / 48 | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 | 86 / 1 |
| Annonces | 50 / 50 | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 1/1 | 0/0 · 0/0 | 83 / 0 |
| Sans Atout | 42 / 58 | 11/52 · 10/15 | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 | 86 / 2 |
| Tout Atout | 32 / 68 | 0/0 · 0/0 | 31/48 · 100/109 | 0/0 · 0/0 | 0/0 · 0/0 | 60 / 1 |
| Capot et modes étendus | 28 / 72 | 15/44 · 13/16 | 32/45 · 72/82 | 0/0 · 0/0 | 0/0 · 0/0 | 51 / 0 |
| Générale | 52 / 48 | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 | 0/0 · 0/0 | 85 / 0 |
| Toutes options | 26 / 74 | 20/40 · 11/11 | 38/56 · 78/91 | 0/0 · 0/0 | 0/0 · 0/0 | 49 / 0 |

En mode Annonces, V4 marque 7 080 points d'annonces contre 6 900 ; en Toutes options, 7 310 contre 6 270. Aucun Capot n'a été demandé dans le ruleset « Capot et modes étendus » ; le seul Capot observé est le 1/1 V4 du ruleset Annonces. Aucune Générale n'a été demandée en 100 parties du ruleset dédié. Ces absences ne valident ni la fréquence ni la fiabilité des demandes exceptionnelles ; seuls les scénarios déterministes couvrent à présent les embranchements. Les Coinches par mode, Surcoinches, annonces par type, scores et taux de défense détaillés sont dans le JSON.

Le coût reste proche : en classique 500, le CPU V4 augmente de 12,50 ms par partie (environ 0,4 %) et le temps moyen carte de 0,11 ms. Sur les sept rulesets, le p99 carte V4 va de 103,34 à 128,08 ms ; le CPU moyen par partie va de 2 057,92 à 3 515,33 ms selon le ruleset. Ces mesures dépendent de la machine et de sa charge.

## Limites et validation restante

V4 demeure **expérimentale**. Le nouveau seuil de Coinche couleur et les garde-fous Capot/Générale n'ont pas été mesurés sur un grand lot depuis leur modification. Les tests déterministes vérifient les cas construits, pas le taux de réussite en partie réelle. Les demandes Capot/Générale étant rares, un benchmark ordinaire peut ne pas en observer. Le Monte Carlo garde un budget limité et des continuations heuristiques ; il n'utilise aucune main cachée réelle.

Pour revalider localement le classique après ces corrections, depuis la racine du projet :

```powershell
npx vite-node --config vitest.config.ts scripts/benchmarkAdvancedRules.ts --pairs=250 --variant=classic-reference 1> reports/bot-advanced-rules-classic-post-fixes.json
```

Ce benchmark doit être exécuté localement par l'équipe ; il n'a pas été relancé par l'agent. Avant toute promotion du profil officiel, relire les cas Coinche/Capot/Générale, comparer ce nouveau JSON à la référence 500 parties, puis tester la preview Vercel et attendre la validation humaine.
