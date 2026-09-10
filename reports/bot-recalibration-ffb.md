# Recalibration des bots — Contrée classique FFB

> Tous les résultats précédents sont antérieurs au moteur FFB et ne sont pas directement comparables.

## 1. Audit du harness

Le championnat canonique exécute des parties à quatre bots sous `scoringMode = "ffb"`, avec une cible de 1 000 points. Chaque confrontation oppose deux bots de stratégie A aux deux bots de stratégie B. Chaque seed est jouée deux fois, en inversant les camps.

Les valeurs par défaut historiques à 300 points ont été supprimées du harness de tournoi et des scripts de benchmark qui les forçaient encore. Une limite de 80 manches reste une protection contre les simulations non terminées, mais son atteinte lève désormais une erreur : elle ne fabrique plus de gagnant à partir du score courant.

L’agrégateur accepte les `RoundResult` FFB, distingue les contrats en points et capot, et mesure les annonces et la belote sans supposer une donne constante à 162 points ni un contrat maximal à 160.

## 2. Hypothèses historiques invalidées

- Les scores produits avant FFB ne sont pas comparables aux scores de ce rapport.
- Une cible de 300 points ne représente plus une partie produit canonique.
- Les annonces, la belote, les capots et l’arrondi FFB rendent incorrecte toute agrégation fondée uniquement sur 162 points de plis.
- Une simulation interrompue par sa limite de sécurité n’est pas une victoire.

## 3. Paramètres canoniques

- Mode : `ffb`
- Cible : 1 000 points
- Appariement : même seed, puis camps inversés
- Limite de sécurité : 80 manches, avec erreur explicite si la partie n’est pas terminée

## 4. Stratégies testées

Le screening couvre les douze profils actifs du registry, complétés par Human Doctrine V1 + MC V1 et Human Doctrine V2 sans 110 + MC V1. Les variantes purement diagnostic et les deux anciens bots standalone ont été exclus.

Aucune heuristique, aucun seuil, aucun coefficient et aucun budget Monte Carlo n’a été modifié. Aucun bot actuel ne demande volontairement capot, car `StrategyBid` ne propose pas cette action ; leur compatibilité avec le jeu de carte sous un contrat capot est néanmoins testée.

## 5. Contrôle du harness

Deux alias strictement identiques de `hybrid_legacy_v1` ont joué 104 parties sur quatre seeds indépendantes. Résultat global : 52–52, soit exactement 50,0 %. Chaque seed donne 13–13. L’appariement, l’inversion des camps et la nouvelle entame par la partance ne produisent donc aucun biais structurel observable dans ce contrôle.

## 6. Screening global

Le screening a joué 9 464 parties : 91 matchups, 104 parties appariées par matchup, réparties sur quatre seeds indépendantes. Chaque stratégie a donc joué 1 352 parties.

| Rang | Stratégie | W–L | Winrate | Score moyen | Différentiel | Elo descriptif |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `human_doctrine_v1_mc_v1` | 845–507 | 62,50 % | 938,1 | +181,8 | 1588,7 |
| 2 | `hybrid_legacy_v1` | 817–535 | 60,43 % | 916,3 | +148,0 | 1573,5 |
| 3 | `human_doctrine_v2_no110_mc_v1` | 800–552 | 59,17 % | 919,3 | +142,7 | 1564,4 |
| 4 | `hybrid_legacy_v2` | 782–570 | 57,84 % | 902,2 | +119,9 | 1554,9 |
| 5 | `main_montecarlo_v3_1` | 747–605 | 55,25 % | 900,5 | +101,4 | 1536,6 |
| 6 | `main_montecarlo_v2` | 740–612 | 54,73 % | 891,7 | +85,6 | 1533,0 |
| 7 | `hybrid_legacy_v3` | 735–617 | 54,36 % | 881,4 | +67,4 | 1530,4 |
| 8 | `main_montecarlo_v3` | 724–628 | 53,55 % | 869,6 | +45,9 | 1524,7 |
| 9 | `main_montecarlo` | 709–643 | 52,44 % | 866,6 | +46,8 | 1517,0 |
| 10 | `main_montecarlo_bidding` | 653–699 | 48,30 % | 841,3 | −10,1 | 1488,2 |
| 11 | `main` | 597–755 | 44,16 % | 797,3 | −80,9 | 1459,2 |
| 12 | `prudent` | 556–796 | 41,12 % | 775,6 | −132,3 | 1437,7 |
| 13 | `balanced` | 403–949 | 29,81 % | 657,9 | −329,5 | 1351,3 |
| 14 | `aggressive` | 356–996 | 26,33 % | 622,0 | −386,8 | 1321,4 |

Champion du screening : `human_doctrine_v1_mc_v1`. Aucune promotion n’a été décidée à ce stade.

