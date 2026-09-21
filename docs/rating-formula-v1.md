# Formule Elo KFFR — version 1

> Spécification normative des calculs futurs. `formula_version = 1` est figée par match. Voir [PRD-rating.md](PRD-rating.md) pour l'éligibilité, la transaction et la sécurité.

## Entrées figées au passage `lobby → playing`

- Quatre sièges `seat_index` 0–3 ; équipes `team_id = seat_index % 2` (0+2 contre 1+3).
- Pour un humain : `rating_snapshot` depuis `player_ratings.rating` et `k_factor_snapshot` depuis `rated_games` **appliquées avant le départ**. Nouvelle ligne : 1 000 Elo, zéro partie, K=40.
- Pour un bot : `bot_profile_id`, `bot_version`/clé de calibration et `bot_rating_snapshot` résolu côté serveur. Fallback central de configuration : 1 000. Aucun K ni delta bot.
- `human_count`, configuration des deux équipes, `reliability_factor = F`, `formula_version = 1`.

Pour chaque équipe `T`, `TeamRating(T) = (rating(seat1) + rating(seat2)) / 2`. Pour A = équipe 0 et B = équipe 1 :

```text
ExpectedA = 1 / (1 + 10 ^ ((TeamB - TeamA) / 400))
ExpectedB = 1 - ExpectedA
```

Le résultat humain `S` vaut 1 si son équipe gagne, 0 si elle perd. Le moteur actuel garantit un vainqueur final ; pas de `S = 0,5` en V1. Calculer en précision suffisante (p. ex. double précision) **sans arrondir Expected** avant le delta.

| Parties Elo déjà appliquées au départ | K du joueur |
|---|---:|
| 0 à 9 | 40 |
| 10 à 29 | 36 |
| 30 et plus | 32 |

| Composition au départ | F |
|---|---:|
| 4 humains | 1,00 |
| 3 humains + 1 bot | 0,95 |
| 2 humains adversaires, chacun avec un bot | 0,85 |
| 2 humains partenaires contre 2 bots | 0,60 |
| 1 humain + 3 bots | 0,20 |

La composition n'altère pas `TeamRating` ni `Expected`. Elle détermine seulement `F`. Le takeover d'un siège humain après le départ ne change aucune entrée.

Pour chaque humain :

```text
rawDelta = K_snapshot × F × (S − ExpectedTeam)
normalDelta = roundHalfAwayFromZero(rawDelta)
```

**Arrondi exact :** entier le plus proche ; en cas de partie fractionnaire exactement 0,5, s'éloigner de zéro (`+n,5 → +(n+1)`, `−n,5 → −(n+1)`). Par exemple `+9,5 → +10`, `−9,5 → −10`, `+0,49 → 0`, `−0,49 → 0`. Éviter `Math.round` JavaScript pour les négatifs à demi-unité. Ne pas imposer de delta minimum. `K × F` borne naturellement l'amplitude ; les équipes ne constituent pas nécessairement un système Elo à somme nulle pour les **seuls humains** quand elles ont des bots ou des K différents.

## Forfeit officiel

Calculer d'abord tous les `normalDelta` entiers comme une défaite/victoire ordinaire. Si l'auteur du forfeit et son partenaire sont humains, soit `partnerLoss = normalDelta(partenaire) ≤ 0` :

```text
transfer = roundHalfAwayFromZero(0,5 × abs(partnerLoss))
delta(forfeiter) = normalDelta(forfeiter) − transfer
delta(partner) = partnerLoss + transfer
```

Le transfert est un **entier** ; la somme des deux deltas humains perdants reste exactement celle des pertes normales. À perte partenaire nulle, transfert nul. Si le partenaire est bot, `transfer = 0`, sans perte fictive à redistribuer. Les gagnants gardent leurs deltas normaux. Le compteur `forfeits` revient uniquement à l'auteur prouvé par le chemin serveur. Une simple déconnexion, un délai ou un bot takeover ne déclenchent aucun transfert.

## Exemples calculés

Dans A–E, chaque humain a déjà au moins 30 parties appliquées au départ (`K=32`) et tous les sièges valent 1 000. Ainsi `TeamA = TeamB = 1 000`, `ExpectedA = ExpectedB = 0,5`. Le signe est celui de l'humain considéré.

| Cas | Composition | F | Calcul victoire / défaite | Delta entier |
|---|---|---:|---|---:|
| A | 4 humains | 1,00 | `32 × 1 × (1−0,5) = +16` ; défaite `−16` | **+16 / −16** |
| B | 3 humains + 1 bot | 0,95 | `32 × 0,95 × 0,5 = 15,2` | **+15 / −15** |
| C | Humain+Bot contre Humain+Bot | 0,85 | `32 × 0,85 × 0,5 = 13,6` | **+14 / −14** |
| D | Humain+Humain contre Bot+Bot | 0,60 | `32 × 0,60 × 0,5 = 9,6` | **+10 / −10** |
| E | Humain+Bot contre Bot+Bot | 0,20 | `32 × 0,20 × 0,5 = 3,2` | **+3 / −3** |

**F — outsider avec un partenaire bot.** Antonin 1 500 + bot 1 000 contre Ben 1 500 + Koyora 1 500 ; trois humains, `F=0,95`, Antonin établi `K=32` :

```text
TeamA = (1 500 + 1 000) / 2 = 1 250
TeamB = (1 500 + 1 500) / 2 = 1 500
ExpectedA = 1 / (1 + 10^(250/400)) ≈ 0,191682
ExpectedB ≈ 0,808318

Antonin perd : 32 × 0,95 × (0 − 0,191682) ≈ −5,827 → −6 Elo
Antonin gagne : 32 × 0,95 × (1 − 0,191682) ≈ +24,573 → +25 Elo
```

Son équipe est outsider à cause de la cote du bot ; il perd peu si elle perd et gagne beaucoup si elle réussit l'exploit. Le coefficient 0,95 réduit seulement l'amplitude. Les deltas de Ben et Koyora se calculent chacun avec **leur propre K snapshot** et `ExpectedB`.

**Forfeit à deux humains perdants.** Si leurs deltas normaux sont −16 et −16, le partenaire perd `−16 + 8 = −8`, l'auteur `−16 − 8 = −24` ; total `−32` inchangé. Si le partenaire est bot, l'humain conserve son seul delta normal.

## Application, invariants et version

Le delta est calculé exclusivement depuis les entrées du départ. La fin autoritaire crée d'abord un `rating_match pending` avec l'archive ; le calcul intervient dans une transaction ultérieure `pending → applied`. À cette application, `rating_after_apply = rating_before_apply + delta`, où `rating_before_apply` est le **courant** au moment du verrouillage. Exemple : snapshot 1 200, courant 1 215 après une autre partie, delta +12 ⇒ 1 227. Incrémenter `rated_games` même si delta arrondi à zéro ; `peak_rating = max(ancien pic, nouveau rating)`. Une erreur laisse le match `pending` pour retry et ne rouvre pas la partie.

Les anciens matches conservent `formula_version = 1` et leurs cotes bot/coefficients/K snapshots. Modifier coefficients, calibrage ou seuils K demandera une nouvelle version explicite pour les nouveaux matches ; jamais de recalcul silencieux de l'historique. Les seuils de **rang** sont indépendants de cette formule.
