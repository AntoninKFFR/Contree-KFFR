# Multijoueur natif iPhone — issue #151 / PR #152

[Issue](https://github.com/AntoninKFFR/Contree-KFFR/issues/151) · [PR DRAFT](https://github.com/AntoninKFFR/Contree-KFFR/pull/152) · branche `feat/151-ios-multiplayer`, issue de `main` `0314cfb`.

Le bouton Multijoueur ouvre une interface React Native connectée aux mêmes API et au même projet Supabase que le web. Aucun nouveau moteur, backend ou schéma. Aucune migration, RLS, Auth, donnée de production, fusion ou commande de déploiement n’a été appliquée. Aucune dépendance ajoutée.

## Fonctionnement livré

- Création volontaire, règles KFFR/personnalisées via l’éditeur natif du Solo, saisie du code d’une table créée sur n’importe quelle plateforme, erreurs serveur explicites.
- Lobby à quatre places, réservation/changement de place atomique par les API existantes, prêt/pas prêt, noms, présence, hôte, objectif et règles. Les places libres deviennent des bots officiels lors du démarrage serveur.
- Table **partagée avec le Solo #150** : feutrine, cartes, éventail, enchères, annonces, HUD, plis, collecte, dernier pli, aides, paramètres, sons et musique. Projection autour de `viewerPlayerId`, sans renuméroter les identités serveur ; nous/eux suivent l’équipe du viewer.
- Enchères structurées : couleurs, SA/TA suivant les règles, Capot, Générale, Coinche, Surcoinche, passer et confirmations existantes. La légalité côté client aide l’affichage ; le serveur tranche.
- Pose provisoire immédiate depuis la main, sans spinner ni résultat inventé. Une intention par appui accepté, verrou contre les doubles appuis ; `expectedVersion`, réponse validée, retour sûr et GET après refus, 409 ou réseau ambigu. Aucun rejeu automatique de POST, y compris pour créer une table.
- Realtime `rooms`/`room_players` avec le client Supabase déjà authentifié ; les messages invalident la vue et déclenchent un GET, sans afficher les lignes DB. Débounce 50 ms, GET de secours toutes les 4 s, heartbeat 15 s, tick selon délais partagés. Une seule boucle de maintenance par table au premier plan.
- Arrêt des subscriptions/timers sur blur, arrière-plan, changement d’identité/jeton ou sortie. Retour à la même table sélectionnée après vérification du compte, GET autoritaire, protection des réponses tardives. Un GET parti avant un POST ambigu ne peut pas servir de réconciliation.
- Invitations reçues/résolution/refus, accès au salon, acceptation seulement après avoir réservé une place ; amis invitables et envoi via le système social existant. Invitations expirées, conflits et erreurs restent des décisions serveur.
- Transfert/récupération de l’hôte, remplacement temporaire d’un absent par bot, retour du joueur via heartbeat, forfait avec confirmation, manche suivante et revanche serveur vers lobby.
- Résultat final, historique public des manches/détails, lecture de l’Elo existant avec attente bornée si calcul en cours, et du total XP/niveau depuis `get_my_progression`. Aucun calcul d’attribution Elo/XP natif.

## Reprise : capacité exacte

L’app conserve **un UUID de dernière table par compte sur cet appareil**, sans token ni main dans cette clé. L’écran indique « Rouvrir la dernière table de cet appareil ». Aucune API existante ne liste les salons accessibles sur tous les appareils. Un code ou une invitation permet l’accès interappareil ; aucune fausse liste n’est affichée.

Une réponse perdue à la création peut laisser une table créée côté serveur sans UUID reçu : le backend multijoueur n’a pas de nonce de création équivalent au Solo. L’app ne rejoue pas cette création. Ajouter un inventaire/nonce nécessiterait un contrat backend séparé, documenté ici, non implémenté ni déployé.

## Expo Go

1. Dans ce worktree, `cd apps/mobile`, puis `npm ci`.
2. Utiliser les **mêmes valeurs publiques Supabase** que dans la configuration mobile existante : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Ne jamais mettre de clé serveur dans l’app. L’origine API vérifiée et commune au Solo est `https://contree-kffr.vercel.app` ; elle est fixe pour empêcher l’envoi de Bearer vers une URL fournie par un salon.
3. `npm run start` (LAN) ou `npm run tunnel` ; scanner avec Expo Go **SDK 57**. Aucun dev build n’est requis pour les ajouts de cette PR.
4. Se connecter avec le compte KFFR, passer en paysage, ouvrir Multijoueur. Créer une table et transmettre son code, ou saisir le code d’une table créée sur PC.
5. Prendre des places différentes, se déclarer prêts et lancer depuis l’hôte. Suivre la [checklist physique](PHYSICAL-QA.md).

Le backend de production existant suffit au code proposé : aucun déploiement backend n’est nécessaire. Les tests automatisés utilisent exclusivement des fixtures en mémoire et des endpoints/websockets interceptés, jamais de vrais comptes ou salons de production.

## Preuves et limites

- [Audit d’architecture](AUDIT.md), [matrice de parité et écarts](PARITY.md), [tests et validation](VALIDATION.md).
- [Comparaison interactive locale](comparison.html) : vrais composants web et React Native Web sur les mêmes projections publiques vérifiées par SHA-256 ; 69 paires. Les captures **ne sont pas des captures iOS matérielles**.
- [Planche 568](captures/comparison-568.png), [844](captures/comparison-844.png), [932](captures/comparison-932.png).
- La QA physique iPhone + PC, la latence réseau et la fluidité matérielle restent à réaliser. Une réussite automatisée ne les remplace pas.
