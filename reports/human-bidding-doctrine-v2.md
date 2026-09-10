# Human Bidding Doctrine V2 — communication partenaire

## Décision

**PROMOTION NO.** La variante `human_doctrine_v2_comm_mc_v1` reste expérimentale. Le bot officiel reste `human_doctrine_v1_mc_v1`.

Le screening imposé de 200 parties FFB s'arrête à **86–114 (43,0 %)**, sous le seuil d'arrêt d'environ 47 %. L'intervalle de confiance à 95 % est **[36,14 % ; 49,86 %]** et le différentiel moyen est **−47,95 points par partie**. Conformément au protocole, les paliers 600 et 1 200 n'ont pas été lancés.

## Défaut étudié

Human Doctrine V1 convertit principalement une évaluation numérique de main en seuil de contrat. Une structure forte numériquement peut donc produire directement 100 ou 110, sans distinguer la force personnelle de la fonction communicative d'une première annonce.

L'observation de production « ouverture 110 trèfle alors qu'un adversaire détenait 9♣ 8♣ 7♣ » a servi de signal architectural, pas de règle absolue : la main du bot n'était pas connue.

## Architecture expérimentale

La V2 communication sépare les étapes suivantes :

1. `evaluateIntrinsicHand()` calcule la force propre pour chaque couleur, sans bonus/malus provenant des enchères.
2. `classifyTrumpStructure()` expose explicitement Valet, 9, les deux pièces, la quantité et les structures `jack-only`, `nine-only`, `thirty-four`, `jack-nine-third`, longue solide ou longue faible.
3. `analyzeAuctionContext()` ne lit que les enchères publiques, le contrat, la position, la partance et le score public.
4. `inferPartnerInformation()` produit une inférence prudente à partir des seules annonces du partenaire.
5. `determineOpeningIntent()` distingue sondage, force d'atout, longueur, soutien, rebid soutenu, overcall et force naturelle.
6. `determineBidCeiling()` combine intention, structure, contrôles extérieurs, risque estimé des gros points manquants, partance et soutien public.
7. `chooseAuctionAction()` confronte ce plafond aux annonces encore légales.

Les anciennes variantes expérimentales `human_doctrine_v2_no110` et `human_doctrine_v2_110` restent explicitement sur leur politique historique de seuils. Seul `human_doctrine_v2_comm_mc_v1` active la nouvelle pipeline de communication.

Le résultat contient une trace diagnostique complète avec les quatre évaluations de couleur, l'intention, le plafond, les raisons et l'action finale.

## Hypothèses doctrinales implémentées

- Valet seul ou 9 seul : première annonce plafonnée à 80 lorsqu'une annonce est justifiée, afin de chercher l'autre pièce majeure.
- Une réponse publique du partenaire dans la même couleur retire ce plafond et autorise une réévaluation.
- Le 34, Valet + 9 exactement à deux atouts, est plafonné à 80 sans soutien.
- J+9+troisième avec contrôle extérieur vaut davantage que le 34 ; l'hypothèse testée distingue 100 avec la partance et 90 sans la partance.
- Une longueur de quatre ou cinq atouts sans Valet, 9 ni contrôle extérieur ne suffit pas à une grosse annonce.
- Les contrats élevés exigent des contrôles extérieurs ; un grand nombre d'atouts ne déclenche jamais un capot.
- `estimatedMissingHighPoints` est un indicateur de plafond, jamais une prédiction exacte des points perdus.
- Une enchère adverse modifie l'action disponible, pas l'évaluation intrinsèque de la main.

## Exemples déterministes

| Situation | Intention / décision attendue |
| --- | --- |
| Valet seul quatrième, main très forte, aucune information partenaire | `probing-major-trump`, 80 |
| 9 seul cinquième, bonne main, aucun soutien | sondage prudent, 80 |
| Première annonce 80 avec une seule majeure, puis soutien partenaire à 90 | `partner-supported-rebid`, relance supérieure à 90 possible |
| Valet + 9 seuls | `thirty-four`, ouverture maximale 80 |
| J+9+troisième+As extérieur, avec partance | 100 |
| Même main sans partance | 90 |
| Cinq atouts médiocres sans majeure ni As extérieur | pas de grosse annonce fondée sur la quantité seule |
| J+9+longueur et contrôles extérieurs | 100 ou 110 possible selon le plafond |

