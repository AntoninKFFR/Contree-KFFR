# Bots et règles avancées — audit et expérimentation V4

## État initial vérifié

Le profil officiel est `human_doctrine_v3_1_conversation_mc_v1` (`bots/profiles.ts`). Ses enchères couleur suivent V3.1, ses cartes Monte Carlo V1. `bots/simpleBot.ts` intercepte SA/TA avec `evaluateNoTrumpHand` et `evaluateAllTrumpHand`, puis annonce la prochaine valeur légale dès qu'un score brut atteint 80. Cette voie court-circuite la comparaison avec V3.1 et renvoie « passe » si le contrat courant est déjà SA/TA. Capot n'est jamais demandé volontairement ; Générale est testée par un évaluateur séparé, extrêmement strict. Les annonces de la main ne participent pas à la décision. Coinche et Surcoinche sur SA/TA sont donc manquées. Pendant le jeu, l'heuristique SA/TA prend simplement la carte légale la moins coûteuse ; Monte Carlo V1 n'évalue qu'un candidat quand `state.trump` est nul. Une entame atout défensive reste possible dans Monte Carlo V1 malgré les précautions de l'heuristique.

Le moteur fournit déjà les règles sélectionnées, les modes de contrat, la hiérarchie de cartes propre à chaque mode, les annonces automatiques, Belote/Rebelote, Capot et Générale. La Générale exige huit plis remportés **personnellement par le preneur** ; son partenaire ne joue pas la manche. Les annonces des deux camps sont comparées et peuvent s'annuler. Leur valeur ne compte vers le contrat que si `contractSuccess.announcementsCount` est activé. Le moteur n'a pas été modifié.

## Changements expérimentaux

`advanced_rules_v4_experimental` est une stratégie distincte du registre de simulation ; le profil officiel web reste inchangé. Elle réutilise V3.1 en couleur et évalue SA/TA selon leurs propres contrôles, leurs trous et un plafond d'enchère. Les annonces possibles de la main propre et la Belote pertinente apportent un bonus décoté. Capot est réservé à huit cartes en séquences maîtresses sans trou, ou à sept maîtres personnels et un trou couvert par un fort message du partenaire dans le même mode. Générale conserve l'évaluateur couleur et admet SA/TA seulement si le ruleset l'autorise et si les huit cartes sont personnellement maîtresses. Coinche/Surcoinche évaluent les contrôles et le niveau du contrat, y compris en SA/TA.

Le jeu de carte SA/TA privilégie les maîtres, les séquences et la protection des points. Un Monte Carlo à budget borné utilise une utilité propre à la réussite du contrat, au doublement, au Capot et à la Générale. Une entame atout volontaire en défense est évitée avec des couleurs de remplacement ; la contrainte ne s'applique ni aux cartes imposées, ni à une fin de manche où les atouts restants sont contrôlés. Les mondes simulés sont reconstruits à partir de la main propre et des cartes publiques.

## Méthode de simulation

`scripts/benchmarkAdvancedRules.ts` compare le bot officiel courant et V4, avec mêmes seeds et camps inversés, sur sept rulesets : classique de référence, annonces, SA, TA, Capot avec modes étendus, Générale et toutes options compatibles. La cible reste 1 000 points. Le harness sépare les résultats par ruleset et relève contrats par mode, réussites, Coinches/Surcoinches, annonces, entames atout et temps moyen/p95/p99 d'enchère et de carte. Toute action illégale ferait échouer la simulation via le moteur.

Les données reproductibles, seeds incluses, se trouvent dans `reports/bot-advanced-rules-data.json`.

## Résultats

La première passe couvre **deux seeds appariées, quatre parties par ruleset**. Les chiffres sont un test de fonctionnement et de direction, pas une estimation stable du winrate. Chaque case « réussis/pris » compte les contrats du mode indiqué.

| Ruleset | Victoires officiel / V4 | Couleur officiel / V4 | SA officiel / V4 | TA officiel / V4 | Entames atout défensives volontaires officiel / V4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Classique de référence | 2 / 2 | 9/12 · 10/12 | 0/0 · 0/0 | 0/0 · 0/0 | 1 / 0 |
| Annonces | 1 / 3 | 8/12 · 8/10 | 0/0 · 0/0 | 0/0 · 0/0 | 1 / 0 |
| Sans Atout | 3 / 1 | 10/14 · 6/9 | 0/2 · 0/0 | 0/0 · 0/0 | 3 / 0 |
| Tout Atout | 0 / 4 | 6/9 · 7/10 | 0/0 · 0/0 | 1/3 · 2/2 | 0 / 0 |
| Capot et modes étendus | 2 / 2 | 6/7 · 3/4 | 2/4 · 0/1 | 1/1 · 5/5 | 0 / 0 |
| Générale | 2 / 2 | 11/15 · 9/12 | 0/0 · 0/0 | 0/0 · 0/0 | 4 / 0 |
| Toutes options | 1 / 3 | 6/8 · 6/7 | 0/1 · 0/0 | 1/2 · 2/2 | 2 / 0 |

La V4 n'a demandé ni Capot ni Générale sur ces 28 parties : de telles mains sont rares. Les tests déterministes vérifient qu'elle sait les demander quand les conditions exactes sont réunies et qu'elle refuse les faux candidats. En Tout Atout, les cinq contrats de V4 ont réussi dans le ruleset Capot et modes étendus ; l'échantillon reste petit. En Sans Atout, elle a évité deux contrats perdants demandés par l'officiel, mais a moins souvent pris la main et n'a pas mieux gagné sur ces seeds. Ce mode demande davantage d'observation avant promotion.

Les Coinches V4 sont apparues dans tous les rulesets (une à trois sur les quatre parties selon la variante), contre zéro pour l'officiel sur ces seeds. Les métriques de réussite détaillées, les annonces par type et les Surcoinches par mode sont dans le JSON. La mesure « réussite après entame atout défensive » a pour dénominateur le nombre de telles entames ; V4 en a zéro ici, donc aucun taux n'est interprétable.

### Performance observée

Sur les quatre parties de chaque variante, le p99 carte de V4 se situe entre **126 et 139 ms**, celui de l'officiel entre **125 et 136 ms**. Le p95 enchère V4 se situe entre **0,22 et 0,31 ms**, contre **0,15 à 0,23 ms** pour l'officiel. Le CPU moyen par partie est inférieur pour V4 dans six des sept variantes, et proche en Générale (4 051 contre 4 090 ms). Les mesures de temps sont sensibles à la machine et à la charge ; les budgets Monte Carlo n'ont pas été augmentés. Le benchmark classique élargi figure ci-dessous dès sa fin.

## Limites

La variante est volontairement conservatrice sur Capot et peut rater une opportunité fondée sur une force inconnue du partenaire. Générale SA/TA n'est demandée que pour une main entièrement maîtresse. Monte Carlo reste une approximation à budget limité ; il ne connaît aucune main cachée. Les résultats de simulations sont propres aux seeds et au nombre de parties reportés ; ils ne suffisent pas à eux seuls pour promouvoir V4.
