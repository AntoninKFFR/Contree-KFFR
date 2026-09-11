# Human Bidding Doctrine V2.1 — communication et initiative

## Décision

**PROMOTION NO.** La meilleure variante, `human_doctrine_v2_1_conservative_mc_v1`, reste expérimentale. Le bot officiel reste `human_doctrine_v1_mc_v1`.

V2.1 répare la passivité majeure de V2 et atteint un niveau comparable au champion, mais ne démontre pas un avantage statistiquement convaincant : **308–292 sur 600 parties, 51,33 %, IC95 [47,33 % ; 55,33 %]**. Les seeds sont partagés autour de l'égalité. La finale 1 200 n'a donc pas été lancée.

## Diagnostic préalable des 200 parties V2

Le fichier historique `human-bidding-doctrine-v2-screening-200.json` ne contenait que des agrégats de décisions. Un replay diagnostique a donc rejoué exactement ses quatre seeds, ses 200 parties FFB à 1 000 points et ses inversions de camps. Il reproduit exactement **86–114**, **307 contrats V2** et **900 contrats V1**.

À chacun des 3 255 tours d'enchère de V2, la décision V1 contrefactuelle a été calculée sur la même main propre et le même état public, sans utiliser les mains cachées.

### Cause exacte de la passivité

- V2 effectue 849 annonces, contre 1 107 annonces qu'aurait effectuées V1 sur les mêmes tours.
- V2 passe 356 fois lorsque V1 aurait enchéri.
- 295 de ces 356 écarts surviennent alors qu'un contrat adverse est déjà présent.
- 248 des 900 manches finalement défendues contiennent au moins un passage V2 / enchère V1.
- 224 manches défendues contiennent précisément un overcall compétitif manqué.
- Le rôle `competitive-overcall` concentre 198 passages V2 / enchère V1 : V2 n'y annonce que 87 fois sur 1 312 décisions.
- Les positions non-partantes concentrent 322 des 356 divergences : deuxième 144, troisième 117, quatrième 61.
- Les mains ne sont pas faibles : 216 divergences appartiennent au bucket de force intrinsèque 94–124 et 104 au bucket 125+.
- Les mains avec un As extérieur comptent 188 divergences ; celles avec deux As extérieurs en comptent 75.
- `jack-only` explique 176 passages V2 / enchère V1 et `nine-only` 119, soit 295 à elles deux.
- Le 34 n'explique que 11 divergences : il est rare et n'est pas la cause principale.

