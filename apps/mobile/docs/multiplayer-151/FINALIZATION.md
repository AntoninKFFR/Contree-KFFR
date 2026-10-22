# Revanche et dernier pli — PR #152

Branche `feat/151-ios-multiplayer`, base vérifiée
`6edc683ed3babedc1cc8cfb267819d29ca89c46f`. La PR reste DRAFT.
Le SHA final et tous les contrôles de ce SHA sont consignés dans la description
de la PR, après leur achèvement. [Liste exhaustive des fichiers](FINALIZATION-FILES.txt).

## A. Rejouer avec les humains, sans les anciens bots

Avant, `prepareRematchPlayers` conservait chaque bot et le remettait prêt. Elle
utilise maintenant `resetRoomPlayers` : les humains conservent identité, pseudo,
place et présence, deviennent non prêts et quittent le contrôle temporaire par
bot. Les autres places deviennent vides : identité, profil bot, pseudo, présence,
dates d'arrivée/de départ et dernière présence effacés, tous les indicateurs à
faux. Les identifiants de siège et leur appartenance au salon restent stables.

La RPC existante `public.rematch_room(p_room_id, p_expected_version, p_players)`
écrit cette projection dans sa transaction. Elle exige la partie archivée, remet
le même salon au lobby, efface son état de jeu actif et son ancien `gameId`, et
ne touche ni au code, ni aux règles, ni aux paramètres, ni à l'hôte, ni aux archives.
Sa définition a été lue et son comportement testé sur PostgreSQL local : **aucune
migration nécessaire ou ajoutée**.

Les humains peuvent changer de place, laisser entrer un autre compte avec le
code et accéder aux invitations lorsqu'une place est libre. Le lancement attend
leur nouvelle validation « Prêt », puis le serveur existant remplit seulement
les places encore libres avec le profil bot officiel et génère un nouveau UUID
de partie. Le calcul des équipes continue de suivre les nouvelles places.

Les tests couvrent 1/2/3/4 humains, les anciennes places de bots, un humain absent
et temporairement remplacé, le retour de présence de l'hôte, le déplacement, une
nouvelle entrée, les prêts et le lancement suivant. Les lignes de l'archive, de
ses joueurs, de son résultat Elo et de ses événements XP sont comparées avant
et après la revanche et le nouveau lancement.

## B. Présenter le dernier pli avant le résultat

La file de présentation existait déjà, mais les intégrations la court-circuitaient :

- Le natif montait `RoundCompletion` dès `finished` ou `game-over`, et masquait
  également l'accessibilité et les appuis de la scène, y compris le ramassage manuel.
- Le web Solo superposait immédiatement `RoundCompletionCard`.
- Le web Multi remplaçait la table par `FinishedRoomCard` dès la fin de partie.
- L'habillage web pouvait également changer de hauteur avant la fin du pli.

Le résultat est désormais une sortie de la **même file de présentation**. Le web
garde `GameTable` monté et l'habillage de jeu jusqu'à ce que cette file libère le
résultat. Le natif attend `presentation.resultReady`, conserve la scène et son
bouton de ramassage accessibles, puis ouvre le résultat et ses lectures Elo/XP.
Les données Elo/XP peuvent déjà être chargées ; leur calcul serveur n'attend pas
la présentation.

Les quatre cartes sont les cartes confirmées de `completedTricks`. Leurs clés
restent stables entre le pli en cours et le pli terminé : aucune ancienne carte
n'est remontée ou rejouée. En cas de rattrapage terminal, seul le dernier pli
autoritaire est conservé, sans faire patienter sur une succession de plis anciens.
Les versions et lectures de présence répétées ne redémarrent pas son délai.

