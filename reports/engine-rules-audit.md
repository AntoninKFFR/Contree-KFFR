# Audit complet du moteur de règles Contrée / Coinche

Date : 2026-09-09

## Périmètre et référence

L'audit couvre `engine/actions.ts`, `bidding.ts`, `cards.ts`, `game.ts`, `players.ts`, `random.ts`, `rules.ts`, `scoring.ts`, `seats.ts`, `types.ts`, `views.ts`, leurs tests directs et les tests serveur qui exercent le même moteur. Aucun comportement de production n'a été modifié.

Référence externe principale : [Règles officielles de la Belote Coinchée — Fédération Française de Belote (PDF)](https://www.ffbelote.org/wp-content/uploads/2015/11/REGLES-DE-LA-BELOTE-COINCHEE.pdf), complétée par la [page Coinche de la FFB](https://www.ffbelote.org/regles-coinche/). La référence produit locale est `RULES.md`, qui décrit explicitement une V1 simplifiée.

Les statuts signifient :

- **BUG CERTAIN** : comportement techniquement ou réglementairement incorrect, sans convention produit cohérente qui le justifie ;
- **DIFFÉRENCE DE RULESET À CONFIRMER** : choix possible, mais qui doit être décidé et documenté comme contrat produit ;
- **VARIANTE INTENTIONNELLE** : divergence explicitement décrite dans `RULES.md` ;
- **FEATURE ABSENTE** : mécanisme FFB non représenté ;
- **CONFORME** : comportement aligné avec la règle FFB examinée.

Aucun P0 n'a été trouvé. Trois écarts P1 demandent une décision ou une correction ciblée avant de déclarer le moteur conforme FFB : condition de réussite, fenêtre de surcoinche après coinche tardive, et égalité au-dessus de la cible.

## Tableau d'audit

| Règle | Comportement actuel | Référence | Statut | Impact | Fichier | Test existant | Correction recommandée |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Jeu et distribution | 32 cartes uniques, 8 par joueur après mélange Fisher-Yates | FFB : 32 cartes, 8 par joueur | CONFORME | — | `cards.ts`, `game.ts`, `random.ts` | `cards.test.ts`; `engineRulesAudit.test.ts` | Aucune |
| Paquets de distribution / coupe | Le moteur distribue quatre tranches de 8 ; il ne représente ni donneur, ni coupe, ni paquets 3-2-3 | FFB : donneur, coupe, distribution 3-2-3/3-3-2/2-3-3 | VARIANTE INTENTIONNELLE | P3, abstraction numérique sans effet sur l'ensemble des mains | `game.ts` | Invariants de distribution | Conserver, ou modéliser un donneur uniquement si l'interface en a besoin |
| Équipes et ordre | Équipes fixes 0+2 / 1+3 ; ordre cyclique 0→1→2→3 | FFB : deux équipes opposées, sens constant | CONFORME | — | `rules.ts`, `seats.ts` | `seats.test.ts`; tests de plis | Aucune |
| Hiérarchie hors atout | A > 10 > R > D > V > 9 > 8 > 7 | FFB, §6 | CONFORME | — | `rules.ts`, `cards.ts` | Test exhaustif des comparaisons adjacentes | Aucune |
| Points hors atout | 11/10/4/3/2/0/0/0 | FFB, §6 | CONFORME | — | `rules.ts` | Test exhaustif des 8 rangs | Aucune |
| Hiérarchie atout | V > 9 > A > 10 > R > D > 8 > 7 | FFB, §6 | CONFORME | — | `rules.ts`, `cards.ts` | Test exhaustif des comparaisons adjacentes | Aucune |
| Points atout | 20/14/11/10/4/3/0/0 | FFB, §6 | CONFORME | — | `rules.ts` | Test exhaustif des 8 rangs | Aucune |
| Total normal / dix de der | Cartes = 152 ; dernier pli ajoute 10 ; total = 162 | FFB, §9.1 | CONFORME hors capot | — | `rules.ts`, `game.ts` | `rules.test.ts`; 32 manches intégrales d'audit | Aucune pour une donne normale |
| Fournir la couleur | Toute carte de la couleur demandée est obligatoire si disponible | FFB, §5.2.1 | CONFORME | — | `rules.ts`, `game.ts` | Matrice 2e/3e/4e joueur | Aucune |
| Atout demandé | Monter à l'atout si possible, même lorsque le partenaire tient ; sinon tout atout est légal | FFB, §5.2.3 | CONFORME | — | `rules.ts` | Matrice : surmonte possible/impossible et partenaire maître | Aucune |
| Absence de couleur, partenaire maître | Toute carte est légale, y compris un atout | FFB, §5.2.2.1 | CONFORME | — | `rules.ts` | Matrice partenaire maître à la couleur et après coupe | Aucune |
| Absence de couleur, adversaire maître | Couper si un atout est disponible ; sinon défausse libre | FFB, §5.2.2.2 | CONFORME | — | `rules.ts` | Matrice coupe / aucun atout | Aucune |
| Surcoupe | Si un adversaire a coupé, surcouper si possible | FFB, §5.2.3 | CONFORME | — | `rules.ts` | Matrice surcoupe obligatoire | Aucune |
| « Ne pisse pas » | Si aucun atout ne surcoupe l'adversaire, toute carte est permise, y compris une défausse | FFB, précision §5.2 | CONFORME | — | `rules.ts` | Matrice avec atouts inférieurs et défausse | Aucune |
| Partenaire ayant coupé maître, main uniquement atout | Toute carte de la main, donc tout atout inférieur ou supérieur, reste légale | FFB, exception §5.2.4 | CONFORME | — | `rules.ts` | Cas rare explicite d'audit | Aucune |
| Validation d'une carte | Tour, possession et légalité sont vérifiés ; une carte absente ou illégale lève une erreur | Règle fondamentale | CONFORME | — | `game.ts`, `actions.ts` | `multiplayerServer.test.ts`; test direct d'audit | Aucune |
| Pli | Quatre cartes ; atout prioritaire, sinon meilleure carte demandée ; gagnant entame ensuite | FFB, §5.1 | CONFORME | — | `rules.ts`, `game.ts` | `game.test.ts`; tests complets d'audit | Aucune |
| Entame de la donne | Le joueur auteur de la dernière enchère entame | FFB : joueur à droite du donneur ; `RULES.md` choisit le preneur | VARIANTE INTENTIONNELLE | P1, change les résultats et les évaluations bot | `game.ts` (`finishBidding`) | Test révélateur d'audit | Décider produit : conserver la variante ou faire entamer `startingPlayerId` |
| Première parole et rotation | `startingPlayerId` parle en premier et avance d'un siège à chaque manche | FFB : droite du donneur, rotation du donneur | CONFORME au niveau de la partance | — | `game.ts`, `rules.ts` | `game.test.ts`; rotation d'audit | Clarifier que `startingPlayerId` représente la partance, pas le donneur |
| Passe puis reparole | Un joueur ayant passé reparle si une enchère ultérieure prolonge le tour | FFB, §4.1.a | CONFORME | — | `game.ts` | `game.test.ts`; audit enchères | Aucune |
| Enchère supérieure / couleur | Valeur strictement supérieure ; changement de couleur libre si la valeur monte | FFB, §4.1.b | CONFORME | — | `game.ts`, `bidding.ts` | Tests d'égalité refusée et hausse acceptée | Aucune |
| Valeurs proposées | 80 à 160 par 10 | FFB : 80 minimum, multiples de 10, puis capot maximal | CONFORME pour les contrats numériques | — | `types.ts`, `bidding.ts` | Test de la liste complète | Aucune hors ajout éventuel du capot |
| Défense runtime des valeurs | `makeBid` accepte une valeur forgée (ex. 170) si le type TypeScript est contourné ; l'API multijoueur la filtre en amont | Frontière moteur robuste | BUG CERTAIN | P2, faible exposition actuelle mais API moteur non sûre seule | `game.ts`; garde dans `roomIntentValidation.ts` | Test révélateur d'audit | Vérifier `BID_VALUES.includes(value)` dans le moteur lors d'une phase corrective |
| Trois passes après enchère | Le tour finit lorsque la parole reviendrait au dernier enchérisseur après trois passes | FFB, §4.1.b | CONFORME | — | `game.ts` | `game.test.ts` | Aucune |
| Quatre passes initiales | Manche finie, zéro point ; manche suivante déclenchée explicitement par l'application | FFB : donne annulée, donneur suivant | VARIANTE INTENTIONNELLE | P3, étape UI supplémentaire | `game.ts`, `actions.ts` | `game.test.ts`; audit rotation | Aucune |
| Coinche : camp et tour | Seulement équipe adverse, contrat normal, et uniquement au tour du joueur | FFB, §4.1.c | CONFORME | — | `bidding.ts`, `game.ts` | Permissions positives/négatives d'audit | Aucune |
| Effet de la coinche | Le contrat est figé et aucune enchère normale n'est ensuite acceptée | FFB, §4.1.c | CONFORME | — | `bidding.ts`, `game.ts` | `game.test.ts`; audit | Aucune |
| Fin après coinche tardive | Si le coincheur est juste avant le preneur, le passage du preneur termine immédiatement ; son partenaire n'obtient pas son tour de surcoinche | FFB : fin après les trois joueurs suivants qui passent ; la team preneuse peut surcoincher | BUG CERTAIN | P1, supprime une action légale de surcoinche | `game.ts` (`contractHolderAnsweredCoinche`) | Test révélateur « late-coinche gap » | Compter trois passes consécutifs depuis la coinche, sans donner un rôle spécial au seul enchérisseur |
| Surcoinche : camp et tour | Un membre de l'équipe preneuse peut surcoincher à son tour ; le camp coincheur est refusé | FFB, §4.1.d | CONFORME quand le tour lui parvient | — | `bidding.ts`, `game.ts` | `game.test.ts`; test négatif d'audit | Corriger d'abord la fenêtre après coinche tardive |
| Fin sur surcoinche | La phase de jeu commence immédiatement | FFB, §4.1.d | CONFORME | — | `game.ts` | Test explicite d'audit | Aucune |
| Surenchérir sur soi-même | Après trois passes, la phase se termine avant que le même joueur puisse relever sa propre enchère | FFB, §4.1.b | CONFORME | — | `game.ts` | Séquences d'enchères existantes | Aucune |
| Réussite du contrat | `takerPoints >= contract.value` seulement ; égalité 81–81 ou 80–82 à 80 est déclarée réussie | FFB : atteindre le contrat **et** faire strictement plus que la défense | BUG CERTAIN | P1, mauvais gagnant et score sur des répartitions valides | `scoring.ts` | Test révélateur égalité/défense supérieure | Exiger `takerPoints >= value && takerPoints > defenderPoints` |
| Mode `made-points`, contrat normal | Réussite : preneur = points faits + contrat, défense = points faits. Chute : défense = 162 + contrat | FFB : mêmes principes, mais base de chute 160 et arrondi à la dizaine | VARIANTE INTENTIONNELLE | P1, scores cumulés différents | `scoring.ts`, `RULES.md` | Table complète d'audit | Décider si le projet reste en points exacts (162) ou adopte la marque FFB (160 + arrondi) |
| Mode `announced-points` | Réussite : seul le contrat au preneur ; chute : seul le contrat à la défense | Aucun équivalent FFB direct ; explicitement documenté V1 | VARIANTE INTENTIONNELLE | P1, ruleset distinct | `scoring.ts`, `RULES.md` | Table complète d'audit | Conserver comme mode arcade clairement nommé, ou retirer lors d'un passage FFB |
| Coinché / surcoinché au score | Le multiplicateur 2/4 s'applique uniquement à la valeur du contrat ; en `made-points`, les points faits restent séparés | FFB : `(160 + contrat + annonces) × 2/4`, défense à zéro sauf belote | VARIANTE INTENTIONNELLE | P1, écarts de plusieurs centaines de points | `scoring.ts`, `RULES.md` | 12 combinaisons mode/statut/résultat | Décision produit obligatoire avant changement |
| Arrondi | Aucun arrondi ; tous les points exacts sont conservés | FFB : arrondi à la dizaine la plus proche pour la marque | DIFFÉRENCE DE RULESET À CONFIRMER | P2 | `scoring.ts` | Table de score exacte | Choisir explicitement « points exacts » ou marque FFB |
| Capot non annoncé | Huit plis ne transforment pas le dix de der en 100 ; total reste 162 | FFB : dix de der = 100, total = 252 | FEATURE ABSENTE | P2, score et bonus manquants | `rules.ts`, `game.ts`, `scoring.ts` | Invariant actuel à 162 | Ajouter seulement après choix de ruleset |
| Capot annoncé | Aucun type d'enchère capot ; 160 est la valeur maximale | FFB : capot au-dessus de toute enchère numérique | FEATURE ABSENTE | P2 | `types.ts`, `bidding.ts`, `scoring.ts` | Liste exhaustive des valeurs | Concevoir type de contrat et score capot séparément |
| Belote / rebelote | Aucun état, action, détection ou bonus de 20 | FFB, §7 | FEATURE ABSENTE | P2 | aucun support dans `types.ts`/`game.ts` | Absence vérifiée structurellement | Décider si le ruleset « sans annonces » exclut aussi la belote |
| Tierce, cinquante, cent, carrés | Aucun état, déclaration, arbitrage ou score | FFB, §8 ; le projet vise possiblement « sans annonces » | FEATURE ABSENTE / VARIANTE INTENTIONNELLE | P2 | aucun support dans l'engine | Absence vérifiée structurellement | Confirmer officiellement « Coinche sans annonces » dans le produit |
| Sans Atout / Tout Atout | Non représentés ; seules quatre couleurs sont autorisées | FFB : variante optionnelle | CONFORME au ruleset de base | — | `types.ts`, `bidding.ts` | Types et valeurs | Aucune si cette variante n'est pas souhaitée |
| Historique et score cumulé | Chaque manche terminée ajoute résultat et total ; scores cumulés conservés | Déroulement attendu | CONFORME | — | `game.ts`, `types.ts` | `game.test.ts`; `multiplayerHistory.test.ts` | Aucune |
| Forfeit | Termine immédiatement, donne la victoire au camp opposé, conserve cartes/scores/historique | Convention produit, hors règle de table FFB | VARIANTE INTENTIONNELLE | P2, nécessaire au multijoueur | `game.ts`; orchestration serveur | `forfeitHost.test.ts` | Aucune |
| Fin sous la cible | La partie continue | FFB, §10.4 | CONFORME | — | `game.ts` | Test d'audit | Aucune |
| Une équipe à la cible | Cette équipe gagne | FFB, §10.4 | CONFORME | — | `game.ts` | `game.test.ts`; audit | Aucune |
| Deux équipes au-dessus, scores différents | Le score total supérieur gagne | FFB, §10.4 | CONFORME | — | `game.ts` | Test d'audit | Aucune |
| Égalité exacte au-dessus de la cible | L'équipe 0 gagne systématiquement à cause de l'ordre des conditions | FFB : une donne supplémentaire départage | BUG CERTAIN | P1, biais déterministe selon les sièges | `game.ts` (`winningTeam`) | Test révélateur 161–161 | Retourner `null` en cas d'égalité et lancer une nouvelle manche |
| Vue joueur | Seulement sa main et les comptes des autres ; aucune main cachée | Exigence d'intégrité du jeu | CONFORME | — | `views.ts` | `views.test.ts`; tests multijoueur | Aucune |

## Matrice de légalité validée

La matrice automatisée couvre les cas suivants, avec comparaison exacte entre ensemble légal et ensemble attendu :

1. entame libre ;
2. deuxième joueur fournissant hors atout ;
3. troisième joueur obligé de fournir malgré une coupe adverse ;
4. quatrième joueur obligé de monter à l'atout même avec partenaire maître ;
5. atout demandé sans possibilité de monter ;
6. deuxième joueur obligé de couper, adversaire maître ;
7. troisième joueur libre, partenaire maître à la couleur ;
8. quatrième joueur ne possédant que des atouts, partenaire maître après coupe ;
9. défausse libre sans couleur ni atout ;
10. surcoupe obligatoire ;
11. « ne pisse pas » quand la surcoupe est impossible ;
12. liberté quand le partenaire a déjà coupé maître.

Pour chaque ligne, `getLegalCards` et `isLegalCard` sont vérifiés sur toutes les cartes de la main. `playCard` est aussi testé pour accepter une carte légale, refuser une carte possédée mais illégale, et refuser une carte absente.

## Invariants validés

Sur 32 seeds plus une répétition déterministe :

- le paquet initial contient toujours 32 cartes uniques et chaque joueur en reçoit 8 ;
- l'union mains + pli courant + plis terminés contient toujours exactement les mêmes 32 cartes uniques ;
- aucune carte n'est jouée deux fois ;
- `legalCards` n'est jamais vide en phase `playing` ;
- le joueur courant avance cycliquement dans un pli et le gagnant devient leader du suivant ;
- chaque manche contient exactement 8 plis de 4 cartes et 32 cartes jouées ;
- une manche normale totalise exactement 162 points ;
- la même seed produit exactement le même état final.

## RULESET ACTUEL RÉEL

Le moteur implémente une **Contrée numérique simplifiée, à quatre couleurs, sans belote, sans annonces et sans capot**, et non la Coinche FFB complète.

- Quatre joueurs, équipes fixes 0+2 contre 1+3, partance initiale aléatoire puis rotation cyclique.
- Paquet de 32 cartes mélangé, 8 cartes par joueur ; coupe, donneur physique et paquets de distribution non modélisés.
- Enchères numériques 80–160 par 10, une couleur d'atout, passe réversible, coinche et surcoinche à tour de rôle.
- Trois passes ferment normalement les enchères ; une surcoinche les ferme immédiatement.
- Le dernier enchérisseur, et non la partance, entame la donne.
- Le jeu de la carte suit correctement les obligations FFB de fournir, couper, monter, surcouper, se défausser et « ne pas pisser ».
- Chaque donne jouée vaut toujours 162 points, même lorsque la même équipe prend les huit plis.
- Un contrat réussit dès que les points du preneur atteignent sa valeur ; la comparaison avec la défense manque.
- `made-points` conserve les points exacts et ajoute la valeur multipliée du contrat ; `announced-points` ne conserve que la valeur multipliée du contrat.
- Aucun arrondi n'est appliqué.
- La partie finit quand un score atteint la cible ; le plus haut gagne si les deux la dépassent, mais une égalité exacte attribue actuellement la victoire à l'équipe 0.
- Une manche à quatre passes est enregistrée à zéro, puis l'application déclenche explicitement la suivante.
- Un abandon termine la partie sans inventer de score ni de résultat de manche.

## ÉCARTS AVEC COINCHE FFB

Les écarts majeurs sont :

1. la réussite ne requiert pas de battre strictement la défense ;
2. l'entame appartient au preneur au lieu du joueur à droite du donneur ;
3. la fenêtre de réponse à une coinche tardive peut priver le partenaire du preneur d'une surcoinche ;
4. les formules coinchées/surcoinchées et les deux modes de marque ne correspondent pas à la formule FFB ;
5. aucun arrondi à la dizaine ;
6. capot réalisé ou annoncé absent ;
7. belote/rebelote et annonces absentes ;
8. égalité exacte au-dessus de la cible attribuée à l'équipe 0 au lieu d'une donne de départage ;
9. l'API moteur accepte une valeur d'enchère hors liste si le typage est contourné, même si l'API multijoueur bloque actuellement ce cas.

## DÉCISIONS PRODUIT À PRENDRE

1. **Identité du jeu** : officialiser « Contrée/Coinche sans annonces » ou viser la conformité FFB complète.
2. **Entame** : conserver la variante documentée « preneur entame » ou adopter la partance FFB.
3. **Score** : conserver les modes arcade actuels ou définir un mode FFB unique avec base 160, multiplicateurs globaux et arrondi.
4. **Belote** : décider si « sans annonces » conserve néanmoins belote/rebelote, normalement distincte des suites et carrés.
5. **Capot** : décider ensemble capot non annoncé, enchère capot, dix de der à 100 et multiplicateurs.
6. **Bugs indépendants du ruleset** : planifier la fenêtre de surcoinche tardive, l'égalité de fin de partie et la validation runtime des valeurs.
7. **Condition de réussite** : si le produit revendique la Coinche, ajouter impérativement `preneur > défense`; même dans le ruleset simplifié, décider explicitement le cas 81–81.

## Ordre recommandé des suites

- P1 : corriger la condition de réussite, la fenêtre post-coinche et l'égalité de fin après validation produit.
- P1 : décider entame et modèle de score avant toute reprise sérieuse du benchmarking bot, car ces règles changent fortement les distributions de résultats.
- P2 : décider belote, annonces et capot comme un lot cohérent de ruleset.
- P2 : ajouter la garde runtime des valeurs dans `makeBid`.
- P3 : clarifier la terminologie donneur/partance et le déclenchement manuel de la manche suivante.
