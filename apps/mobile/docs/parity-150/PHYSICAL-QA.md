# Retour iPhone et réactivité

20 octobre 2026, iPhone 15 / iOS 27.0.1 / Expo Go SDK 57.

Après le QR de la nouvelle table, le propriétaire répond « yes c est top tout
marche bien » à la vérification des quatre joueurs, main en bas, cartes centrales,
enchères, pose directe, dernier pli et reprise après retour Accueil.
Il signale deux réserves : délai entre toucher une carte et sa pose/animation,
et chargement tardif du tapis et du logo Accueil. Ce retour ne valide pas
séparément VoiceOver, clavier des règles, audio ou Reduce Motion.

## Constats de code et correction

- La vraie pose attend la réponse HTTPS du serveur KFFR. Cette requête part
  directement vers l'API, sans passer par le tunnel Metro. Le client conserve
  l'autorité serveur : aucune carte retirée de la main ou ajoutée au pli avant
  validation. La part exacte de latence réseau et d'Expo Go n'a pas été mesurée
  sur le matériel ; aucune cause unique ni gain en millisecondes n'est affirmé.
- La carte touchée est désormais relevée et marquée « envoi en cours » dès le
  début de la requête, sans attendre celle-ci. Un échec restaure la présentation,
  sans double envoi ni faux pli. Deux tests avec réponse retardée vérifient succès
  et refus avant/après la validation serveur.
- Le tapis original pèse 3 019 270 octets, le logo 123 917 octets. En développement,
  ces assets sont servis via le tunnel au premier chargement. Les pixels et
  fichiers d'origine sont conservés. `expo-image` SDK 57 remplace seulement leur
  chargeur : cache mémoire/disque, logo prioritaire et préchargement en tâche de
  fond (logo/Accueil avant le grand tapis Solo). La navigation n'attend pas ce
  téléchargement. Un premier chargement à cache froid peut encore prendre du temps.
- Une espace JSX brute dans le menu causait réellement sur iOS « Text strings
  must be rendered within a <Text> ». Elle est supprimée ; le test de navigation
  vérifie l'absence de texte brut dans les enfants des feuilles natives.
- Des durées HTTP `[Solo HTTP] … ms` sont disponibles uniquement en développement.
  Elles ne journalisent ni URL, jeton, identité, carte, payload ou identifiant de
  partie ; elles permettront de distinguer l'attente réseau du ressenti visuel.

Les géométries, couleurs, logo et feutrines validés restent les mêmes. Les
corrections de chargement ne refont ni Accueil ni Profil, et ne touchent pas Auth.
Le correctif de réactivité/cache reste à réessayer physiquement avec le même QR.
La CI et RN Web ne prouvent pas une amélioration de fluidité mesurée sur iPhone.
