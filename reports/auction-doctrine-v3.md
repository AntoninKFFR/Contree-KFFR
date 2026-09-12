# Auction Doctrine V3 — enchères conversationnelles

## Décision produit du 12 septembre 2026

**PROMOTION PRODUIT YES.** `human_doctrine_v3_conversation_mc_v1` devient le bot officiel pour poursuivre les tests humains en conditions réelles. Il utilise Auction Doctrine V3 pour les enchères et conserve strictement Monte Carlo V1 pour les cartes.

Cette promotion est un choix produit, pas une conclusion de supériorité statistique. V3 corrige les cas humains observés et obtient un niveau comparable à V1, mais son avantage n'est pas démontré : **303–297 sur 600 parties, 50,5 %, IC95 [46,50 % ; 54,50 %]**. Les résultats par seed vont de 44 % à 56 %. La finale 1 200 reste annulée.

La comparaison directe V3 / V2.1 conservatrice a été interrompue volontairement à la demande de l'utilisateur pour économiser le temps de calcul et les crédits. Aucun résultat partiel n'a été écrit ni utilisé pour une conclusion statistique.

## Erreurs humaines observées

Les captures Bot Review locales ont confirmé quatre défauts de l'ancienne doctrine :

- une main `9♥ A♥ 7♥ / 10♠ / 10♦ K♦ 7♦ / 8♣` ouvrait à `100♥` au lieu de transmettre prudemment sa couleur ;
- une main `J♠ A♠ 8♠ 7♠ / J♦ 9♦ / 10♥ 7♥` ouvrait à `100♠`, alors que `J♠` sans `9♠` restait dépendant du partenaire ;
- une main `9♦ A♦ Q♦ 8♦ / 9♣ 7♣ / Q♠ 8♠` ouvrait à `90♦` au lieu de sonder à 80 ;
- après `90♦` du partenaire, la main `J♥ A♥ 10♥ / 10♠ / 9♦ / J♣ 10♣ K♣` changeait automatiquement pour `100♥`, sans valoriser le `9♦` de fit.

Les tests V3 transcrivent uniquement ces mains propres et les enchères publiques dans le dépôt. Ils ne dépendent pas du dossier Downloads.

## Architecture V3

V3 est une couche séparée construite au-dessus des évaluations intrinsèques et de la classification de dépendance de V2.1 conservatrice. Elle ne modifie ni V2.1, ni les règles FFB, ni le moteur de cartes.

La décision est décomposée en concepts explicitement tracés :

- `classifyTrumpFoundation()` distingue `none`, `one-major`, `two-majors` et `controlled-long` ;
- `analyzeAuctionConversation()` distingue ouverture, réponse, rebid et overcall, puis conserve les messages propres, partenaire et adverses ;
- `evaluatePartnerFit()` classe le soutien en `none`, `minor-support`, `missing-major-fit` ou `strong-fit` ;
- `evaluatePartnerSuitOverride()` interdit par défaut d'écraser la couleur partenaire et ne l'autorise que pour une alternative réellement autonome ;
- le palier minimal légal, le plafond intrinsèque et le plafond de rebid sont conservés séparément ;
- `chooseHumanDoctrineV3Bid()` choisit le plus petit message utile compatible avec ces plafonds.

La trace diagnostique expose notamment : `partnerMessage`, `partnerFit`, `trumpFoundation`, `candidateSuit`, `partnerSuit`, `partnerSuitOverride`, `minimalUsefulBid`, `intrinsicCeiling`, `competitiveMinimum`, `rebidCeiling`, `communicationIntent`, `ownPreviousMessage` et la raison finale.

La trace Bot Review sait afficher ces champs. Elle contient uniquement la main du bot et l'historique public des enchères, jamais une main partenaire ou adverse.

## Minimal sufficient bid et séquence 80 / 90 / 100

Une enchère V3 n'exprime plus immédiatement tout le plafond théorique d'une main dépendante :

