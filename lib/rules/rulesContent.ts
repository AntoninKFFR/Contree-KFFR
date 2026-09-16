import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";

export type RulesSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  points?: string[];
};

const rules = CONTREE_KFFR_RULESET;

export const defaultRules = {
  targetScore: rules.game.targetScore,
  bids: Array.from(
    { length: (rules.bidding.maxBid - rules.bidding.minBid) / rules.bidding.bidStep + 1 },
    (_, index) => rules.bidding.minBid + index * rules.bidding.bidStep,
  ),
  coincheMultiplier: rules.scoring.coincheMultiplier,
  surcoincheMultiplier: rules.scoring.surcoincheMultiplier,
  belotePoints: rules.belote.points,
  lastTrickBonus: rules.trickScoring.lastTrickBonus,
  capotLastTrickBonus: rules.trickScoring.capotLastTrickBonus,
  failureBase: rules.scoring.failureBasePoints,
  capotBase: rules.scoring.capotBasePoints,
} as const;

export const kffrSections: RulesSection[] = [
  {
    id: "objectif-equipes",
    title: "Objectif et équipes",
    paragraphs: [
      `La Contrée KFFR se joue à 4 joueurs, en 2 équipes de 2 partenaires placés face à face. Il faut remporter des plis et réussir le contrat annoncé par son équipe. La première équipe à atteindre la cible de ${defaultRules.targetScore} points peut gagner la partie.`,
    ],
  },
  {
    id: "cartes-distribution",
    title: "Cartes et distribution",
    paragraphs: [
      "Le jeu compte 32 cartes : 7, 8, 9, Valet, Dame, Roi, 10 et As dans chacune des quatre couleurs. Chaque joueur reçoit 8 cartes.",
      "La première partance est tirée au sort, puis elle tourne d’un joueur à chaque donne. La partance parle en premier aux enchères et entame aussi le premier pli, même si un autre joueur a pris. Le gagnant d’un pli entame le suivant.",
    ],
  },
  {
    id: "encheres",
    title: "Enchères",
    paragraphs: [
      `Une enchère numérique va de ${rules.bidding.minBid} à ${rules.bidding.maxBid}, par pas de ${rules.bidding.bidStep}, et choisit une couleur d’atout. Toute nouvelle enchère doit être strictement supérieure. Un joueur qui a passé peut reparler si le tour lui revient.`,
      "Capot est au-dessus de 160 : l’équipe preneuse s’engage à gagner les 8 plis. Aucune enchère ne peut dépasser Capot.",
    ],
    points: [
      "Quatre passes sans contrat annulent la donne : aucun score n’est marqué.",
      "Après une enchère ou une Coinche, les enchères s’arrêtent lorsque les trois joueurs suivants ont passé.",
    ],
  },
  {
    id: "coinche-surcoinche",
    title: "Coinche et Surcoinche",
    points: [
      `Coinche : un adversaire peut contrer le contrat à son tour. Le contrat est figé et le coefficient de marque est ×${defaultRules.coincheMultiplier}.`,
      `Surcoinche : un joueur de l’équipe preneuse peut répondre à son tour. Elle termine immédiatement les enchères et porte le coefficient à ×${defaultRules.surcoincheMultiplier}.`,
    ],
  },
  {
    id: "ordre-valeur",
    title: "Ordre et valeur des cartes",
    paragraphs: ["L’ordre des cartes et leur valeur changent selon que la couleur est l’atout ou non. Les badges ci-dessous vont de la carte la plus forte à la plus faible."],
  },
  {
    id: "jeu",
    title: "Jeu",
    points: [
      "Il faut fournir la couleur demandée quand on la possède. Si l’atout est demandé, il faut monter à l’atout si possible.",
      "Sans la couleur demandée, il faut couper si le partenaire n’est pas maître et si l’on possède de l’atout.",
      "Si un adversaire a déjà coupé, il faut surcouper si possible. Sans atout supérieur, la défausse est permise.",
      "Quand le partenaire est maître, on peut défausser. Après une coupe maîtresse du partenaire, si l’on ne possède que de l’atout et qu’on ne peut pas faire mieux, il n’est pas obligatoire de monter.",
    ],
  },
  {
    id: "dernier-pli",
    title: "Dernier pli",
    paragraphs: [`Le dernier pli apporte ${defaultRules.lastTrickBonus} points supplémentaires. Une donne ordinaire totalise 162 points de plis.`],
  },
  {
    id: "belote-rebelote",
    title: "Belote / Rebelote",
    paragraphs: [
      `Un joueur qui possède le Roi et la Dame d’atout dans sa main réalise Belote à la première de ces cartes jouée, puis Rebelote à la seconde. L’application enregistre ces déclarations automatiquement. La combinaison rapporte ${defaultRules.belotePoints} points.`,
      "La Belote est imprenable : elle reste acquise même si le contrat chute, est coinché ou surcoinché. Dans la Contrée KFFR par défaut, les annonces Tierce, Cinquante, Cent et Carrés sont désactivées ; seule Belote / Rebelote est comptée.",
    ],
  },
  {
    id: "reussite",
    title: "Réussite du contrat",
    paragraphs: [
      "Pour réussir une enchère numérique, les preneurs doivent à la fois atteindre ou dépasser la valeur annoncée et marquer strictement plus de points que la défense. Les points de qualification comprennent les plis et la Belote éventuelle, mais pas les autres annonces dans la variante par défaut.",
      "Pour un Capot demandé, l’équipe preneuse doit gagner les 8 plis. Un pli gagné par la défense suffit à le faire chuter.",
    ],
  },
  {
    id: "capot-realise",
    title: "Capot réalisé",
    paragraphs: [
      `Quand une équipe gagne les 8 plis, le dernier pli rapporte ${defaultRules.capotLastTrickBonus} points au lieu de ${defaultRules.lastTrickBonus} : le total des plis atteint 252 points. Cela vaut que le Capot ait été annoncé ou non.`,
      "Capot annoncé est un engagement pris aux enchères ; Capot réalisé décrit le résultat effectif des 8 plis.",
    ],
  },
  {
    id: "score",
    title: "Calcul du score · Officiel",
    paragraphs: [
      "Contrat normal réussi : les preneurs marquent leurs points de donne plus la valeur du contrat ; la défense marque ses propres points de donne.",
      `Contrat coinché ou surcoinché réussi : les preneurs marquent la base réglementaire (${defaultRules.failureBase}, ou ${defaultRules.capotBase} si un Capot est réalisé), plus le contrat et leur Belote éventuelle, le tout multiplié par ${defaultRules.coincheMultiplier} ou ${defaultRules.surcoincheMultiplier}. La défense conserve seulement sa Belote éventuelle.`,
      `Contrat chuté : les preneurs conservent uniquement leur Belote éventuelle. La défense marque la base de chute (${defaultRules.failureBase}), plus le contrat et sa Belote éventuelle. Si le contrat est coinché ou surcoinché, ce total est multiplié par ${defaultRules.coincheMultiplier} ou ${defaultRules.surcoincheMultiplier} ; la Belote des preneurs n’est pas multipliée. La base devient ${defaultRules.capotBase} si la défense réalise un Capot ou si le contrat demandé était un Capot.`,
      "Le score final de chaque équipe est arrondi à la dizaine la plus proche ; un 5 est arrondi vers le haut.",
    ],
  },
  {
    id: "fin-partie",
    title: "Fin de partie",
    paragraphs: [
      `La cible par défaut est ${defaultRules.targetScore} points. La première équipe qui l’atteint ou la dépasse avec un total strictement supérieur gagne. Si les deux équipes dépassent la cible, le meilleur total l’emporte ; une égalité exacte impose une donne supplémentaire.`,
      "Une équipe qui a chuté ou subi un Capot ne gagne pas si elle ne franchit la cible que grâce à sa Belote imprenable : elle doit encore remporter un pli lors d’une donne suivante.",
    ],
  },
];