## 7. Top 4 et finale renforcée

Top 4 retenu : `human_doctrine_v1_mc_v1`, `hybrid_legacy_v1`, `human_doctrine_v2_no110_mc_v1`, `hybrid_legacy_v2`.

La finale a joué 1 800 parties : six matchups, 300 parties appariées par matchup, sur trois seeds.

| Rang | Stratégie | W–L | Winrate | Score moyen | Différentiel | Elo descriptif |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `human_doctrine_v1_mc_v1` | 480–420 | 53,33 % | 874,6 | +48,8 | 1523,2 |
| 2 | `hybrid_legacy_v2` | 456–444 | 50,67 % | 849,8 | +3,7 | 1504,6 |
| 3 | `human_doctrine_v2_no110_mc_v1` | 433–467 | 48,11 % | 840,3 | −22,1 | 1486,9 |
| 4 | `hybrid_legacy_v1` | 431–469 | 47,89 % | 837,2 | −30,4 | 1485,3 |

| Matchup | Résultat |
| --- | ---: |
| Human Doctrine V1 — `hybrid_legacy_v1` | 163–137 |
| Human Doctrine V1 — Human Doctrine V2 sans 110 | 161–139 |
| Human Doctrine V1 — `hybrid_legacy_v2` | 156–144 |
| `hybrid_legacy_v1` — Human Doctrine V2 sans 110 | 152–148 |
| `hybrid_legacy_v1` — `hybrid_legacy_v2` | 142–158 |
| Human Doctrine V2 sans 110 — `hybrid_legacy_v2` | 146–154 |

## 8. Head-to-head final et IC 95 %

Le duel final a opposé `human_doctrine_v1_mc_v1` à `hybrid_legacy_v2` sur 1 200 parties appariées et quatre seeds indépendantes.

- Human Doctrine V1 : 645 victoires, 53,75 %
- `hybrid_legacy_v2` : 555 victoires, 46,25 %
- Différentiel moyen Human Doctrine V1 : +45,38
- IC 95 % approximatif du winrate Human Doctrine V1 : **[50,93 % ; 56,57 %]**

L’intervalle exclut 50 %. Human Doctrine V1 gagne sur chacune des quatre seeds : 156–144, 161–139, 161–139 et 167–133.

## 9. Métriques FFB

Le runner collecte, par stratégie : parties, victoires/défaites, winrate, score final moyen, différentiel moyen, Elo descriptif, taux de passe, distribution 80–160, coinches, surcoinches, changements d’atout, contrats pris et contrat moyen, réussites/chutes, defensive set rate, scores attaque/défense, capots demandés/réussis, capots réalisés non demandés/subis, points d’annonces propres/adverses, belotes, contribution annonces + belote, plis et points de plis moyens, taux de capot, temps d’enchère moyen/p95, temps de carte moyen/p95/p99 et CPU moyen par partie.

### Enchères — screening

La distribution est donnée dans l’ordre 80/90/100/110/120/130/140/150/160. Une case absente vaut zéro.

| Stratégie | Pass rate | Distribution | C/S | Changements atout | Contrats | Contrat moyen |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `human_doctrine_v1_mc_v1` | 68,7 % | 638/1416/2983/1259/0/0/0/0/0 | 0/0 | 2119 | 3114 | 102,1 |
| `hybrid_legacy_v1` | 68,8 % | 443/1239/4424/0/0/0/0/0/0 | 0/0 | 1838 | 3113 | 99,2 |
| `human_doctrine_v2_no110_mc_v1` | 70,4 % | 658/1454/3874/0/0/0/0/0/0 | 0/0 | 1821 | 2830 | 98,8 |
| `hybrid_legacy_v2` | 68,6 % | 442/1300/4425/0/0/0/0/0/0 | 0/0 | 1915 | 3125 | 99,2 |
| `main_montecarlo_v3_1` | 66,3 % | 2215/1170/750/877/510/445/360/158/36 | 257/30 | 2825 | 3046 | 114,6 |
| `main_montecarlo_v2` | 66,0 % | 2308/1125/654/869/455/507/369/178/44 | 258/25 | 2892 | 3146 | 114,9 |
| `hybrid_legacy_v3` | 68,6 % | 431/1309/4475/0/0/0/0/0/0 | 0/0 | 1895 | 3149 | 99,2 |
| `main_montecarlo_v3` | 66,2 % | 2225/1144/691/835/490/499/369/205/34 | 235/35 | 2830 | 3086 | 115,5 |
| `main_montecarlo` | 66,2 % | 2425/1227/670/891/425/373/342/172/34 | 230/20 | 2791 | 3010 | 114,1 |
| `main_montecarlo_bidding` | 57,3 % | 1376/932/1034/1675/1226/1089/860/557/359 | 236/25 | 5598 | 3759 | 124,7 |
| `main` | 66,9 % | 2191/1128/602/766/405/483/411/145/39 | 218/37 | 2551 | 2925 | 115,1 |
| `prudent` | 54,6 % | 622/1163/1622/2274/1554/1040/682/390/130 | 96/0 | 6028 | 5166 | 120,7 |
| `balanced` | 52,7 % | 347/757/981/1466/1391/1037/995/602/493 | 243/0 | 4521 | 5130 | 128,8 |
| `aggressive` | 54,6 % | 246/564/714/1047/1156/989/1011/779/681 | 333/0 | 3754 | 4910 | 132,9 |

