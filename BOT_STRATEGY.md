# Strategie des bots

Cette version garde des bots simples et lisibles. Ils n'utilisent pas de machine learning.

Le bot principal utilise maintenant une approche hybride:

- heuristique classique pour les annonces et les coups simples;
- Monte Carlo pour certains coups de carte importants ou ambigus.

## Profils disponibles

L'application web utilise un bot principal unique: `main_montecarlo_v2`. Il garde les annonces du bot principal, puis utilise Monte Carlo seulement pour certains choix de carte.

Dans l'application web, les bots utilisent toujours ce profil officiel. Les autres profils ne sont pas melanges dans une partie web: ils servent uniquement aux simulations, aux comparaisons et au tuning.

Les profils ci-dessous restent disponibles pour le simulateur et le tuning.

- `main`: ancien bot principal heuristique. Il reste utile comme reference et fallback.
- `main_montecarlo`: premiere version Monte Carlo, gardee pour comparer les benchmarks.
- `main_montecarlo_v2`: bot principal actuel de l'application web. Plus prudent sur les mondes simules et plus sensible au contrat.
- `prudent`: annonce seulement avec une main assez sure, evite les surencheres risquees, coinche rarement et economise davantage les grosses cartes.
- `balanced`: profil de reference. Il ressemble au prudent, mais garde un peu plus d'initiative pour annoncer et prendre la main.
- `aggressive`: annonce plus facilement que les autres, mais reste limite pour eviter les contrats trop suicidaires.

Dans une simulation, une equipe utilise un profil. Exemple: equipe 0 en `balanced` contre equipe 1 en `aggressive`.

## Monte Carlo V1 et V2

`main_montecarlo` est la V1. Elle retire les cartes visibles, repartit les cartes inconnues entre les autres joueurs, simule des fins de manche, puis choisit la carte avec le meilleur score moyen.

`main_montecarlo_v2` garde cette idee, mais ajoute trois ameliorations simples:

- si un joueur n'a pas fourni une couleur, les simulations evitent de lui redonner cette couleur;
- les cartes fortes sont reparties avec un leger biais coherent avec le contrat, sans connaitre les vraies mains;
- le score d'une simulation valorise davantage la reussite du contrat ou la chute du contrat adverse.

La V2 declenche aussi Monte Carlo surtout quand le pli contient des points, quand une carte peut gagner ou perdre le pli, ou quand le contrat devient critique. Sur les coups evidents, elle garde l'heuristique.

## Bot principal de l'application web

Le bot principal est volontairement proche de `prudent`.

Il garde les points forts du prudent:

- il evite les contrats trop fragiles;
- il coinche seulement avec une vraie marge;
- il preserve ses grosses cartes;
- il limite les grosses chutes.

Il a juste un peu plus d'initiative:

- il annonce un peu plus facilement quand la main est solide;
- il accepte certaines surencheres raisonnables;
- il prend plus volontiers un pli gagnable quand le cout reste faible.

L'objectif est simple: avoir un bot coherent pour jouer dans l'interface, sans melanger plusieurs personnalites dans une meme partie.

## Strategie d'annonces

Le bot evalue sa main pour chaque couleur d'atout possible.

Pour chaque couleur, il regarde:

- le nombre d'atouts;
- les gros atouts: Valet, 9 et As d'atout;
- les As hors atout;
- les 10 hors atout;
- les couleurs courtes;
- les couleurs vides;
- les points reels de la main.

Ensuite il fabrique trois idees simples:

- potentiel offensif: est-ce que la main peut gagner des plis;
- securite: est-ce que le contrat semble solide;
- potentiel de coupe: est-ce que la main pourra couper plus tard.

Le total donne un score. Plus le score est haut, plus le bot peut annoncer haut.

Les seuils sont volontairement simples:

- score faible: passe;
- score correct: annonce 80 ou 90;
- score fort: annonce 100, 110 ou 120;
- score tres fort: peut monter encore.

Le profil modifie ces seuils. Le prudent demande le plus de securite. L'equilibre reste proche du prudent, mais accepte un peu plus d'initiative. L'agressif accepte encore plus de risque, mais ses annonces sont maintenant freinees pour eviter de monter trop haut trop souvent.

## Annonces en equipe

Le bot principal joue davantage en partenariat.

Quand son partenaire a deja annonce une couleur, le bot principal considere cette annonce comme une information utile:

- il valorise les cartes qui soutiennent la couleur du partenaire;
- il prefere souvent relancer dans la meme couleur;
- il evite de changer d'atout juste parce que sa main a une autre couleur correcte;
- il change de couleur seulement si sa propre couleur est nettement meilleure.

Exemple simple: si le partenaire annonce a coeur, et que le bot a plusieurs coeurs utiles, il va plutot soutenir coeur. Il ne partira a pique que si sa main a pique est vraiment beaucoup plus forte.

Cette logique evite un probleme classique chez les bots simples: chacun joue son propre jeu, sans respecter l'information donnee par le partenaire.

## Partance

La partance signifie ici: parler en premier dans la manche.

Le bot principal donne un petit bonus a une bonne main de partance. L'idee est simple:

