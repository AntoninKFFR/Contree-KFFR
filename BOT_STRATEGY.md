# Strategie des bots V1

Le bot V1 reste volontairement simple, mais il n'est plus aleatoire ou purement passif. Il utilise des heuristiques, c'est-a-dire des petites regles pratiques qui donnent souvent une decision correcte sans chercher toutes les possibilites.

## 1. Evaluer une main

La fonction `evaluateHand` regarde une main avec une couleur d'atout possible.

Elle compte notamment:

- les points reels de la main;
- le nombre d'atouts;
- les atouts forts: Valet, 9 et As d'atout;
- les As;
- les 10;
- les couleurs courtes, qui peuvent aider a couper plus tard.

Elle produit un score. Plus le score est haut, plus la main semble forte.

## 2. Choisir une enchere simple

La fonction `chooseSimpleBid` teste les 4 couleurs comme atout possible.

Elle choisit la couleur qui donne le meilleur score:

- score faible: le bot passe;
- score moyen: le bot annonce 80;
- score bon: le bot annonce 90;
- score tres bon: le bot annonce 100.

Cette logique prepare les futures encheres. Pour l'instant, la partie V1 garde encore l'atout fixe defini dans le moteur.

## 3. Jouer une carte logique

La fonction `chooseCardToPlay` regarde le contexte du pli.

Si le bot commence le pli:

- il essaie de jouer une carte forte non-atout, comme un As;
- sinon il joue une petite carte non-atout;
- il evite de demarrer avec un bon atout sauf s'il n'a plus de meilleur choix.

Si le bot joue apres quelqu'un:

- si son partenaire gagne deja le pli, il economise ses bonnes cartes;
- si l'adversaire gagne, il essaie de prendre le pli avec la carte gagnante la moins chere;
- s'il ne peut pas gagner, il jette la carte la moins utile.

## 4. Preserver les atouts utiles

Le bot donne un cout special aux atouts forts. Cela veut dire qu'un Valet d'atout ou un 9 d'atout est considere comme plus precieux que ses points bruts.

Resultat: le bot evite de les gaspiller quand le pli est deja gagne par son partenaire ou quand il ne peut pas gagner.

## Limites de cette V1

Le bot ne memorise pas encore toutes les cartes tombees. Il ne calcule pas non plus toutes les issues possibles comme un moteur d'echecs.

C'est une bonne base lisible pour debuter. Les prochaines ameliorations naturelles seraient:

- memoriser les cartes deja jouees;
- mieux gerer la coupe et la surcoupe;
- utiliser les encheres dans le moteur de jeu;
- adapter le style du bot selon le score.