### Contrats et capots — screening

| Stratégie | Réussis/Pris | Chutes | Set défense | Score A/D | Capots demandés/réussis | Non demandés/subis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `human_doctrine_v1_mc_v1` | 2280/3114 | 834 | 43,3 % | 190,8/158,2 | 0/0 | 136/142 |
| `hybrid_legacy_v1` | 2169/3113 | 944 | 44,6 % | 177,9/161,7 | 0/0 | 99/140 |
| `human_doctrine_v2_no110_mc_v1` | 2050/2830 | 780 | 43,1 % | 183,1/157,7 | 0/0 | 92/149 |
| `hybrid_legacy_v2` | 2203/3125 | 922 | 42,9 % | 179,4/156,8 | 0/0 | 100/149 |
| `main_montecarlo_v3_1` | 1814/3046 | 1232 | 44,9 % | 169,8/175,1 | 0/0 | 154/88 |
| `main_montecarlo_v2` | 1869/3146 | 1277 | 44,6 % | 170,2/172,2 | 0/0 | 141/103 |
| `hybrid_legacy_v3` | 2132/3149 | 1017 | 41,4 % | 172,2/153,0 | 0/0 | 84/138 |
| `main_montecarlo_v3` | 1795/3086 | 1291 | 43,6 % | 166,5/168,5 | 0/0 | 96/92 |
| `main_montecarlo` | 1765/3010 | 1245 | 42,6 % | 167,1/165,4 | 0/0 | 119/123 |
| `main_montecarlo_bidding` | 1919/3759 | 1840 | 47,3 % | 151,2/181,7 | 0/0 | 160/84 |
| `main` | 1587/2925 | 1338 | 39,3 % | 152,7/157,5 | 0/0 | 40/113 |
| `prudent` | 2566/5166 | 2600 | 45,5 % | 138,9/173,5 | 0/0 | 78/69 |
| `balanced` | 2010/5130 | 3120 | 47,0 % | 116,1/196,1 | 0/0 | 98/56 |
| `aggressive` | 1775/4910 | 3135 | 45,1 % | 110,2/192,9 | 0/0 | 98/49 |

### Annonces, jeu de carte et performance — screening

| Stratégie | Annonces propres/adverses | Belotes | Annonces+belote | Plis/Points par donne | Capot | Bid ms moy/p95 | Carte ms moy/p95/p99 | CPU ms/partie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `human_doctrine_v1_mc_v1` | 89130/91060 | 788 | 104890 | 3,81/77,5 | 1,84 % | 0,07/0,16 | 41,53/136,41/160,41 | 3599,0 |
| `hybrid_legacy_v1` | 90630/90040 | 808 | 106790 | 3,72/75,4 | 1,35 % | 0,03/0,06 | 41,99/138,35/161,73 | 3628,1 |
| `human_doctrine_v2_no110_mc_v1` | 88860/89660 | 774 | 104340 | 3,69/73,9 | 1,24 % | 0,07/0,17 | 42,11/138,04/161,33 | 3673,2 |
| `hybrid_legacy_v2` | 91110/94220 | 774 | 106590 | 3,70/75,6 | 1,36 % | 0,03/0,06 | 54,93/167,50/194,33 | 4731,0 |
| `main_montecarlo_v3_1` | 84480/82590 | 729 | 99060 | 3,98/82,2 | 2,19 % | 0,04/0,09 | 67,08/176,12/202,20 | 5558,9 |
| `main_montecarlo_v2` | 85910/82760 | 706 | 100030 | 3,94/82,3 | 2,00 % | 0,04/0,10 | 56,29/167,54/192,37 | 4657,8 |
| `hybrid_legacy_v3` | 91280/95780 | 778 | 106840 | 3,72/74,7 | 1,14 % | 0,03/0,06 | 43,38/171,04/199,29 | 3772,4 |
| `main_montecarlo_v3` | 83600/82970 | 754 | 98680 | 3,96/80,6 | 1,37 % | 0,04/0,10 | 43,76/168,30/196,31 | 3616,1 |
| `main_montecarlo` | 85650/84150 | 743 | 100510 | 3,90/79,9 | 1,69 % | 0,05/0,11 | 42,31/137,20/158,91 | 3509,8 |
| `main_montecarlo_bidding` | 85020/83990 | 1140 | 107820 | 4,10/86,0 | 2,32 % | 33,04/79,81 | 55,63/167,85/194,37 | 5041,5 |
| `main` | 85310/89170 | 696 | 99230 | 3,85/76,2 | 0,58 % | 0,05/0,11 | 0,08/0,14/0,20 | 6,9 |
| `prudent` | 88000/86320 | 907 | 106140 | 4,48/94,8 | 1,10 % | 0,03/0,07 | 0,07/0,13/0,18 | 6,1 |
| `balanced` | 82820/81110 | 841 | 99640 | 4,63/98,6 | 1,48 % | 0,03/0,07 | 0,07/0,13/0,17 | 5,4 |
| `aggressive` | 79040/77020 | 822 | 95480 | 4,67/99,1 | 1,52 % | 0,03/0,07 | 0,07/0,13/0,17 | 5,2 |

