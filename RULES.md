# Règles choisies pour la V1

Cette V1 est volontairement simple pour apprendre la structure d'une application de jeu avant d'ajouter toutes les règles avancées.

## Hypothèses

- Il y a 4 joueurs: Anto, Max, Boulais, Allan.
- Les équipes sont fixes: Anto + Boulais contre Max + Allan.
- On utilise un jeu de 32 cartes: 7, 8, 9, Valet, Dame, Roi, 10, As.
- Chaque joueur reçoit 8 cartes.
- Il y a une phase d'enchères avant de jouer les cartes.
- Anto parle en premier, puis Max, Boulais, Allan.
- Un joueur peut passer ou annoncer 80, 90 ou 100 avec une couleur d'atout.
- Une nouvelle annonce doit être plus haute que l'annonce actuelle.
- Passer ne bloque pas définitivement le joueur: si quelqu'un annonce ensuite, la parole peut revenir.
- Les annonces se terminent quand la parole revient au joueur qui tient le meilleur contrat.
- Le contrat final est la meilleure annonce.
- L'atout de la manche est la couleur du contrat final.
- L'équipe du joueur qui a fait le contrat final devient l'équipe preneuse.
- Si tout le monde passe, la manche s'arrête sans points et il faut relancer une nouvelle partie.
- Anto commence le premier pli après les annonces.
- Le joueur qui gagne un pli commence le pli suivant.
- Le joueur doit fournir la couleur demandée s'il en a une.
- Si le joueur ne peut pas fournir, il peut jouer n'importe quelle carte.
- Pour cette V1, il n'y a pas encore d'obligation de couper ou de surcouper.

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

## Contrat et score de manche

Quand toutes les cartes ont été jouées, on regarde les points de plis.

- Si l'équipe preneuse atteint au moins la valeur du contrat, le contrat est réussi.
- Si l'équipe preneuse n'atteint pas la valeur du contrat, le contrat est chuté.

Score V1:

- Contrat réussi: chaque équipe marque ses points de plis, et l'équipe preneuse ajoute la valeur du contrat.
- Contrat chuté: l'équipe preneuse marque 0, et l'équipe adverse marque 162 + la valeur du contrat.

Exemple: Max annonce 90 à pique. Son équipe fait seulement 74 points. Le contrat est chuté, donc Anto + Boulais marquent 252 points.

## Pourquoi cette simplification ?

La vraie coinche contient aussi la coinche, la surcoinche, parfois des annonces de combinaisons, et des obligations plus fines quand un joueur ne peut pas fournir. Pour une V1 pédagogique, on garde une base claire: annoncer un contrat simple, choisir l'atout, jouer les plis, puis vérifier si le contrat est réussi ou chuté.
