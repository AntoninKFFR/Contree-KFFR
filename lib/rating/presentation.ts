import { getRatingProgress, ratingRank } from "@/lib/rating/formulaV1";

export type RatingFamily = "debutant" | "pas-mauvais" | "sait-jouer" | "capot-de-capi";

export type RatingPresentation = {
  family: RatingFamily;
  familyLabel: "Débutant" | "Pas mauvais" | "Sait jouer" | "Capot de Capi";
  division: "V" | "IV" | "III" | "II" | "I";
  label: string;
  imageSrc: `/ranks/${string}.png`;
  nextThreshold: number | null;
};

const FAMILY_BY_LABEL = {
  "Débutant": { family: "debutant", imageSrc: "/ranks/debutant.png" },
  "Pas mauvais": { family: "pas-mauvais", imageSrc: "/ranks/pas-mauvais.png" },
  "Sait jouer": { family: "sait-jouer", imageSrc: "/ranks/sait-jouer.png" },
  "Capot de Capi": { family: "capot-de-capi", imageSrc: "/ranks/capot-de-capi.png" },
} as const;

export function getRatingPresentation(rating: number): RatingPresentation {
  const label = ratingRank(rating);
  const match = /^(Débutant|Pas mauvais|Sait jouer|Capot de Capi) (V|IV|III|II|I)$/.exec(label);
  if (!match) throw new Error(`Unsupported rating rank: ${label}`);
  const familyLabel = match[1] as keyof typeof FAMILY_BY_LABEL;
  const division = match[2] as RatingPresentation["division"];
  const family = FAMILY_BY_LABEL[familyLabel];
  return {
    family: family.family,
    familyLabel,
    division,
    label,
    imageSrc: family.imageSrc,
    nextThreshold: getRatingProgress(rating).nextThreshold,
  };
}
