# Entrainement et comparaison des bots

Le mode simulation sert a faire jouer des bots entre eux sans ouvrir l'interface web.

Il utilise le moteur existant:

- distribution;
- annonces;
- coinche;
- surcoinche;
- plis;
- score;
- plusieurs manches jusqu'a la fin de partie.

## Lancer une simulation

Commande de base:

```bash
npm run simulate:bots
```

Par defaut, la commande lance 100 parties avec:

- equipe 0: `balanced`;
- equipe 1: `aggressive`;
- score: points faits.

Important: l'application web utilise toujours le bot officiel `main`. Les options `team0` et `team1` servent seulement aux simulations.

## Choisir le nombre de parties

```bash
npm run simulate:bots -- --games=1000
```

Tu peux essayer:

```bash
npm run simulate:bots -- --games=100
npm run simulate:bots -- --games=1000
npm run simulate:bots -- --games=5000
```

Plus le nombre est grand, plus le resultat est stable.

## Comparer deux profils

```bash
npm run simulate:bots -- --team0=prudent --team1=aggressive --games=1000
```

Profils possibles:

- `main`;
- `prudent`;
- `balanced`;
- `aggressive`.

Exemples utiles:

```bash
npm run simulate:bots -- --team0=main --team1=prudent --games=1000
npm run simulate:bots -- --team0=main --team1=balanced --games=1000
npm run simulate:bots -- --team0=main --team1=aggressive --games=1000
npm run simulate:bots -- --team0=balanced --team1=aggressive --games=1000
npm run simulate:bots -- --team0=balanced --team1=prudent --games=1000
npm run simulate:bots -- --team0=prudent --team1=aggressive --games=1000
```

## Choisir la variante de scoring

Points faits:

```bash
npm run simulate:bots -- --scoring=made-points --games=1000
```

Points annonces:

```bash
npm run simulate:bots -- --scoring=announced-points --games=1000
```

## Lire les resultats

Le simulateur affiche notamment:

- le nombre de parties simulees;
- le nombre de manches jouees;
- les victoires par equipe;
- le taux de victoire;
- le score moyen par partie;
- le score moyen par manche;
- le nombre moyen de plis gagnes;
- les contrats tentes;
- les contrats reussis;
- les contrats chutes;
- le taux de reussite des contrats;
- l'annonce moyenne;
- la repartition des annonces;
- les coinches tentees;
- les coinches reussies;
- les coinches non rentables;
- les surcoinches tentees;
- les scores moyens par profil;
- les scores moyens quand un profil attaque ou defend.

## Comment interpreter

Regarde d'abord le taux de victoire. C'est la mesure la plus simple.

Regarde ensuite le taux de reussite des contrats:

- trop bas: le bot annonce probablement trop haut ou trop souvent;
- tres haut mais peu de victoires: le bot est peut-etre trop timide;
- beaucoup de chutes: il faut rendre les seuils d'annonces plus prudents.

Regarde aussi l'annonce moyenne:

- si elle est tres haute avec beaucoup de chutes, le profil est trop agressif;
- si elle est basse avec peu de contrats, le profil ne met pas assez de pression.

Pour la coinche:

- coinches reussies: le bot a bien senti que le contrat adverse chutait;
- coinches non rentables: le bot a coinche mais le contrat adverse est passe.

## Ameliorer les bots ensuite

Avance petit a petit.

Une bonne methode:

1. Lance `balanced` contre `balanced` pour avoir une base.
2. Lance `balanced` contre un profil modifie.
3. Compare au moins 1000 parties.
4. Change une seule regle a la fois.
5. Relance la meme simulation.
6. Garde le changement seulement si les statistiques s'ameliorent.

Exemples de reglages:

- augmenter les seuils du prudent s'il chute trop;
- baisser legerement les seuils si un profil n'annonce presque jamais;
- rendre l'agressif moins agressif si ses coinches sont trop souvent non rentables;
- renforcer la defense si le profil perd trop quand l'adversaire attaque.

Les valeurs principales sont dans `bots/profiles.ts`.