export const variantSections: RulesSection[] = [
  {
    id: "variante-cible",
    title: "Score cible",
    paragraphs: ["La cible de la partie peut être ajustée : 500, 1000, 1500, 2000 points ou une valeur personnalisée de 100 à 100 000 points."],
  },
  {
    id: "variante-contrats",
    title: "Contrats",
    paragraphs: ["La variante Personnalisée peut activer ou désactiver Capot, Coinche, Surcoinche, Sans Atout, Tout Atout et Générale. Une Générale engage un joueur à gagner seul les 8 plis ; son partenaire ne joue pas la donne."],
    points: [
      "Surcoinche nécessite Coinche.",
      "Générale Sans Atout et Générale Tout Atout disposent chacune d’une option dédiée. Activer Sans Atout ou Tout Atout ordinaire ne les active pas automatiquement.",
    ],
  },
  {
    id: "variante-annonces",
    title: "Annonces",
    paragraphs: ["Une partie personnalisée peut ajouter les annonces Tierce, Cinquante, Cent et Carrés. Elles sont désactivées dans la Contrée KFFR par défaut."],
  },
  {
    id: "variante-belote",
    title: "Belote",
    paragraphs: ["Vous pouvez activer ou désactiver Belote / Rebelote, ajuster sa valeur, décider si elle compte pour la réussite ou la chute d’un contrat et, avec Tout Atout activé, autoriser la Belote dans ce mode."],
  },
  {
    id: "variante-jeu",
    title: "Jeu",
    paragraphs: ["Les obligations de fournir, couper, surcouper et monter à l’atout sont réglables. L’éditeur propose aussi la défausse quand le partenaire est maître et quand la surcoupe est impossible."],
  },
  {
    id: "variante-reussite",
    title: "Réussite du contrat",
    paragraphs: ["Une variante peut exiger d’atteindre l’enchère, de battre la défense et de tenir compte des annonces dans la réussite du contrat."],
  },
  {
    id: "variante-score",
    title: "Score et options avancées",
    paragraphs: [
      "L’éditeur propose les modes Officiel, Contrat uniquement, Contrat uniquement / base de chute et Points réalisés, ainsi que l’arrondi à la dizaine. Il permet de choisir si tous les points sont multipliés en cas de Coinche et si les annonces changent de camp après une chute ou un Capot.",
      `Les options avancées exposent la valeur de la Générale et les multiplicateurs de Coinche et Surcoinche. Le moteur accepte aussi des bases de chute et de Capot personnalisées (par défaut ${defaultRules.failureBase} et ${defaultRules.capotBase}), même si ces champs ne sont pas actuellement exposés dans l’éditeur visuel.`,
    ],
  },
];

export const cardValues = {
  plain: [
    ["As", 11], ["10", 10], ["Roi", 4], ["Dame", 3], ["Valet", 2], ["9", 0], ["8", 0], ["7", 0],
  ],
  trump: [
    ["Valet", 20], ["9", 14], ["As", 11], ["10", 10], ["Roi", 4], ["Dame", 3], ["8", 0], ["7", 0],
  ],
} as const;
