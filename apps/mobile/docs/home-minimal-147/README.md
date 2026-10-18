# Accueil minimal — PR #147

Cette mise à jour de la [PR existante](https://github.com/AntoninKFFR/Contree-KFFR/pull/147)
simplifie uniquement l’accueil par rapport à la révision `8899b6e`.

- Logo KFFR existant déplacé dans la composition principale ; aucun changement du fichier image.
- Trois blocs avec uniquement **Solo**, **Multijoueur**, **Entraînement**.
- Suppression du bloc décoratif, des cartes, des titres, sous-titres et badges orange.
- Header sans titre ni logo, avec le lien discret **Profil** en haut à droite.
- Barre inférieure masquée sur l’accueil. Le navigateur et les routes protégées restent
  en place ; le profil garde exactement son rendu et ses moyens de retour existants.
- Modes toujours désactivés : l’indisponibilité est annoncée à VoiceOver, sans texte secondaire visible.

La marge basse est appliquée sur l’accueil et ses états d’attente/erreur, puisque la barre
ne la fournit plus. Aucun changement du contrôleur Auth, du stockage, de Supabase, de la
configuration paysage, du SDK 57, des dépendances ou du profil.

## Captures du code réel

React Native Web dans Chromium, session et pseudo de test. Ces captures ne sont pas
une validation matérielle iPhone. Insets simulés : 47 px de chaque côté, 21 px en bas.

844 × 390 :

![Accueil 844](home-844.png)

568 × 320 :

![Accueil 568](home-568.png)

[667 × 375](home-667.png) · [932 × 430](home-932.png) · [grand texte ×1,6](home-large-text-568.png)
· [Dynamic Island à gauche](home-island-59.png) · [Dynamic Island à droite](home-island-0.png).

La capture Profil 844 × 390 issue de cette exécution est **identique, octet pour octet**
à `docs/visual-146/after-profile-844.png` de `8899b6e` (comparaison SHA-256).
`profile.tsx`, `GameNavigation.tsx` et l’écran de connexion sont inchangés dans ce lot.

## Vérifications

`npm ci`, typecheck, lint, tests Node et navigation iOS, native:check,
`expo install --check`, Expo Doctor, export iOS, `git diff --check`.
`test:geometry` compte **41 tests** : les contrôles antérieurs sont conservés et
adaptés au nouveau contrat de navigation ; un cas couvre les safe areas des deux côtés,
la rotation et les états d’authentification de l’accueil sans barre.

Les tests vérifient explicitement l’absence de logo dans le header, sa présence dans
le contenu, l’absence de barre, les seuls textes visibles attendus, les trois modes
désactivés, l’aller-retour Profil et les invariants de session. Les assertions de contraste,
44 pt, absence de scroll/clipping et protection des données restent actives.
Les résultats CI sur le commit livré sont consignés dans la PR, qui reste en **draft**.

Sur iPhone : revoir les deux paysages, les grandes polices, l’accès Profil/retour et
la reprise de session. Le fallback de rotation Expo Go reste inchangé.
