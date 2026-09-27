# Lecture des enchères : promesses publiques v1

Référence : Advanced Rules V4.1 (`advanced_rules_v4`, révision `4.1`) ; axe `bid-reading`, `axisVersion = 1`.

## Règle de lecture

Une promesse est l'intersection des propriétés de toutes les voies V4.1 qui peuvent produire l'action dans le contexte public. Une *lecture possible* nomme une voie, sans affirmer qu'elle a été effectivement empruntée. Le contexte de l'interpréteur contient l'ordre et l'historique des annonces, les sièges, le score et le ruleset publics. Il ne contient aucune main. La trace V4.1 d'une main explique une décision particulière ; elle ne prouve donc pas une propriété commune à toutes les mains donnant la même annonce. La main conservée par le générateur est révélée seulement après réponse et ne sert pas à calculer la promesse.

Les propriétés de cartes ci-dessous concernent la couleur annoncée, ou la couleur du contrat public pour une Coinche. Les annonces antérieures d'une autre couleur ne sont pas transposées à celle-ci.

| Séquence publique | Garanti par la lecture v1 | Possible, mais non garanti |
| --- | --- | --- |
| Ouverture 80 couleur | La couleur annoncée. | Sonde d'une majeure, longueur faible plafonnée à 80, ouverture autonome. Ni Valet, ni 9, ni quatre atouts ne sont certains. |
| Ouverture 90 ou 100 couleur | La couleur et au moins une majeure d'atout. | La majeure exacte, les deux majeures et la longueur exacte. |
| Ouverture 110 couleur | Valet et 9, au moins quatre atouts et un As extérieur. | Cinq atouts et un As extérieur **ou** quatre atouts et deux As extérieurs ; aucun de ces comptes plus précis n'est commun. |
| Partenaire 80 couleur → soutien 90 même couleur | Soutien de la couleur et au moins une majeure utile. | Valet ou 9 précis : le 80 du partenaire ne révèle pas la carte qu'il possède. |
| Soutien fort de la couleur partenaire | Soutien fort, au moins une majeure et un fit d'au moins deux cartes. | Valet et 9 ensemble : une seule majeure avec longueur et contrôles peut suffire. |
| Soutien compétitif dans la couleur partenaire après une surenchère adverse | La couleur du partenaire reste soutenue, même si l'adversaire a temporairement pris le contrat. | Les garanties supplémentaires dépendent de l'intersection de toutes les formes de fit compatibles : aucune majeure précise, majeure quelconque, longueur ou fit fort ne sont déduits de cette seule séquence. |
| Changement exceptionnel de la couleur partenaire | Nouvelle couleur, Valet et 9, au moins trois cartes et un As extérieur ; couleur exceptionnellement autonome. | Longueur et As exacts. |
| Première surenchère compétitive | Couleur annoncée et palier légal ; une majeure seulement dans les contextes où aucun message partenaire ne fournit le palier. | Structure exacte de la main. |
| Coinche couleur sur 120/130 | Contrôle défensif classique, Valet et 9 d'atout, pour la voie couleur disponible sous 140. | Nombre de plis défensifs exact. |
| Coinche couleur sur 140/150/160 | Contrôle défensif suffisant selon V4.1. | Voie classique, contrôles extérieurs, verrou d'atout ou combinaison ; Valet et 9 ne sont pas garantis. |
| Surcoinche | Marge exceptionnelle de la doctrine ; les messages antérieurs de la même couleur restent valides. | Aucune carte précise déduite de la Surcoinche seule. |
| Capot | Niveau de contrôle suffisant pour demander Capot. | Contrôle entièrement personnel ou complété par une annonce partenaire compatible ; aucun jeu exact révélé. |
| 80 initial → soutien partenaire → rebid | Le message ultérieur s'ajoute aux garanties antérieures compatibles avec la même couleur. | La trace d'une main précise n'est pas une promesse supplémentaire. |

Deux mains V4.1 de référence produisent le même 80 cœur : l'une avec le 9 et une sonde, l'autre avec quatre cœurs sans Valet ni 9. Elles interdisent de promettre une majeure précise ou quatre atouts. Deux mains de première annonce à 110 illustrent séparément les branches `5+ atouts / 1 As extérieur` et `4+ atouts / 2 As extérieurs`. Une Coinche haute par contrôles extérieurs ou verrou d'atout contredit la lecture « forcément Valet et 9 ». Les tests `advancedRulesBidReading.test.ts` reconstruisent des décisions V4.1, vérifient les promesses et ces contre-exemples.

Pour `90♥` du partenaire, `100♦` adverse, puis `110♥` de la cible, trois mains V4.1 donnent la même action : l'une avec le 9 seul en cœur, une avec le Valet seul et une avec deux cœurs produisant un `strong-fit`. Les deux premières suivent `missing-major-fit` et n'ont qu'un cœur : ni la majeure exacte, ni `strong-fit`, ni deux atouts ne sont une promesse de ce soutien compétitif. Une main sans Valet ni 9 testée sur cette séquence passe au lieu de surenchérir ; cela ne suffit pas à prouver que toutes les formes de fit compatibles possèdent une majeure, donc la lecture publique v1 reste prudente.

Les seuils internes de choix, les estimations de plis et les scores de main ne sont pas affichés comme promesses. Une évolution de la doctrine inverse impose une nouvelle version d'axe. La progression de cet axe reste locale : la table serveur des records n'est pas encore clé par `axisVersion`.
