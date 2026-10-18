# Solo natif — captures du code réel

Vrais composants React Native de `src/app/(connected)/solo.tsx`, affichés dans
Chromium via React Native Web. Session, sauvegarde et réponses HTTP sont des
fixtures de test ; aucun compte, jeton ou jeu de production n’est utilisé.
Ces captures ne constituent pas une validation matérielle iPhone.

## Accès et enchères

![Accueil Solo](solo-lobby-844.png)
![Enchères](solo-bidding-844.png)

## Main et pli public

![Table 844](solo-trick-844.png)
![Table compacte 568](solo-trick-568.png)
![Grand texte compact](solo-large-text-568.png)

## Résultat et erreur

![Résultat de partie](solo-result-844.png)
![Reprise sans réseau](solo-offline-844.png)

Reproduction : `npm run test:geometry`. Le banc Vite utilise des réponses fixtures
uniquement dans `tests/visual/solo-environment.ts`, via un alias de test absent de
Metro. Scénarios : `?screen=solo&solo=empty`, `bidding`, `playing`, `trick`,
`finished`, `game-over`, `offline`, `loading` ou `action-error`. « Reprendre »
reste nécessaire pour afficher une partie sauvegardée et déclencher le jeu.

Architecture, fonctionnalités et limites : [SOLO.md](../../SOLO.md).