| Situation | Avant | V3 |
| --- | --- | --- |
| `9♥` seul, trois atouts, aucun As extérieur | `100♥` | ouverture `80♥`, recherche du Valet |
| `J♠` seul, quatre atouts, aucun As extérieur | `100♠` | ouverture `80♠`, recherche du 9 |
| `9♦` seul, quatre atouts, aucun As extérieur | `90♦` | ouverture `80♦`, recherche du Valet |
| quatre atouts sans J/9 | ouverture agressive possible | passe par défaut, sauf compensation exceptionnelle explicite |
| partenaire `80♠`, réponse avec la majeure manquante | saut ou passe peu structuré | `90♠` comme message suffisant avec petit fit |
| ouverture propre `80♥`, partenaire `90♥` | réévaluation implicite | rebid `100♥` permis par le soutien public |
| ouverture `80`, adversaire `90`, force intrinsèque suffisante | risque de plafond artificiel | overcall minimal `100` conservé |
| single-major réellement autonome | risque de surcorrection passive | ouverture supérieure à 80 permise |

Le plafond théorique reste disponible pour un tour ultérieur. Sur les 600 parties, le premier niveau annoncé par V3 vaut en moyenne **91,96**, contre **95,18** pour son dernier niveau dans chaque séquence : la conversation produit bien une progression mesurable.

## Fit partenaire J / 9

Quand le partenaire annonce une couleur, posséder `J` ou `9` dans cette couleur est traité comme une information contextuelle, pas comme un bonus fixe :

- une majeure isolée manquante produit `missing-major-fit` ;
- davantage de longueur ou de contrôles produit `strong-fit` ;
- sur `80`, un petit fit peut répondre `90` ;
- un fit fort peut justifier deux paliers ;
- sur `90`, une majeure isolée peut conduire à passer plutôt qu'à pousser mécaniquement à `100`.

Sur 600 parties, V3 détecte **1 022** fits de majeure manquante ou forts, effectue **369** raises de +10 et **76** raises d'au moins +20. Elle réalise **170** rebids après soutien partenaire.

## Respect et changement de la couleur partenaire

La garde `PartnerSuitOverride` examine la couleur du partenaire avant toute alternative :

- autre couleur sans J/9 : override refusé ;
- autre couleur avec une seule majeure et longueur ordinaire : override refusé ;
- `J+9`, longueur et As extérieur, avec autonomie suffisante : override possible au plus petit palier légal ;
- dans le cas réel après `90♦`, le `9♦` est reconnu comme fit et `100♥` n'est plus choisi automatiquement.

Sur 600 parties, **3 345** alternatives à la couleur partenaire ont été examinées : **123 autorisées** et **3 222 refusées**. Cette asymétrie est volontaire : changer la couleur partenaire reste un message fort.

## Tests doctrinaux

Les tests déterministes couvrent :

1. les trois ouvertures réelles ramenées à 80 ;
2. quatre atouts médiocres sans J/9 ;
3. le fit partenaire avec `9` puis avec `J` ;
4. deux refus d'override faible ;
5. un override exceptionnel autorisé ;
6. le cas réel `90♦` / `9♦` sans bascule automatique à `100♥` ;
7. le rebid après soutien ;
8. l'overcall compétitif après une ouverture à 80 ;
9. la main single-major autonome au-dessus de 80 ;
10. le passe normal derrière la couleur partenaire ;
11. l'invariance aux mains cachées ;
12. l'enregistrement expérimental avec Monte Carlo V1 et le maintien de V1 comme officiel ;
13. l'export Bot Review V3 sans aucune main cachée.

## Benchmark contre V1 officiel

Paramètres communs : règles FFB, cible 1 000, équipes homogènes A/A contre B/B, deals appariés, camps inversés et Monte Carlo V1 strictement identique pour les cartes.

### Screening 200

| Mesure | V3 | V1 officiel |
| --- | ---: | ---: |
| Victoires | 100 | 100 |
| Winrate | 50,0 % | 50,0 % |
| IC95 V3 | [43,07 % ; 56,93 %] | — |
| Différentiel moyen | +11,75 | −11,75 |
| Contrats pris | 446 | 692 |
| Contrats réussis | 360 | 505 |
| Réussite attaque | 80,72 % | 72,98 % |
| Taux de mise en défense | 27,02 % | 19,28 % |
| Valeur moyenne du contrat | 104,19 | 102,54 |
| CPU moyen / partie | 2 529,08 ms | 2 531,31 ms |

