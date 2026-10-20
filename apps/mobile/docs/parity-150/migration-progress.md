# Suivi de livraison — fidélité Solo #150

La correction reste dans `feat/148-ios-solo-foundation`, PR #150 DRAFT, sur #147.
Aucune nouvelle PR, fusion, WebView, refonte Accueil/Profil/Auth, migration,
modification Supabase ou publication de production.

## Réalisé

- Audit profond des sources web, CSS paysage, règles, préférences et sauvegarde : [matrice initiale](AUDIT.md).
- Références web réelles avant comparaison native, quatre états × trois tailles.
- Modèle public riche validé, sélecteurs purs partagés, transitions/bots exclus du bundle natif.
- Scène immersive, cartes/main/places/HUD, enchères avancées, confirmations et légalité.
- Plis, collecte, délais bots, dernier pli, résultat, préférences/règles/audio et Reduce Motion.
- Audit des comptes/sauvegardes/progression et [proposition interappareil non appliquée](CONTINUITY.md).
- Douze paires de captures régénérées et trois planches inspectées : [bilan final de parité et écarts](PARITY.md).

## Vérifications locales — 20 octobre 2026

| Contrôle | Résultat |
| --- | --- |
| Typecheck et lint racine | Réussis |
| Vitest racine, moteur/actions inclus | 193 fichiers, 1 957 tests réussis |
| Parité/transport natif ciblés après renforcement du refus illégal | 8 tests réussis ; moteur et bots réels en mémoire |
| Build Next de production | Réussi |
| Smoke navigateur sur build de production | 89 tests réussis |
| Captures du vrai Solo web | 12 tests réussis |
| Typecheck et lint Expo | Réussis |
| Unités mobile | 25 tests réussis |
| Navigation native / vrais écrans et hooks | 18 tests réussis |
| Géométrie et interactions RN Web | 94 tests réussis, aucun retry ; dont 12 comparaisons à 1 px et 11 cas avancés |
| Configuration iOS | Vérifiée : deux paysages, iPhone, scene lifecycle, aucune permission micro/audio en arrière-plan |
| Compatibilité des paquets SDK 57 | `expo install --check` réussi |
| Expo Doctor | 21/21 réussis |
| Export iOS Metro avec source map | Réussi |
| Audit de la vraie source map | 1 747 sources ; aucune transition, bot, serveur, UI DOM ou fixture |
| Diff whitespace | `git diff --check` réussi |

Le banc RN Web groupe les modules Vite pour éviter l'épuisement des sockets
Windows observé avec le serveur de développement. Il initialise le véritable
polyfill Expo avant l'application ; aucune animation ni composant visuel réel
n'est remplacé dans ces captures. Les tests JSI/SwiftUI isolés de Jest restent
simulés, tandis que les captures utilisent leurs véritables implémentations web.

## Livraison et CI

Les workflows conservés vérifient les tests web, smoke, mobile Chromium/WebKit,
viewport/safe areas, le projet iOS généré et les contrôles Expo. Le workflow
Expo ajoute la comparaison web/natif dans un job dédié et publie les preuves en
artifacts. Aucun contrôle existant n'est supprimé.

Le statut courant et le SHA testé sont consultables dans les
[Checks de la PR #150](https://github.com/AntoninKFFR/Contree-KFFR/pull/150/checks).
Le rapport de livraison indique les runs et leur SHA effectivement vérifiés ;
ce document ne fige pas un statut CI avant sa fin.

L'essai matériel de cette nouvelle table reste à faire : les captures RN Web et
l'export Metro ne prouvent pas les gestes, le clavier, VoiceOver, l'audio ou la
fluidité sur l'iPhone 15. Les différences restantes figurent dans PARITY.md.
