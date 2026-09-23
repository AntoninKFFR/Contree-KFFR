---
name: "Tâche (agent-ready)"
about: "Une tâche livrable en une PR, rédigée comme un brief exploitable par un agent de code"
title: "[Module X] "
labels: []
---

<!--
Rappel de gouvernance (voir CONTRIBUTING.md) :
- Une tâche = un incrément livrable en UNE PR.
- L'humain déclenche le travail ; un agent ne code que sur go explicite et ne merge jamais.
- Livraison via branche + PR, revue humaine + preview avant merge.
Pense aux labels : type (feat/fix/chore/docs), module:<nom>, priorité (p1/p2/p3),
et good-for-agent OU needs-human.
-->

## Objectif
<!-- En 1-2 phrases : quel résultat, pour qui, pourquoi. -->

## Livrable
<!-- Ce qui doit exister à la fin (routes, fichiers, composants, migration...). -->

## Critères d'acceptation (garde de validation)
<!-- Conditions vérifiables pour merger. Inclure les tests attendus. -->
- [ ] 

## ⚠️ Décision à trancher ?
<!-- OBLIGATOIRE : indiquer si un choix humain est nécessaire.
     - Si NON : écrire "Aucune — exécutable directement" et mettre le label good-for-agent.
     - Si OUI : décrire la décision, mettre le label needs-human, ne pas coder avant tranchage. -->
Aucune — exécutable directement.

## Références
<!-- Fichiers/dossiers concernés, section(s) du PRD, issues liées. Le code fait foi. -->

## Dépendances
<!-- "Dépend de : #NN" / "Précède : #NN", ou "Aucune". -->
Aucune.
