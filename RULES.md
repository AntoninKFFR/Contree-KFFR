# Règles choisies pour la V1

Cette V1 est volontairement simple pour apprendre la structure d'une application de jeu avant d'ajouter toutes les règles avancées.

## Hypothèses

- Il y a 4 joueurs: Anto, Max, Boulais, Allan.
- Les équipes sont fixes: Anto + Boulais contre Max + Allan.
- Une partie complète est composée de plusieurs manches.
- On utilise un jeu de 32 cartes: 7, 8, 9, Valet, Dame, Roi, 10, As.
- Chaque joueur reçoit 8 cartes.
- Il y a une phase d'enchères avant de jouer les cartes.
- Anto parle en premier, puis Max, Boulais, Allan.
- Un joueur peut passer ou annoncer de 80 à 160, par paliers de 10, avec une couleur d'atout.
- Une nouvelle annonce doit être plus haute que l'annonce actuelle.
- Passer ne bloque pas définitivement le joueur: si quelqu'un annonce ensuite, la parole peut revenir.
- Un adversaire du contrat actuel peut coincher.
- L'équipe qui tient le contrat peut surcoincher après une coinche.
- Les annonces se terminent quand la parole revient au joueur qui tient le meilleur contrat.
- Le contrat final est la meilleure annonce.
- Le contrat final peut être normal, coinché ou surcoinché.
- L'atout de la manche est la couleur du contrat final.
- L'équipe du joueur qui a fait le contrat final devient l'équipe preneuse.
- Si tout le monde passe, la manche s'arrête sans points et on peut lancer la manche suivante.
- Le joueur qui remporte le contrat commence le premier pli après les annonces.
- Le joueur qui gagne un pli commence le pli suivant.
- Le joueur doit fournir la couleur demandée s'il en a une.
- Si la couleur demandée est l'atout, le joueur doit monter à l'atout s'il peut.
- Si le joueur ne peut pas fournir et que l'adversaire est maître du pli, il doit couper s'il a de l'atout.
- Si un adversaire a déjà coupé, le joueur doit surcouper s'il peut.
- Si un adversaire a déjà coupé et que le joueur ne peut pas surcouper, il peut se défausser.
- Si le joueur ne peut pas fournir et que son partenaire est maître du pli, il peut pisser: il n'est pas obligé de couper.

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

## Coinche et surcoinche

Pour cette V1:

- Un joueur peut coincher seulement si le contrat actuel appartient à l'équipe adverse.
- Un joueur peut surcoincher seulement si le contrat actuel appartient à son équipe et qu'il a déjà été coinché.
- Une coinche multiplie la valeur du contrat par 2 pour le score.
- Une surcoinche multiplie la valeur du contrat par 4 pour le score.

Exemple: Max annonce 90. Anto coinche. Le contrat vaut 180 au score. Si Max ou Allan surcoinche, il vaut 360 au score.

## Variantes de score

La V1 propose deux modes.

### Mode points faits

Ce mode garde les points de plis dans le score final.

- Contrat réussi: l'équipe preneuse marque ses points de plis + la valeur du contrat multipliée si besoin.
- Contrat réussi: l'équipe adverse marque ses points de plis.
- Contrat chuté: l'équipe preneuse marque 0.
- Contrat chuté: l'équipe adverse marque 162 + la valeur du contrat multipliée si besoin.

Exemple: Anto annonce 80 et réussit avec 92 points de plis. Anto + Boulais marquent 92 + 80 = 172. Max + Allan marquent leurs 70 points.

### Mode points annoncés

Ce mode ne marque que la valeur annoncée du contrat.

- Contrat réussi: l'équipe preneuse marque la valeur du contrat multipliée si besoin.
- Contrat réussi: l'équipe adverse marque 0.
- Contrat chuté: l'équipe preneuse marque 0.
- Contrat chuté: l'équipe adverse marque la valeur du contrat multipliée si besoin.

Exemple: Anto annonce 80 et réussit. Anto + Boulais marquent 80. Max + Allan marquent 0.

## Réussite du contrat

Quand toutes les cartes ont été jouées, on regarde les points de plis.

- Si l'équipe preneuse atteint au moins la valeur du contrat, le contrat est réussi.
- Si l'équipe preneuse n'atteint pas la valeur du contrat, le contrat est chuté.

Le mode de score choisi décide ensuite combien chaque équipe marque.

## Partie complète

Après chaque manche:

- le score de la manche est ajouté au score total de la partie;
- un résumé de la manche est ajouté à l'historique;
- si aucune équipe n'a atteint le score cible, on peut lancer la manche suivante;
- si une équipe atteint le score cible, la partie se termine.

Scores cibles V1:

- Mode points faits: 1000 points.
- Mode points annoncés: 500 points.

Ces valeurs sont simples et cohérentes avec la vitesse de score de chaque mode. En points faits, les plis ajoutent beaucoup de points, donc la cible est plus haute. En points annoncés, seuls les contrats marquent, donc la cible est plus basse.

## Pourquoi cette simplification ?

La vraie coinche contient aussi la coinche, la surcoinche, parfois des annonces de combinaisons, et des obligations plus fines quand un joueur ne peut pas fournir. Pour une V1 pédagogique, on garde une base claire: annoncer un contrat simple, choisir l'atout, jouer les plis, puis vérifier si le contrat est réussi ou chuté.