| Réglage | Présentation finale |
| --- | --- |
| Lent | Durée existante : Multi 1 500 ms, Solo 1 800 ms |
| Normal | 1 200 ms |
| Rapide | 650 ms |
| Instantané / durée 0 | Une image peinte des quatre cartes, puis résultat ; pas d'animation de collecte à durée zéro qui les rendrait invisibles |
| Durée personnalisée | Durée choisie, sans addition d'un second délai de résultat |
| Ramassage automatique désactivé | Quatre cartes conservées et bouton « Ramasser le pli » avec gagnant/points ; l'appui ouvre ensuite le résultat, sans POST |
| Animations désactivées / Reduce Motion | Cartes statiques lisibles pendant la durée choisie, sans mouvement imposé |

`scheduleTrickCollection` utilise le délai existant ; le seul cas sans délai
attend deux callbacks d'image afin de laisser réellement peindre une image.
Le résultat et ses boutons de suite/revanche restent absents pendant la présentation.
Aucun GameState, score, main, RPC, règle de jeu ou rythme serveur n'est modifié.
Aucune carte n'est envoyée une seconde fois.

Un forfait et l'ouverture directe d'une partie déjà terminée affichent le résultat
immédiatement. Un autre salon, compte, identifiant de partie ou numéro de manche
supprime l'ancienne file. Le passage en arrière-plan annule la présentation ; le
retour prend l'état courant, sans animation historique. Une nouvelle manche
officielle prévaut immédiatement sur une ancienne présentation. Les tests
vérifient aussi qu'un nouveau pli après retour au premier plan n'est pas perdu.
Les timers et callbacks d'image sont annulés au changement ou au démontage.
Un garde protège également les callbacks déjà mis en file lorsque l'annulation
de la plateforme arrive trop tard. Les animations de résultat respectent aussi
la désactivation des animations de pli et Reduce Motion.

## Preuves avant/après et captures

Les tests de revanche sur la base initiale échouaient pour les compositions avec
bots. La reproduction du rendu natif charge les **six vrais modules natifs du
commit `6edc683`** via le harnais Vite de test, sans modifier le serveur Expo :
deux tests Solo/Multi échouent car le résultat est déjà monté à la quatrième carte.
Leurs captures montrent le pli recouvert. La version corrigée passe les mêmes
scénarios. Ce sont des captures RN Web, **pas des captures physiques iPhone**.

Les planches comparatives présentent les vrais composants web et RN Web sur la
même projection publique générée par le moteur : troisième carte, arrivée de la
quatrième, pli complet, début du ramassage, résultat. Elles couvrent fin de manche
et fin de partie, Solo et Multi, aux trois tailles demandées. Les images de jeu
sont uniquement assemblées/redimensionnées ; leur UI n'est pas redessinée.

- [Solo 568](finalization/solo-568.png), [844](finalization/solo-844.png), [932](finalization/solo-932.png).
- [Multi 568](finalization/multiplayer-568.png), [844](finalization/multiplayer-844.png), [932](finalization/multiplayer-932.png).
- [Avant/après Solo](finalization/before-after-solo.png), [avant/après Multi](finalization/before-after-multiplayer.png).
- [Provenance, mesures et empreintes des sources](finalization/evidence.json).
- [Validations locales](finalization/validation.json), [échec de revanche avant correction](finalization/baseline-rematch.log), [échec de présentation avant correction](finalization/baseline-final-result.log).

Les captures contrôlent aussi la géométrie de la table avant/après la confirmation,
l'absence de résultat aux étapes de lecture/ramassage, puis sa présence, et une
seule mutation de carte. Les horloges contrôlées des tests de composants couvrent
durées standard/personnalisées, manuel, instantané, mouvement réduit, réponses
immédiates/tardives, bot/humain, versions répétées, forfait, nouveau contexte et
nettoyage. Les captures navigateur utilisent les vraies animations CSS/Reanimated.

## Audit des scores

Pour les mêmes `gameId`, les quatre projections publiques donnent les mêmes
`totalScore` et le même dernier `roundHistory.totalScoreAfterRound`, avec le bon
`room.status`. Le résultat web utilise ces valeurs par équipe ; le natif « Nous /
Eux » les ordonne selon `viewerSeatIndex % 2`, sans nouveau calcul. Les tests de
transport réel comparent également le total affichable aux scores de l'archive
PostgreSQL. Aucune divergence numérique n'a été reproduite.

