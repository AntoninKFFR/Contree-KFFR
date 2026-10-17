# Sécurité du prototype iOS

État du 17 octobre 2026. Le socle SDK 57 peut être revu et testé avec Expo Go ;
la validation fonctionnelle sur iPhone ne vaut pas autorisation de distribution
publique. Aucune modification Supabase ou de production n'accompagne ce lot.

## Session et données

- AsyncStorage conserve les jetons de session **sans chiffrement**. Le mot de
  passe n'est pas persisté. Le masquage du profil ne protège pas le stockage
  contre l'accès au terminal, aux sauvegardes ou à un appareil compromis.
- Utiliser un compte de test sans privilèges. Avant distribution, concevoir et
  vérifier un stockage adapté, la suppression locale et la révocation de session.
- Seules l'URL HTTPS et la clé `sb_publishable_` du projet existant peuvent entrer
  dans les variables `EXPO_PUBLIC_`. Ces valeurs sont publiques dans le bundle.
  Aucune clé serveur, aucun `.env` ou jeton utilisateur ne doit être versionné.
- L'identité est vérifiée par Auth avant lecture du pseudo, puis les politiques
  RLS existantes contrôlent l'accès. Cette PR ne crée ni ne modifie ces politiques.
- La déconnexion concerne la session mobile. En cas d'erreur réseau, la révocation
  distante n'est pas confirmée ; un JWT déjà émis reste valable jusqu'à expiration.

## Dépendances verrouillées

`npm audit --json` sur le lockfile SDK 57 repris de la copie testée signale
**28 paquets** (10 modérés, 18 élevés, aucun critique), contre 40 dans le socle
SDK 54. Ces nombres incluent les dépendants : ce ne sont pas 28 avis distincts.
Quatre avis sont recensés dans ce graphe :

| Paquet concerné | Avis et risque | Correctif publié selon l'avis |
| --- | --- | --- |
| `braces` 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) : épuisement de pile avec un motif imbriqué malveillant | Aucun indiqué |
| `decode-uri-component` 0.2.2 | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) : consommation CPU sur des entrées encodées malformées | 0.5.0 |
| `node-forge` 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) : vérification RSA incorrecte | Aucun indiqué |
| `uuid` 7.0.3 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) : écriture incorrecte dans les buffers de certaines API UUID | 11.1.1, 12.0.1 ou 13.0.1 |

Les chaînes Expo/Metro/React Native expliquent une partie des signalements.
Le décodage d'URL via Expo Router nécessite aussi une revue côté application :
il ne faut pas classer toute cette dette comme limitée aux outils de développement.
Les tests actuels ne démontrent pas l'absence d'exploitation de ces avis.

L'audit npm ne propose pas de correction compatible avec toutes les contraintes
du graphe testé : ses recommandations changent les versions majeures d'Expo,
Router ou React Native, et certaines rétrogradent les dépendances. Les correctifs
publiés pour le décodeur et UUID dépassent les plages de leurs dépendants.
Une surcharge forcée de versions doit donc être étudiée et testée, plutôt que
présentée comme une correction déjà validée sur iPhone. Aucun `audit fix --force`
ou remplacement de SDK n'est appliqué pour obtenir artificiellement un audit vert.

Pour reproduire depuis `apps/mobile` :

```sh
npm ci
npm audit --json
npm explain braces
npm explain decode-uri-component
npm explain node-forge
npm explain uuid
```

Un audit non vierge retourne un code d'échec : le conserver dans le diagnostic.
La CI typecheck/lint/tests/Doctor/export vérifie le socle fonctionnel, pas la
résolution de cette dette. Avant distribution publique : réévaluer ces avis,
valider leurs correctifs avec un SDK compatible et refaire la QA iPhone, en plus
de la revue du stockage de session. La décision de fusion du prototype reste humaine.

## Périmètre web existant

La racine Next.js et son lockfile ne changent pas dans cette migration mobile.
Son installation `npm ci` signale séparément 25 paquets (2 faibles, 4 modérés,
16 élevés, 3 critiques). Cette dette web n'est pas corrigée par la migration
Expo ; les résultats web fonctionnels ne doivent pas être présentés comme une
validation de sécurité du site. Reproduire l'audit avec `npm audit --json` depuis
la racine et traiter cette dette dans un chantier dédié avant de conclure sur
la sécurité d'une distribution publique.
