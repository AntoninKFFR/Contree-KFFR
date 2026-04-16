# Règles choisies pour la V1

Cette V1 est volontairement simple pour apprendre la structure d'une application de jeu avant d'ajouter toutes les règles avancées.

## Hypothèses

- Il y a 4 joueurs: toi en joueur 1, puis 3 bots.
- Les équipes sont fixes: joueur 1 + joueur 3 contre joueur 2 + joueur 4.
- On utilise un jeu de 32 cartes: 7, 8, 9, Valet, Dame, Roi, 10, As.
- Il n'y a pas encore d'enchères.
- L'atout est fixé à coeur pour toute la manche.
- Le joueur humain commence.
- Chaque joueur reçoit 8 cartes.
- Le joueur qui gagne un pli commence le pli suivant.
- Le joueur doit fournir la couleur demandée s'il en a une.
- Si le joueur ne peut pas fournir, il peut jouer n'importe quelle carte.
- Pour cette V1, il n'y a pas encore d'obligation de couper, de surcouper, ni de contrat annoncé.

## Valeur des cartes

Hors atout:

- As: 11
- 10: 10
- Roi: 4
- Dame: 3
- Valet: 2
- 9, 8, 7: 0

A l'atout:

- Valet: 20
- 9: 14
- As: 11
- 10: 10
- Roi: 4
- Dame: 3
- 8, 7: 0

Le dernier pli ajoute 10 points.

## Pourquoi cette simplification ?

La vraie coinche contient des enchères, des annonces, des contrats, la coinche, la surcoinche, et des obligations plus fines quand un joueur ne peut pas fournir. Pour une V1 pédagogique, on garde le coeur du jeu: distribuer, jouer à tour de rôle, respecter la couleur, déterminer le gagnant du pli et compter les points.