V2 ouvre presque toujours lorsqu'elle en a l'occasion (599 annonces sur 623 décisions d'ouverture), mais 380 de ces ouvertures sont ramenées à 80 alors que V1 aurait choisi 90, 100 ou 110. Ce plafond devient surtout destructeur lorsqu'il est réutilisé hors ouverture : face à 90 adverse, un plafond à 80 transforme mécaniquement une main intrinsèquement capable de 100/110 en passe.

La chute de 900 à 307 contrats vient donc principalement d'une confusion entre deux concepts : **message d'ouverture** et **plafond compétitif**.

## Classification de dépendance

V2.1 ajoute `handDependency` :

- `partner-dependent` : la main a besoin d'un complément partenaire pour dépasser son message prudent ;
- `semi-autonomous` : la main possède assez de longueur ou de contrôles pour conserver davantage d'initiative, sans être pleinement maîtresse ;
- `autonomous` : la combinaison atouts/contrôles/plafond de pertes justifie sa valeur sans dépendre de la réponse du partenaire.

La classification ne repose pas sur un unique score global. Elle combine :

- quantité d'atout ;
- contrôles extérieurs et As ;
- As+10 protégés ;
- force intrinsèque ;
- `estimatedMissingHighPoints` ;
- void utile avec longueur d'atout ;
- 10 vulnérables à la coupe ;
- partance.

Un score d'autonomie diagnostique est produit avec les raisons. Les variantes ne diffèrent que par leurs deux frontières :

| Politique | Autonome à partir de | Semi-autonome à partir de |
| --- | ---: | ---: |
| selective-probe-conservative | 10 | 7 |
| selective-probe-balanced | 8 | 5 |
| selective-probe-aggressive | 7 | 4 |

En véritable ouverture avec une seule majeure :

- dépendante : plafond communicatif 80 ;
- semi-autonome : plafond 90 ;
- autonome : aucun plafond artificiel.

En overcall compétitif, le plafond d'ouverture ne s'applique jamais : une main évaluée à 100 peut annoncer 100 sur 90 adverse. Le soutien public du partenaire conserve sa logique de réévaluation.

Le 34 reste un cas séparé : sans soutien ni main extérieure exceptionnelle, il reste plafonné à 80. Cette convention n'a pas été supprimée pour gagner artificiellement des parties.

## Exemples avant/après

| Situation | V2 | V2.1 |
| --- | --- | --- |
| Valet seul, trois atouts faibles, aucun As extérieur | sondage 80 | dépendante, sondage 80 conservé |
| 9 seul, deux/trois atouts, peu de contrôles | sondage 80 | dépendante, sondage 80 conservé |
| Valet seul, cinq atouts, plusieurs As extérieurs | 80 systématique | autonome, plafond intrinsèque 90/100/110 possible |
| Adversaire à 90, main single-major valant 100 | passe à cause du plafond 80 | overcall 100 possible |
| Partenaire soutient la couleur | relance possible | relance possible, inchangée |
| J+9 seuls, extérieur ordinaire | 80 | 80, prudence conservée |
| J+9+troisième+As | supérieur au 34, position prise en compte | convention conservée |

## Mini-screening — 100 parties par variante

Paramètres communs : FFB, cible 1 000, A/A contre B/B, deals appariés, camps inversés, cinq seeds, Monte Carlo V1 des deux côtés.

| Variante | V-D | Winrate | Diff. moyen | Contrats pris | Part des contrats | Réussite attaque | Sondages 80 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Conservative | 53–47 | 53 % | +15,3 | 260 | 43,99 % | 78,85 % | 161 |
| Balanced | 52–48 | 52 % | +14,1 | 271 | 46,17 % | 77,49 % | 110 |
| Aggressive | 50–50 | 50 % | −2,5 | 273 | 46,51 % | 76,56 % | 87 |

Aucune variante n'est éliminée par le seuil de 47 %. La conservatrice est retenue : meilleur winrate, meilleur différentiel, meilleure réussite d'attaque et aucune main autonome plafonnée à 80 par la règle générique. L'agressivité supplémentaire récupère peu de contrats et dégrade la qualité des prises.

## Étape A — 200 parties indépendantes

La conservatrice joue cinq nouveaux seeds :

- résultat : **100–100, 50,0 %** ;
- IC95 : [43,07 % ; 56,93 %] ;
- différentiel moyen : +16,9 ;
- contrats pris : 517 contre 611 pour V1 ;
- part des contrats : 45,83 % ;
- contrats réussis : 406/517, 78,53 % ;
- seeds : 50 %, 50 %, 52,5 %, 50 %, 47,5 %.

Le gate de 47 % est franchi, donc le palier 600 est lancé.

## Palier 600

Six nouveaux seeds indépendants, 100 parties chacun :

| Mesure | V2.1 conservative | V1 officiel |
| --- | ---: | ---: |
| Victoires | 308 | 292 |
| Winrate | 51,33 % | 48,67 % |
| Score moyen | 880,92 | 862,88 |
| Différentiel moyen | +18,03 | −18,03 |
| Contrats pris | 1 560 | 1 932 |
| Réussite attaque | 78,27 % | 73,71 % |
| Valeur moyenne | 104,62 | 103,24 |
| Taux de mise en défense | 26,29 % | 21,73 % |
| CPU moyen/partie | 2 546,56 ms | 2 547,06 ms |

IC95 V2.1 : **[47,33 % ; 55,33 %]**.

Seeds V2.1 : 49 %, 51 %, 54 %, 55 %, 50 %, 49 %. L'avantage brut n'est ni statistiquement établi ni uniformément positif. La finale 1 200 n'est donc pas déclenchée.

### Initiative sur 600 parties

- 1 560 contrats pris, soit **520 ramenés à 200 parties**, contre 307 pour V2.
- Part des contrats : 44,67 %.
- 6 022 passes alors qu'au moins une enchère supérieure restait légalement disponible ; cette métrique décrit la disponibilité réglementaire, pas à elle seule la qualité de la main.
- 918 sondages dépendants à 80.
- 665 overcalls compétitifs tentés, 2 532 passés.
- 334 relances après soutien partenaire.
- Dépendance : 7 376 décisions `partner-dependent`, 1 509 `semi-autonomous`, 320 `autonomous`.
- Trois mains classées autonomes restent plafonnées à 80 : elles relèvent exclusivement de la règle spéciale du 34, pas du sondage single-major générique.

### Contrats pris V1 / V2 / V2.1

Sur le screening historique de 200 parties : V1 900, V2 307. V2.1 prend 1 560 contrats sur 600, soit **520 normalisés à 200 parties**. Dans son propre palier 600, l'interaction d'enchères produit 1 932 contrats V1 contre 1 560 V2.1.

V2.1 récupère donc environ 69 % de contrats supplémentaires par partie par rapport à V2 `(520 / 307 - 1)`, sans revenir simplement à V1 sous un autre nom.

## Confidentialité et performance

La décision utilise uniquement la main propre, la position, le score et les enchères publiques. Un test permute simultanément la main réelle du partenaire et celles des adversaires sans modifier la décision ou la trace. Les trois variantes utilisent Monte Carlo V1 sans modification.

Le CPU moyen du palier 600 est pratiquement identique : V2.1 2 546,56 ms contre V1 2 547,06 ms par partie. Aucun ralentissement problématique n'est observé.

## Conclusion

V2.1 atteint les deux objectifs structurels : elle conserve les conventions humaines et restaure fortement l'initiative. Elle est désormais comparable au champion, mais pas démontrée supérieure. Promouvoir sur 51,33 % avec une borne basse à 47,33 % violerait le critère statistique.

**PROMOTION NO — `OFFICIAL_BOT_PROFILE_ID` reste `human_doctrine_v1_mc_v1`.**

## Preuves

- `reports/human-bidding-doctrine-v2-initiative-diagnostic.json` : replay causal des 200 parties V2.
- `reports/human-bidding-doctrine-v2-1-mini-screening.json` : trois variantes, 100 parties chacune.
- `reports/human-bidding-doctrine-v2-1-conservative-200.json` : étape A indépendante.
- `reports/human-bidding-doctrine-v2-1-conservative-600.json` : palier final exécuté.

## Validation finale

- `npm test` : 36 fichiers, 434 tests réussis.
- `npm run lint` : réussi.
- `npm run build` : réussi.
