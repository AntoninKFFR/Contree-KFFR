# Findings QA — Phase 9

## Validation insuffisante des GameState authoritative stockés

- Gravité : haute. Une ligne de partie corrompue ou forgée pouvait franchir la frontière de chargement serveur avec un deck dupliqué, une carte de pli mal formée, un score négatif/non fini, un tour incohérent, un mode désactivé ou un kind/status de contrat inconnu.
- Reproduction : cloner un `GameState` valide, modifier un des champs ci-dessus, puis appeler `parseServerGameState`. Avant la correction, le parser renvoyait l'état pour chacun des cas ciblés.
- Fix : validation structurelle des plis et contrats, scores entiers finis non négatifs, unicité/exhaustivité des 32 cartes, taille de pli selon les joueurs actifs, compatibilité du contrat avec le Ruleset figé et cohérence du prochain joueur. La normalisation des états legacy sans snapshot est conservée.
- Tests ajoutés : `tests/gameStateValidation.test.ts`. Les tests ont été exécutés en rouge avant la correction, puis avec les suites `rulesets`, `generaleMultiplayer` et `multiplayerServer` en vert.

Aucun changement de stratégie n'a été apporté à Human Doctrine V3.1 ou Monte Carlo V1.

## Focus perdu à la fermeture des confirmations d'enchère

- Gravité : moyenne (accessibilité clavier). Après ouverture d'une confirmation Coinche, Surcoinche, Capot ou Générale, `Escape`/Annuler supprimait le popover mais envoyait le focus sur la racine du document.
- Reproduction : au clavier, activer Capot, puis fermer avec `Escape` ; avant correction, le bouton Capot ne récupérait pas le focus.
- Fix : mémorisation du bouton déclencheur et restitution différée du focus s'il est encore connecté et activé. Le même chemin de fermeture est utilisé par `Escape`, Annuler et Confirmer.
- Test ajouté : `settingsPolish.test.ts` vérifie la restitution et évite de cibler un contrôle devenu désactivé. Le comportement a aussi été vérifié dans le navigateur sur le build de production local.

## Redaction incomplète des erreurs serveur

- Gravité : haute pour l'observabilité. Le filtre de logs multijoueur masquait déjà les headers d'autorisation, API keys et états privés, mais pas les libellés explicites `password`, `access_token`, `service_role_key` ni un JWT nu.
- Reproduction : passer un message d'erreur contenant l'un de ces libellés au sanitizer utilisé par `apiFailure` ; avant correction, le texte pouvait être envoyé tel quel à `console.error`.
- Fix : sanitizer exporté et centralisé couvrant passwords, access tokens, service keys, JWT, mains et états privés, tout en conservant les messages non sensibles tronqués à 2 000 caractères.
- Tests ajoutés : `tests/apiErrorSanitization.test.ts`, exécutés en rouge puis en vert. Les valeurs de test sont des placeholders, jamais des credentials.