- parler en premier permet parfois d'imposer une couleur;
- une bonne main peut meriter d'ouvrir un peu plus facilement;
- mais le bonus reste faible pour eviter les annonces folles.

Quand une annonce est deja ouverte, le bot principal redevient plus discipline. Il ne repond pas comme s'il etait seul: il regarde le contrat deja pose, le partenaire, et le risque de surenchere.

## Surenchere

Quand un contrat existe deja, le bot ne peut annoncer que plus haut.

Il compare:

- la force estimee de sa main;
- la hauteur du contrat actuel;
- le risque accepte par son profil.

Un bot prudent abandonne plus vite si le contrat est deja haut. L'equilibre peut monter quand sa main suit vraiment. L'agressif accepte plus souvent de monter, mais il doit maintenant avoir une vraie marge avant de surencherir.

## Coinche

Pour coincher, le bot regarde sa main contre l'atout adverse.

Il coinche seulement si sa defense semble assez forte par rapport au contrat annonce. Une coinche est consideree comme reussie dans les statistiques si le contrat adverse chute.

Le prudent a besoin d'une marge importante. L'equilibre garde aussi une marge assez forte. L'agressif a une marge plus petite, mais elle reste suffisante pour eviter de coincher trop souvent avec une defense fragile.

## Surcoinche

La surcoinche est autorisee par le moteur.

Le bot surcoinche si son equipe a le contrat, que l'adversaire a coinche, et que sa main semble assez forte pour accepter le risque. Cette action reste rare, surtout avec le profil prudent.

## Strategie de jeu des cartes

Le bot ne choisit jamais une carte illegale. Il demande d'abord au moteur la liste des cartes jouables.

Ensuite il applique des principes simples:

- si le partenaire gagne deja le pli, il joue une carte peu couteuse;
- si l'adversaire gagne, il essaie de gagner avec la carte utile la moins chere;
- s'il ne peut pas gagner, il jette une carte peu utile;
- il evite de gaspiller les gros atouts sans raison;
- il protege les points importants;
- s'il attaque, il peut prendre un peu plus l'initiative;
- s'il defend, il cherche surtout a faire chuter le contrat adverse.

## Jeu en equipe

Le bot principal evite de jouer comme s'il etait seul.

Il applique trois idees simples:

- si le partenaire gagne deja le pli, ne pas l'ecraser inutilement;
- si le pli du partenaire contient deja des points, il peut ajouter une carte a points, mais sans sacrifier un gros atout;
- si l'adversaire gagne un pli important, il essaie de reprendre avec la carte gagnante la moins chere.

Le but n'est pas que le bot gagne tous les plis lui-meme. Le but est que son camp marque ou fasse chuter le contrat adverse.

## Plan de jeu en attaque

Quand le camp du bot a le contrat, le bot principal cherche d'abord a securiser le contrat.

S'il commence un pli et qu'il controle suffisamment l'atout, il peut tirer un gros atout. L'objectif est de faire tomber les atouts adverses avant d'encaisser des As ou des cartes maitresses.

Pourquoi? Parce qu'un As hors atout peut etre coupe plus tard si les adversaires n'ont plus la couleur. Tirer atout avant peut reduire ce risque.

Mais ce n'est pas automatique:

- si le bot ne controle pas assez l'atout, il ne force pas cette ligne;
- en debut de manche, il peut quand meme encaisser un As, car les autres joueurs ont souvent encore la couleur;
- s'il n'a pas de ligne claire, il revient a une carte economique.

## Plan de jeu en defense

Quand le camp adverse a le contrat, le bot principal cherche a faire chuter.

Il evite de tirer atout pour l'attaquant sans raison. En defense, tirer atout peut parfois aider le camp qui a annonce.

Il prefere souvent:

- garder des atouts pour couper plus tard;
- jouer une couleur courte pour preparer une coupe;
- casser le rythme de l'attaque;
- prendre un pli important avec la carte gagnante la moins chere.

## Jouer les As au bon moment

Le bot principal comprend une idee simple: au debut d'une manche, jouer un As est souvent moins risque.

Au debut, les joueurs ont plus souvent encore la couleur. Donc l'As a plus de chances de passer sans etre coupe.

Plus tard, le risque de coupe augmente. Le bot devient alors plus prudent avec ses As hors atout, surtout si son camp ne controle pas l'atout.

## Differences entre profils au jeu de la carte

Le prudent preserve plus ses cartes fortes. Il gagne le pli quand c'est utile, mais evite les prises de risque gratuites.

L'agressif met plus de pression. Quand son equipe attaque, il peut mener plus fort et utiliser plus vite les cartes de controle, mais il preserve maintenant un peu plus ses grosses cartes qu'avant.

L'equilibre reste entre les deux. C'est le profil a utiliser comme point de comparaison.

## Ou lire le code

- `bots/profiles.ts`: valeurs des profils.
- `bots/evaluation/handEvaluation.ts`: evaluation d'une main.
- `bots/strategy/biddingStrategy.ts`: annonces, surencheres, coinches et surcoinches.
- `bots/strategy/cardStrategy.ts`: choix de la carte a jouer.
- `bots/simpleBot.ts`: compatibilite avec l'application web.
