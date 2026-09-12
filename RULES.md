# Règles de la Contrée classique implémentées

Le mode interne `ffb` est le ruleset canonique et le mode par défaut. Le produit applique notre variante de Contrée classique à quatre joueurs, répartis en deux équipes fixes de deux joueurs face à face.

Référence principale : [Règles officielles de la Belote Coinchée (FFB)](https://www.ffbelote.org/wp-content/uploads/2015/11/REGLES-DE-LA-BELOTE-COINCHEE.pdf).

## Donne et partance

- Le jeu contient 32 cartes : 7, 8, 9, Valet, Dame, Roi, 10 et As dans les quatre couleurs.
- Chaque joueur reçoit huit cartes.
- La première partance est tirée au sort, puis tourne d'un joueur à la donne suivante.
- La partance parle en premier aux enchères et entame le premier pli, quel que soit le preneur.
- Le gagnant d'un pli entame le pli suivant.

## Enchères

- Une enchère numérique associe une valeur de 80 à 160, par paliers de 10, et une couleur d'atout.
- Toute nouvelle enchère numérique doit être strictement supérieure à la précédente.
- Un joueur ayant passé peut enchérir plus tard si la parole lui revient.
- Le capot est un contrat distinct, supérieur à 160 : il engage l'équipe à gagner les huit plis et aucune enchère ne peut le dépasser.
- Quatre passes sans contrat annulent la donne sans score.
- Après une enchère ou une coinche, les enchères se terminent lorsque les trois joueurs suivants ont passé.
- Un adversaire peut coincher uniquement à son tour. Le contrat est alors figé et le score réglementaire est doublé.
- Un membre de l'équipe preneuse peut surcoincher à son tour. La surcoinche termine immédiatement les enchères et quadruple le score réglementaire.
- Les valeurs forgées hors de la liste autorisée sont refusées par le moteur à l'exécution.

## Jeu de la carte

Hors atout, l'ordre décroissant est As, 10, Roi, Dame, Valet, 9, 8, 7. À l'atout, il est Valet, 9, As, 10, Roi, Dame, 8, 7.

Valeurs hors atout : As 11, 10 10, Roi 4, Dame 3, Valet 2, puis 9, 8 et 7 à 0. Valeurs à l'atout : Valet 20, 9 14, As 11, 10 10, Roi 4, Dame 3, puis 8 et 7 à 0.

- Il faut fournir la couleur demandée lorsqu'on la possède.
- À l'atout, il faut monter si possible.
- Sans la couleur demandée, il faut couper si le partenaire n'est pas maître et si l'on possède de l'atout.
- Si un adversaire a coupé, il faut surcouper si possible. Sans atout supérieur, la défausse est permise.
- Quand le partenaire est maître, la défausse est permise ; si l'on ne possède que de l'atout après la coupe maîtresse du partenaire, il n'est pas obligatoire de monter.
- Le dernier pli vaut 10 points, portant une donne ordinaire à 162 points de plis.

## Belote et rebelote

Le joueur qui possède ensemble le Roi et la Dame d'atout déclare la belote en jouant la première de ces cartes, puis la rebelote en jouant la seconde. La combinaison vaut 20 points pour son équipe. Le moteur conserve explicitement la première déclaration et son achèvement. La belote est imprenable : elle reste acquise même en cas de chute, de coinche ou de surcoinche.

Dans l'interface, ces déclarations sont enregistrées automatiquement au moment où les cartes sont jouées ; cela correspond au choix déterministe de toujours annoncer une combinaison valide.

Notre variante ne compte aucune annonce de séquence ou de carré. Ces combinaisons ne sont ni détectées, ni déclarées, ni ajoutées aux points. Seule la Belote/Rebelote reste comptabilisée.

## Réussite du contrat

Pour une enchère numérique, les preneurs doivent remplir simultanément les deux conditions suivantes :

1. atteindre ou dépasser la valeur demandée ;
2. obtenir strictement plus de points que la défense.

Ainsi, 81–81 et 80–82 font chuter un contrat à 80 ; 82–80 le réussit. Pour un capot demandé, les preneurs doivent gagner les huit plis.

Les points utilisés pour cette vérification comprennent uniquement les plis et la Belote/Rebelote éventuelle.

## Capot réalisé

Quand une équipe gagne les huit plis, le dernier pli vaut 100 au lieu de 10 et le total des plis est 252. Cette règle s'applique que le capot ait été demandé ou non.

## Marque FFB

Le montant du contrat est la valeur numérique annoncée, ou 250 pour un capot demandé. Chaque score final de donne est arrondi à la dizaine la plus proche, avec 5 arrondi vers le haut.

Contrat normal réussi :

- les preneurs marquent leur total de donne plus le montant du contrat ;
- la défense marque son total de donne.

Contrat coinché ou surcoinché réussi :

- les preneurs marquent la base réglementaire (160, ou 250 si un capot est réalisé), leur belote éventuelle et le montant du contrat ; l'ensemble est multiplié par 2 ou 4 ;
- la défense ne conserve que sa belote éventuelle.

Contrat chuté :

- les preneurs ne conservent que leur belote éventuelle ;
- la défense marque 160 points de chute, le montant du contrat et sa belote éventuelle ; l'ensemble est multiplié par 2 ou 4 si le contrat était coinché ou surcoinché ;
- la base passe à 250 si la défense réalise un capot ou si le contrat demandé était un capot.

## Fin de partie

La première équipe qui atteint ou dépasse le score cible avec un score strictement supérieur gagne. Si les deux équipes dépassent la cible, le meilleur total gagne. En cas d'égalité exacte au-dessus de la cible, aucune équipe ne gagne encore : une donne supplémentaire les départage.

Une équipe qui a chuté ou subi un capot ne valide pas la victoire si elle ne franchit la cible que grâce à sa belote imprenable ; elle doit encore remporter un pli lors d'une donne suivante.

La cible par défaut du mode FFB est 1000 points.

## Modes historiques

Les modes `made-points` et `announced-points` restent disponibles pour lire les parties existantes et préserver la compatibilité. Ils utilisent leurs anciennes formules de marque, mais partagent les corrections structurelles du moteur : validation des enchères, vraie fenêtre de trois passes, entame par la partance et condition de réussite avec supériorité stricte sur la défense. Les nouvelles parties standard utilisent `ffb`.

La variante Sans Atout / Tout Atout n'est pas incluse dans le ruleset retenu.
