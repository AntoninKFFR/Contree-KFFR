# Validation iPhone — PR 154 (issue 153)

La PR reste DRAFT jusqu’à cette validation physique. Les captures du dossier sont rendues par les composants React Native Web ; aucun iPhone physique n’a été piloté pendant le développement. L’export iOS et les tests React Native ne remplacent pas ce contrôle.

## Ouvrir la branche dans Expo Go

Worktree : C:\Users\Antonin\.codex\worktrees\ios-training\Contree-KFFR, branche feat/153-ios-training. Depuis apps/mobile : npm run tunnel. Le serveur doit afficher « Using Expo Go », SDK 57 et ce chemin. Un serveur Metro provenant d’une autre branche ne suffit pas.

EXPO-GO.json contient l’URL et l’heure de la dernière vérification. Scanne expo-go-qr.png avec l’appareil photo de l’iPhone puis ouvre dans Expo Go compatible SDK 57. Le tunnel exige que ce PC reste allumé et que Metro reste ouvert ; l’URL doit être revérifiée après un redémarrage. Une URL de développement n’est pas un déploiement.

Connecte ton compte existant puis passe en paysage. Les records vérifiés se lisent sur le compte ; les déblocages locaux du navigateur ne sont pas importés sur le téléphone. Les clés locales sont isolées par identité.

## Parcours à valider

| Parcours | Résultat attendu |
| --- | --- |
| Accueil → Entraînement → retour | Catalogue complet ; aucune barre inférieure ; Solo et Multijoueur restent accessibles. |
| Catalogue / petit et grand iPhone | Défilement, encoche, Safe Areas, textes et cibles tactiles sans chevauchement. Tester aussi texte iOS agrandi, VoiceOver et Réduire les animations. |
| Valeur d’un pli | Clavier, effacement, aide, dix corrections, résultat ; 8/10 débloque le niveau suivant ; relance de l’app conserve le résultat local. |
| Survie / Blitz après déblocage | Vies / bonus / pénalités, expiration, retour d’arrière-plan sans gain artificiel de temps, double tap sans double validation. |
| Tas | Débutant / Normal verrouillé puis débloqué, Libre avec vitesse conservée, Manuel ; belote et dix de der ; pause des cartes en arrière-plan. |
| Mémoire | Les quatre axes et tous niveaux débloqués ; observation puis réponse ; sélection/désélection et attribution aux joueurs ; corrections avec cartes natives. |
| Jeu des autres | Grille tactile joueur/couleur et nombre d’atouts au niveau 3 ; correction et progression. |
| Annonces / lecture | Quatre niveaux chacun, décisions légales, cases indépendantes, doctrine et main d’illustration ; conventions lisibles et retour. |
| En partie | Configurer axes et budget, lancer une vraie partie Solo, répondre après un pli, constater la pause des bots, lire la correction, reprendre et consulter le bilan. |
| Records | Distinguer local et compte ; réseau coupé → résultat local conservé ; session expirée → message ; absence d’amis et classement du compte réel. |
| Changement de compte | Aucune main, réponse privée, progression ou session Duo du précédent compte visible. |
| Duo iPhone hôte ↔ PC invité | Code, deux comptes réels, prêts, dix questions, réponses différentes, correction seulement après les deux réponses, résultat. |
| Duo PC hôte ↔ iPhone invité | Même parcours, invitation existante si ami disponible, reprise après arrière-plan / réseau coupé / fermeture. |
| Duo iPhone ↔ iPhone | Même parcours sur deux appareils et deux comptes, réponses privées avant révélation, fin et nouvelle session. |
| Non-régression | Une manche Solo et une partie Multijoueur, annonces, dernier pli, scores, arrière-plan/reprise et déconnexion. |

Consigner modèle, version iOS, version Expo Go, commit, orientation, résultat et capture d’un défaut éventuel. Ne pas fusionner la PR avant accord du propriétaire.

## Limites connues

Le backend de séries ne possède pas de clé d’idempotence globale. Le journal natif évite un renvoi après résultat réseau ambigu ; il cherche une confirmation dans l’historique autorisé. Un message d’incertitude peut donc persister au lieu de créer une deuxième série. Aucune migration n’a été ajoutée. Les invitations utilisent les mécanismes existants, sans notifications push inventées.

Le simulateur EAS n’a pas été lancé : le projet n’est pas lié à un projet EAS. Aucun lien EAS, build signé ou dépense n’a été créé.
