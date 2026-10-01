# Collection profil V1 (#106) et découverte (#113)

La Collection contient uniquement 10 titres, 8 badges SVG et 6 cadres CSS. Aucun effet sur XP, Elo, scoring ou gameplay. Pas de dos de carte, tapis, avatar, boutique, monnaie ni claim. Chaque slot accepte un objet ou aucun objet ; le déblocage ne provoque jamais d’équipement automatique.

## Déploiement et catalogue

Appliquer `20261001020000_profile_cosmetics_v1.sql` **avant de merger/déployer le client**. Migration additive unique, indépendante des migrations 101–105, compatible avec le client précédent. Aucune application en production n’est effectuée par cette PR. Les tests CI utilisent uniquement un Supabase local jetable.

Version canonique : **1**, 24 identités stables. Noms, descriptions, ordre et niveaux proviennent de la DB ; le registre TS ne contient que les clés, slots et variantes autorisées. Les seuils V1 ne doivent pas être modifiés rétroactivement. Une future migration ajoute une version, de nouvelles clés et leur version d’introduction, sans renommer les identités ni supprimer l’historique.

| Clé stable | Slot | Nom | Niveau | Variante |
| --- | --- | --- | ---: | --- |
| `title_taker` | title | Preneur | 2 | `standard` |
| `title_steady_hand` | title | Main sûre | 4 | `standard` |
| `title_strategist` | title | Stratège | 6 | `standard` |
| `title_fearless` | title | Sans trembler | 9 | `standard` |
| `title_auction_master` | title | Maître des enchères | 12 | `standard` |
| `title_fine_blade` | title | Fine lame | 16 | `standard` |
| `title_contree_ace` | title | As de la Contrée | 20 | `standard` |
| `title_old_hand` | title | Vieux briscard | 25 | `standard` |
| `title_table_master` | title | Maître de la table | 32 | `standard` |
| `title_kffr_legend` | title | Légende KFFR | 40 | `standard` |
| `badge_club` | badge | Trèfle | 3 | `club` |
| `badge_diamond` | badge | Carreau | 5 | `diamond` |
| `badge_spade` | badge | Pique | 8 | `spade` |
| `badge_heart` | badge | Cœur | 11 | `heart` |
| `badge_crown` | badge | Couronne | 15 | `crown` |
| `badge_coinche` | badge | Coinche | 20 | `coinche` |
| `badge_surcoinche` | badge | Surcoinche | 28 | `surcoinche` |
| `badge_kffr` | badge | KFFR | 40 | `kffr` |
| `frame_gold_fine` | frame | Or fin | 5 | `gold_fine` |
| `frame_ivory` | frame | Ivoire | 10 | `ivory` |
| `frame_black_gold` | frame | Noir & Or | 15 | `black_gold` |
| `frame_contree` | frame | Contrée | 22 | `contree` |
| `frame_prestige` | frame | Prestige | 30 | `prestige` |
| `frame_kffr_signature` | frame | KFFR Signature | 40 | `kffr_signature` |

## Modèle et déblocage transactionnel

- `profile_cosmetic_catalog_versions` : version et date d’introduction.
- `profile_cosmetics` : clé globale, version d’introduction, slot, nom, description, variante, type de condition, niveau et ordre.
- `profile_cosmetic_unlocks` : PK `(user_id, cosmetic_key)`, première date, condition et solde XP au déblocage. Les retries conservent ces données.
- `profile_cosmetic_equipment` : PK `(user_id, slot)`, clé et date. FK `(cosmetic_key, slot)` vers le catalogue et FK `(user_id, cosmetic_key)` vers les unlocks : impossible d’équiper un objet non possédé ou du mauvais slot.

Seuil d’entrée au niveau `L` : `25 × (L - 1) × (L + 6) / 2`. `private.progression_total_xp_for_level(integer)` calcule en numeric avant conversion bigint ; refuse NULL, niveau < 1 et dépassement bigint. C’est l’inverse exact de la formule TS existante, sans modifier les gains XP.

Un trigger `AFTER INSERT OR UPDATE OF total_xp` sur `player_progression` appelle `private.sync_level_cosmetic_unlocks`. Tous les crédits centraux (partie Solo/Multi, permanent, weekly) sont couverts sans hook propre à chaque source. Seul un solde créé ou augmenté est synchronisé ; tous les paliers franchis sont insérés avec `ON CONFLICT DO NOTHING` dans **la même transaction** que les XP. Un rollback retire donc aussi les nouveaux unlocks. Les verrous XP existants et leur ordre UUID restent inchangés.

Le backfill ne lit que les soldes autoritaires `player_progression`, en ordre UUID ; il ne scanne aucune partie, mission ou série Training. Niveau 1 : 0 objets ; niveau 5 : 5 ; niveau 20 : 16 ; niveau 40 : 24. Aucun équipement ajouté. Un compte sans solde reste virtuellement niveau 1, sans inventaire ; lire sa collection ne crée aucune ligne.

## Sécurité et RPC

RLS sur les quatre tables. Catalogue/version lisibles par authenticated ; inventaire et équipement uniquement par leur propriétaire (`auth.uid()`). Toutes les écritures directes (y compris service_role) sont révoquées. Les helpers private sont interdits à anon/authenticated/service_role ; les fonctions definer ont un search_path vide et des références qualifiées.

`set_my_profile_cosmetic(p_slot, p_cosmetic_key)` utilise exclusivement l’utilisateur du JWT, sans paramètre utilisateur. EXECUTE réservé à authenticated. Slot connu obligatoire ; clé connue, du même slot et débloquée obligatoire. Une clé NULL retire ce slot. Un upsert remplace atomiquement l’objet précédent ; le même objet conserve sa date. Un verrou transactionnel par utilisateur sérialise les remplacements/retraits concurrents, sans écriture XP.