Les images rapportant 620–1000 et 500–1060 ne sont pas accompagnées ici d'une paire
de `gameId` prouvant qu'elles montrent la même partie. Elles ne justifient donc
aucune modification du score. Les fonctions de score, Elo, XP et statistiques
restent intactes.

## Validation et reproduction

Les résultats finaux, commandes et contrôles au SHA poussé sont repris dans la PR.
Les validations locales comprennent :

- Racine : `npm ci`, `npm run typecheck`, `npm run lint`, `npm test -- --minWorkers=2 --maxWorkers=2`, `npm run build`.
- Mobile : `npm ci`, typecheck/lint, `npm test`, `npm run test:geometry`, `npm run native:check`, `npx expo install --check`, `npx expo-doctor`, `npm run export:ios -- --source-maps --max-workers 2`, `npm run bundle:check`.
- `npx playwright test --config playwright.multiplayer-parity.config.ts` : crossplay, revanche avec déplacement/invitation/nouveau départ, parité existante et douze nouvelles séquences web.
- `E2E_PRODUCTION_SERVER=1 npx playwright test --config playwright.solo-parity.config.ts` : Solo web et projections communes.
- `git diff --check`.

Les E2E **du vrai backend Next.js avec PostgreSQL/Auth/Realtime locaux** utilisent
`playwright.multiplayer-finalization.config.ts`. Uniquement avec une URL Supabase
loopback et les clés de cette base jetable en environnement, construire le web
avec ces valeurs, puis exécuter `node scripts/runMultiplayerFinalizationLocal.mjs`.
Le script crée quatre identités locales jetables et ne conserve leurs secrets
qu'en environnement du processus enfant. La trace navigateur est désactivée.
Il exécute six nouveaux tests réels et les deux parcours multijoueurs historiques.
Le mode local doit être explicite ; ces tests sont ignorés dans les autres
projets Playwright, sans jamais tenter une requête de production.

Le harnais natif peut recevoir une session JWT **locale** de test et intercepte
son origine API vers le Next.js local. Sa connexion Realtime utilise le vrai SDK
et la vraie base locale. Cette configuration est confinée aux tests : ni Metro,
ni la configuration Expo actuelle, ni l'origine API de l'application distribuée
ne sont changés. Les tests en mémoire restent une preuve complémentaire distincte.

## Déploiement et dernier essai physique

**La revanche corrigée nécessite le futur déploiement du serveur Next.js de la PR.**
Le tunnel Expo continue d'appeler le backend KFFR actuel : il ne prétend pas
supprimer ses bots avant ce déploiement. Aucun contournement natif, déploiement
de production, migration, `db push`, changement de RLS/Auth ou fusion n'a eu lieu.

La présentation native corrigée fonctionne avec les états du serveur actuel.
Recharger Expo Go sur le tunnel existant après vérification de sa disponibilité :
`exp://hkl3cpu-antoninkffr-8081.exp.direct`.

Le propriétaire a déjà rapporté une vraie partie iPhone terminée, avec résultats,
Elo, XP et retour au lobby. Cette observation précède ces deux correctifs.
Après rechargement du bundle corrigé, le propriétaire a confirmé sur son iPhone :
**« Oui, le dernier pli est visible »**. Les autres cas physiques restent distincts :

1. Dernière carte humaine/bot/PC reçue sur iPhone : quatre cartes lisibles puis résultat, bon gagnant et mêmes totaux.
2. Standard, rapide, instantané, durée personnalisée, manuel, animations désactivées et Reduce Motion.
3. Retour d'arrière-plan, reconnexion et nouvelle manche lancée ailleurs : état courant, aucune ancienne animation.
4. Après disponibilité d'un backend de test accessible portant le correctif A : Rejouer avec 1–4 humains, anciennes places de bots libres, changement de place, invitation, prêts, nouveau départ.

**Conserver la PR DRAFT et attendre ce dernier essai du propriétaire avant toute fusion.**