Quinze tests doctrinaux déterministes couvrent ces cas, la séparation force/contexte, l'invariance aux mains cachées, la distinction avec les anciennes V2 et l'enregistrement expérimental avec Monte Carlo V1.

## Bot Review et confidentialité

Le format Bot Review accepte une trace `human-doctrine-v2-communication` comprenant :

- main propre ;
- joueur, position et partance ;
- enchères publiques et contrat courant ;
- évaluations des quatre couleurs ;
- structure d'atout et force intrinsèque ;
- contrôles extérieurs et points manquants estimés ;
- contexte d'enchère et inférence partenaire ;
- intention, plafond, décision et raison.

La reconstruction place uniquement la main propre dans l'état. Un test sérialise puis reconstruit le scénario, reproduit exactement la décision et vérifie l'absence de propriété `hands`. La main réelle du partenaire et les mains adverses ne figurent ni dans la trace ni dans le JSON.

## Benchmark

Paramètres :

- règles : `scoringMode = "ffb"` ;
- cible : 1 000 ;
- format : A/A contre B/B ;
- cartes : Monte Carlo V1 identique des deux côtés ;
- 200 parties, deals appariés et camps inversés ;
- quatre seeds : `20261001`, `20262001`, `20263001`, `20264001` ;
- 50 parties par seed.

### Résultat principal

| Stratégie | V-D | Winrate | Score moyen | Diff. moyen | Contrats réussis | Valeur moyenne | CPU/partie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| V2 communication | 86–114 | 43,0 % | 864,75 | −47,95 | 251/307 (81,76 %) | 104,30 | 2 663,51 ms |
| V1 officiel | 114–86 | 57,0 % | 912,70 | +47,95 | 622/900 (69,11 %) | 101,41 | 2 697,68 ms |

La V2 ne ralentit pas la partie : son CPU moyen est environ 1,3 % inférieur dans cet échantillon. Le problème est stratégique. Elle prend beaucoup moins de contrats (307 contre 900) et affiche une excellente réussite quand elle attaque, mais cède trop souvent l'initiative. Sa défense chute alors à 278 mises adverses sur 900 manches défendues (30,89 %), ce qui ne compense pas la perte d'occasions d'attaque.

### Cohérence par seed

| Seed | V2 gagnées | V2 perdues | Winrate V2 |
| ---: | ---: | ---: | ---: |
| 20261001 | 21 | 29 | 42 % |
| 20262001 | 21 | 29 | 42 % |
| 20263001 | 20 | 30 | 40 % |
| 20264001 | 24 | 26 | 48 % |

Le désavantage apparaît sur les quatre seeds ; il n'est donc pas cohérent avec une promotion.

### Métriques doctrinales

- 434 ouvertures de sondage avec une seule pièce majeure ont été plafonnées à 80.
- 128 relances ont suivi un soutien public du partenaire.
- 238 ouvertures `jack-only`, moyenne 80.
- 196 ouvertures `nine-only`, moyenne 80.
- 18 ouvertures `thirty-four`, moyenne 80.
- 50 ouvertures `jack-nine-third`, moyenne 98,40.
- 53 ouvertures `strong-long-trump`, moyenne 103,02.

Les métriques montrent que la convention demandée est effectivement appliquée. Elles révèlent aussi le coût : le plafond de sondage s'active fréquemment et la récupération d'initiative par soutien partenaire ne suffit pas.

Les résultats bruts et toutes les métriques agrégées sont conservés dans `reports/human-bidding-doctrine-v2-screening-200.json`.

## Conclusion

La séparation architecturale et les diagnostics sont concluants, mais la politique testée ne l'est pas compétitivement. L'hypothèse « plafonner toute première annonce J-only/9-only à 80 » est trop large dans sa forme actuelle. Une future variante devrait conserver l'intention communicative tout en distinguant mieux les mains autonomes, les overcalls et les occasions où laisser l'adversaire prendre le contrat coûte davantage qu'une annonce directe.

**PROMOTION NO — `OFFICIAL_BOT_PROFILE_ID` reste `human_doctrine_v1_mc_v1`.**

## Validation finale

- `npm test` : 35 fichiers, 424 tests réussis.
- `npm run lint` : réussi.
- `npm run build` : réussi.