`get_my_profile_cosmetics()` est **legacy / deprecated** : elle reste strictement inchangée et retourne les 24 objets pour le client #112. TODO : retirer cette RPC dans une migration séparée uniquement après abandon vérifié de tous les anciens clients.

`get_my_unlocked_profile_cosmetics()` est désormais la lecture canonique owner-only, pure, sans argument. Elle joint uniquement les unlocks de `auth.uid()` au catalogue et retourne de 0 à 24 objets, tous `unlocked: true`. Les slots non-null correspondent obligatoirement à un item présent. Compte neuf : aucune progression, XP, unlock ou équipement créé. Exemples : niveaux 1/2/5/20/40 → 0/1/5/16/24 objets. JSON niveau 2 :

```json
{"catalogVersion":1,"equipped":{"title":null,"badge":null,"frame":null},"items":[{"key":"title_taker","slot":"title","name":"Preneur","description":null,"visualVariant":"standard","unlockType":"level","unlockLevel":2,"unlocked":true,"unlockedAt":"2026-10-01T00:00:00Z","equipped":false}]}
```

Le parseur TS vérifie version, taille maximale 24, unicité, clés connues, slots/variantes, niveaux entiers positifs, dates obligatoires, unlocked strictement vrai et cohérence equipped. Un slot équipé absent des items est une erreur, jamais une omission silencieuse. Aucune variante DB n’est interpolée dans une classe libre.

## Client et rendu

Le Provider partagé lit XP, gains récents, permanent, weekly et collection via `Promise.allSettled`. Une erreur cosmétique est isolée. Sign-out/changement de compte effacent les données et les réponses obsolètes sont ignorées. Les événements XP existants actualisent aussi les unlocks. Après succès RPC, `kffr:profile-cosmetics-changed` déclenche le refresh partagé débouncé, sans polling ni équipement optimiste.

Collection remplace le placeholder Récompenses : onglets Titres (par défaut), Badges, Cadres ; previews possédées et états Débloqué/Équipé ; actions Équiper/Retirer uniquement sur les objets débloqués. Actions désactivées pendant une mutation, erreur humaine et navigation clavier des onglets.

`ProfileBadge`, `ProfileFrame`, `ProfileTitle` et `ProfileIdentity` sont communs à Collection, Profil et Navbar. SVG déterministes sans emoji OS ; six variantes CSS explicites noir/ivoire/or, sans codes de rang ou effet lumineux. Le cadre du profil entoure uniquement badge/pseudo/titre ; Modifier, formulaire et déconnexion restent accessibles à l’extérieur. Modifier le pseudo conserve l’équipement. La navbar affiche un mini-badge et un cadre compact, jamais le titre ; niveau/XP, hauteur 56 px et largeur compte restent contraints.

## Preuves automatisées

Vitest : validation des snapshots, onglets/états/actions/erreurs, mutations NULL, events, isolation et changement de compte, édition du pseudo et navbar.

SQL CI : vraie migration sur soldes préexistants, catalogue exact, chacun des seuils moins 1/au seuil, saut multi-paliers, retry historique, rollback atomique, privileges/RLS/helpers et mauvais slot/non possédé. JWT local : comptes A/B/anon/service, lecture pure, writes refusés, crédits concurrents de sources distinctes, cohérence TS/SQL pour chaque niveau du catalogue et équipement des trois slots. Parcours navigateur avec Auth réelle : équipement, profil/navbar, rechargement et retrait.

Playwright UI : six cadres × light/dark × 1440/1120/375/320 px, pseudo long, absence d’overflow, header 56 px, menu mobile, édition et retrait. Les captures sont conservées comme artefacts de tests. Les suites existantes Progression/Game/permanent/weekly, Training, Duo, Rating, Social et smoke restent requises.

## Extensions futures

La colonne `unlock_type` accepte de futurs identifiants sans modifier les clés existantes. Une condition comme « 100 victoires » nécessitera sa propre preuve serveur, paramètres versionnés, migration et tests : elle n’est pas implémentée ici. Le client V1 refuse une version/variante inconnue ; une future version doit faire évoluer son parseur et son registre explicitement avant déploiement. Aucun calcul de condition future ne doit être confié au navigateur.

## Politique surprise et rollout #113

Le nouveau client appelle exclusivement `get_my_unlocked_profile_cosmetics`. Le serveur ne transmet aucun objet verrouillé dans ce snapshot : noms, previews et niveaux futurs ne sont donc jamais rendus. Aucun compteur total, carte grisée, « ??? », ratio de collection ni prochain palier. Le registre de rendu conserve les clés/variantes existantes, sans noms ni seuils métier de récompenses futures. Le catalogue DB et la RPC legacy restent accessibles selon leurs anciens droits pour compatibilité ; cette évolution protège la découverte dans le parcours canonique, sans promettre de secret cryptographique sur les assets.

Chaque onglet vide affiche « Continue de progresser pour découvrir de nouveaux titres/badges/cadres. ». Un objet possédé affiche « Débloqué au niveau X ». Équiper/remplacer/retirer, Provider, Profil et Navbar conservent leurs comportements et visuels.

Appliquer séparément `20261001030000_profile_cosmetics_surprise.sql` **avant merge/déploiement du client #113**. La migration ajoute uniquement la RPC canonique ; l’ancienne fonction, ses grants, les tables, les 24 clés/niveaux/visuels, le trigger et le backfill ne changent pas. Le client #112 continue à recevoir 24 objets. Aucun fallback client vers la RPC legacy (qui divulguerait le catalogue). Aucune migration production exécutée par Codex.