## 10. Résultats par seed

### Screening — top 4 de chaque seed

| Seed | 1er | 2e | 3e | 4e |
| ---: | --- | --- | --- | --- |
| 20260910 | `hybrid_legacy_v1` 63,02 % | Human V1 61,83 % | `hybrid_legacy_v2` 61,83 % | Human V2 59,47 % |
| 20261910 | Human V1 63,02 % | Human V2 60,36 % | `hybrid_legacy_v1` 58,28 % | `hybrid_legacy_v2` 57,10 % |
| 20262910 | Human V1 63,02 % | Human V2 62,72 % | `hybrid_legacy_v1` 60,36 % | `main_montecarlo_v2` 56,51 % |
| 20263910 | Human V1 62,13 % | `main_montecarlo_v3_1` 60,65 % | `hybrid_legacy_v1` 60,06 % | `hybrid_legacy_v3` 59,47 % |

### Finale — classement par seed

| Seed | Human V1 | Legacy V2 | Human V2 | Legacy V1 |
| ---: | ---: | ---: | ---: | ---: |
| 20270910 | 53,67 % | 48,00 % | 49,00 % | 49,33 % |
| 20271910 | 50,00 % | 56,33 % | 46,33 % | 47,33 % |
| 20272910 | 56,33 % | 47,67 % | 49,00 % | 47,00 % |

### Head-to-head final

| Seed | Human V1 | Legacy V2 |
| ---: | ---: | ---: |
| 20280910 | 156 | 144 |
| 20281910 | 161 | 139 |
| 20282910 | 161 | 139 |
| 20283910 | 167 | 133 |

## 11. Performance CPU

Le temps CPU est mesuré avec `process.cpuUsage()` autour de chaque décision et attribué à la stratégie qui la prend. Les percentiles de latence utilisent le temps mural des décisions.

Dans le head-to-head final, Human Doctrine V1 consomme en moyenne 2 638,8 ms CPU par partie contre 3 466,3 ms pour `hybrid_legacy_v2`. Il ne présente donc pas de régression de performance par rapport au finaliste battu.

## 12. Compatibilité et anti-cheat

Toutes les stratégies du screening produisent une carte légale sous un contrat capot. Le test anti-cheat permute les valeurs des mains cachées adverses, à tailles identiques : les décisions d’enchère et de carte restent inchangées pour toutes les stratégies.

Les moteurs Monte Carlo reconstruisent des distributions plausibles à partir de la main propre et des informations publiques ; ils ne conservent pas les cartes réelles des adversaires dans leurs états simulés. Les annonces automatiques ne sont consommées qu’à travers l’état public déjà révélé.

Bugs de harness corrigés : cible historique à 300 points, absence d’un mode FFB explicitement canonique, attribution artificielle d’une victoire après 80 manches, métriques incomplètes pour capot/annonces/belote et ancienne mesure « CPU » fondée sur du temps mural. Aucun bug de compatibilité bot n’a nécessité de modifier une stratégie.

## 13. Recommandation

**PROMOTION YES — `human_doctrine_v1_mc_v1`.**

Motifs : champion du screening, premier de la finale, victoire finale 645–555, avantage positif sur les quatre seeds, IC 95 % excluant 50 %, décisions invariantes aux mains cachées, compatibilité capot et meilleure performance CPU que le deuxième finaliste.

L’ancien officiel était `hybrid_legacy_v1`. Le nouveau profil officiel utilise strictement les moteurs existants Human Doctrine V1 pour les enchères et Monte Carlo V1 pour les cartes. Aucun seuil, budget ou coefficient n’a été modifié.

Résultats agrégés reproductibles : `reports/ffb-control.json`, `reports/ffb-screening.json`, `reports/ffb-final.json`, `reports/ffb-head-to-head.json`.
