// Content transcribed verbatim from app/training/conventions/bidding/page.tsx; parity checked by tests.
export const biddingConventions = [
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "Le Valet et le 9 sont les deux atouts majeurs. Leur présence, la longueur de la couleur et les As extérieurs donnent de la force à l’annonce. Un 10 isolé reste vulnérable : il peut être capturé ou coupé."
      }
    ],
    "title": "Choisir une couleur"
  },
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "Avec le Valet sans le 9, ou le 9 sans le Valet, annoncer 80 peut montrer la couleur et rechercher la carte manquante chez le partenaire. Ce message ne promet pas à lui seul une main autonome."
      },
      {
        "kind": "p",
        "text": "Exemple : 9♥ A♥ 7♥ et des contrôles limités → 80 ♥ pour chercher le Valet."
      }
    ],
    "title": "80 comme message"
  },
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "4+ atouts sans Valet ni 9 : 80 maximum."
      },
      {
        "kind": "p",
        "text": "Cette longueur ne mène pas automatiquement à 80 : il faut aussi des contrôles extérieurs crédibles. Elle ne justifie jamais 90 ou plus, même si le partenaire soutient ensuite la couleur."
      },
      {
        "kind": "p",
        "text": "Exemple : 7♥ 8♥ Q♥ K♥ avec suffisamment de contrôles extérieurs → au maximum 80 ♥."
      }
    ],
    "title": "Quatre atouts sans Valet ni 9"
  },
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "Apporter le Valet ou le 9 manquant peut former un petit fit ; une longueur mieux contrôlée peut justifier un soutien plus fort. Après un soutien public, le joueur peut poursuivre sa première annonce si sa main permet le nouveau palier."
      },
      {
        "kind": "p",
        "text": "La couleur du partenaire est respectée par défaut. Changer de couleur demande une alternative exceptionnellement autonome, et reste un message fort."
      }
    ],
    "title": "Parler avec son partenaire"
  },
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "Face à une annonce adverse, on utilise le plus petit palier légal utile que la main peut réellement soutenir. Une enchère plus haute ne remplace pas une fondation d’atout insuffisante."
      }
    ],
    "title": "Enchères compétitives"
  },
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "La voie classique demande un contrat adverse déjà élevé, la maîtrise du Valet et du 9 de son atout et plusieurs contrôles défensifs. La voie « overbid manifeste » reconnaît aussi un contrat excessif grâce à plusieurs contrôles hors atout, à une forte maîtrise de l’atout adverse, ou aux deux."
      },
      {
        "kind": "h3",
        "text": "Maîtrise de l’atout adverse"
      },
      {
        "kind": "li",
        "text": "À 140 : J–9–A–10 dans l’atout adverse, plus un As extérieur."
      },
      {
        "kind": "li",
        "text": "À 150 : J–9–A–10, ou J–9–A plus une paire As–10 extérieure."
      },
      {
        "kind": "li",
        "text": "À 160 : J–9–A–10, ou J–9–A plus un As extérieur."
      },
      {
        "kind": "h3",
        "text": "Contrôles hors atout"
      },
      {
        "kind": "li",
        "text": "À 140 : les trois autres couleurs contrôlées par As–10."
      },
      {
        "kind": "li",
        "text": "À 150 : deux paires As–10 et l’As de la troisième couleur."
      },
      {
        "kind": "li",
        "text": "À 160 : deux paires As–10."
      },
      {
        "kind": "p",
        "text": "Ces voies exigent aussi une défense globalement crédible. Un contrat à 100 ou 110 ne déclenche pas cette Coinche de surenchère."
      },
      {
        "kind": "p",
        "text": "Exemple : l’adversaire annonce 160 ♥ et ta main contient J♥ 9♥ A♥ 10♥ → Coinche possible selon V4.1."
      }
    ],
    "title": "Coinche"
  },
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "La Surcoinche demande une marge exceptionnelle, pas simplement une bonne main. Le Capot demande un contrôle presque complet de la donne ; dans certains cas, l’annonce publique du partenaire complète l’information."
      }
    ],
    "title": "Surcoinche et Capot"
  },
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "80 ♥ ne permet pas à lui seul de savoir si le joueur possède le Valet ou le 9. Plusieurs mains différentes peuvent produire le même message."
      },
      {
        "kind": "p",
        "text": "Une enchère décrit ce que la doctrine promet publiquement, pas toutes les cartes de la main. Dans « Lire les enchères », une main révélée après la réponse illustre seulement une possibilité compatible."
      }
    ],
    "title": "Promesse ≠ main exacte"
  },
  {
    "paragraphs": [
      {
        "kind": "p",
        "text": "L’axe utilise le règlement contree-kffr version 1 : couleurs ♣ ♦ ♥ ♠, annonces de 80 à 160, Capot, Coinche, Surcoinche et Belote/Rebelote. Il n’interroge ni Sans Atout, ni Tout Atout, ni Générale, ni annonces de tierce ou de carré."
      }
    ],
    "title": "Règlement utilisé"
  }
] as const;