Le gate de 47 % est franchi, ce qui autorise le palier 600.

### Palier 600

| Mesure | V3 | V1 officiel |
| --- | ---: | ---: |
| Victoires | 303 | 297 |
| Winrate | 50,5 % | 49,5 % |
| IC95 V3 | [46,50 % ; 54,50 %] | — |
| Score moyen | 866,97 | 848,22 |
| Différentiel moyen | +18,75 | −18,75 |
| Contrats pris | 1 403 | 2 059 |
| Contrats réussis | 1 125 | 1 502 |
| Réussite attaque | 80,19 % | 72,95 % |
| Taux de mise en défense | 27,05 % | 19,81 % |
| Valeur moyenne du contrat | 104,07 | 102,92 |
| CPU moyen / partie | 2 512,46 ms | 2 512,52 ms |

Résultats V3 par seed de 100 parties : **50 %, 48 %, 49 %, 56 %, 56 %, 44 %**. L'avantage brut de six victoires est faible, l'intervalle recouvre largement 50 % et les seeds ne sont pas uniformément positifs. Aucune supériorité convaincante n'est établie.

### Métriques conversationnelles sur 600

| Métrique | Valeur |
| --- | ---: |
| `minimalOpening80Count` | 1 163 |
| `singleMajorOpening80Count` | 1 152 |
| `singleMajorImmediate100Prevented` | 519 |
| `partnerMissingMajorFits` | 1 022 |
| `partnerFitRaises10` | 369 |
| `partnerFitRaises20Plus` | 76 |
| `partnerSuitOverrideAttempts` | 3 345 |
| `partnerSuitOverrideAllowed` | 123 |
| `partnerSuitOverrideRejected` | 3 222 |
| `weakTrumpFoundationPasses` | 2 727 |
| `rebidsAfterPartnerSupport` | 170 |
| `auctionsWithTwoOrMoreOwnTurns` | 1 589 |
| `averageFirstBid` | 91,96 |
| `averageFinalBid` | 95,18 |

## Comparaison V3 / V2.1

Le protocole prévoyait au moins 200 parties contre `human_doctrine_v2_1_conservative_mc_v1`. Ce benchmark a été démarré puis **interrompu volontairement avant son terme** pour économiser le temps de calcul et les crédits. Le script n'écrit le rapport qu'après l'agrégation complète ; aucun fichier de résultat partiel n'existe.

Par conséquent :

- aucune statistique V3/V2.1 partielle n'est publiée ;
- aucune conclusion de supériorité ou de régression face à V2.1 n'est formulée ;
- la décision de promotion repose sur les cas doctrinaux et les deux benchmarks complets contre V1.

## Conclusion statistique et promotion produit

V3 satisfait les cas humains, la confidentialité et l'absence de perte majeure d'initiative. Elle reste toutefois seulement comparable au champion, sans avantage statistique convaincant ni cohérence suffisante entre seeds.

**PROMOTION STATISTIQUE NO.** La finale 1 200 reste annulée : les benchmarks ne démontrent pas que V3 est supérieure à V1.

**PROMOTION PRODUIT YES.** La qualité des comportements humains corrigés motive néanmoins un déploiement volontaire. **`OFFICIAL_BOT_PROFILE_ID` devient `human_doctrine_v3_conversation_mc_v1`** afin de poursuivre la validation réelle via Bot Review. V1 reste enregistré et actif pour rollback et comparaison.

## Preuves

- `reports/auction-doctrine-v3-vs-v1-200.json` : screening complet de 200 parties ;
- `reports/auction-doctrine-v3-vs-v1-600.json` : palier complet de 600 parties ;
- `tests/botHumanDoctrineV3.test.ts` : cas doctrinaux, séquences et confidentialité ;
- `tests/botReview.test.ts` : trace V3 exportable sans mains cachées.
