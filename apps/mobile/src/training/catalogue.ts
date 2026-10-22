import { MEMORY_AXIS_IDS, MEMORY_LABELS, MEMORY_LEVELS, isMemoryAxisId } from "@/engine/training/memory";
import { BIDDING_LEVEL_NAMES, type BiddingLevel } from "@/engine/training/bidding";
import { BID_READING_LEVEL_NAMES, type BidReadingLevel } from "@/engine/training/bidReading";
import { isPileCountModeUnlocked, isTrickValueChallengeUnlocked, type TrainingProgress } from "@/lib/training/progress";
import type { PileCountMode } from "@/engine/training/pileCount";

export type PuzzleAxis = "trick-value" | typeof MEMORY_AXIS_IDS[number] | "opponent-voids" | "bidding" | "bid-reading";
export const PILE_NAMES = { beginner: "Débutant", normal: "Normal", free: "Libre", manual: "Manuel" } as const;
export const PILE_DESCRIPTIONS = { beginner: "Défilement lent, avec l’aide des valeurs des cartes.", normal: "Défilement rapide, sans aide.", free: "Tu règles toi-même la vitesse. Pas de meilleur score.", manual: "Fais défiler les cartes avec les flèches, le plus vite possible. Chrono sur chaque tas." };
export function puzzleTitle(axis: PuzzleAxis) {
  return isMemoryAxisId(axis) ? MEMORY_LABELS[axis] : ({ "trick-value": "Valeur d’un pli", "opponent-voids": "Jeu des autres", bidding: "Faire son annonce", "bid-reading": "Lire les enchères" } as const)[axis];
}
export function levelCount(axis: PuzzleAxis) { return isMemoryAxisId(axis) ? MEMORY_LEVELS[axis] : axis === "trick-value" ? 2 : axis === "opponent-voids" ? 3 : 4; }
export function levelName(axis: PuzzleAxis, level: number) { return axis === "bidding" ? BIDDING_LEVEL_NAMES[level as BiddingLevel] : axis === "bid-reading" ? BID_READING_LEVEL_NAMES[level as BidReadingLevel] : axis === "trick-value" ? level === 1 ? "Fondamentaux" : "Confirmé" : `Niveau ${level}`; }
export function isPuzzleAxis(axis: string): axis is PuzzleAxis { return isMemoryAxisId(axis) || ["trick-value", "opponent-voids", "bidding", "bid-reading"].includes(axis); }
export type CatalogueItem = { axis: string; title: string; description: string; mode?: string; levels?: number; unlocked: boolean; level: number; record?: string };
export function catalogue(progress: TrainingProgress): { title: string; items: CatalogueItem[] }[] {
  const puzzle = (axis: PuzzleAxis, description: string): CatalogueItem => {
    const saved = progress.axes[axis], level = saved.unlockedLevel, best = saved.levels[level as 1];
    return { axis, title: puzzleTitle(axis), description, levels: levelCount(axis), unlocked: true, level, record: best.completedSeries ? `Record local · ${best.bestScore} / 10` : undefined };
  };
  return [
    { title: "01 — Calculer", items: [puzzle("trick-value", "Compte les points des cartes à l’atout et hors atout, puis le bonus du dernier pli."), ...(["survival", "blitz"] as const).map((mode) => ({ axis: "challenge", mode, title: mode === "survival" ? "Survie" : "Blitz", description: mode === "survival" ? "3 vies. Le temps diminue à mesure que tu progresses." : "60 secondes. Les erreurs consécutives peuvent détruire ta run.", unlocked: isTrickValueChallengeUnlocked(progress), level: 1, record: progress.axes["trick-value"].challenges[mode].completedRuns ? `Record local · ${progress.axes["trick-value"].challenges[mode].bestScore}` : undefined })), ...(["beginner", "normal", "free", "manual"] as PileCountMode[]).map((mode) => {
      const saved = progress.axes["pile-count"].modes;
      return { axis: "pile-count", mode, title: `Compter son tas · ${PILE_NAMES[mode]}`, description: PILE_DESCRIPTIONS[mode], unlocked: isPileCountModeUnlocked(progress, mode), level: 1, record: mode === "manual" ? saved.manual.bestTimeMs ? `Record local · ${(saved.manual.bestTimeMs / 1000).toFixed(1)} s (10/10)` : undefined : mode === "free" ? undefined : saved[mode].completedSeries ? `Record local · ${saved[mode].bestScore} / 10` : undefined };
    })] },
    { title: "02 — Mémoriser", items: MEMORY_AXIS_IDS.map((axis) => puzzle(axis, "Observe, retiens et retrouve les cartes au fil du jeu.")) },
    { title: "03 — Déduire", items: [puzzle("opponent-voids", "Repère les couleurs dont les autres joueurs sont certainement coupés."), { axis: "game", title: "Entraînement en partie", description: "Joue une vraie partie contre les bots et réponds à des questions aux moments clés.", unlocked: true, level: 1 }] },
    { title: "04 — Annoncer", items: [puzzle("bidding", "Choisis quoi annoncer selon la doctrine KFFR : ouvrir, soutenir, surenchérir, passer ou Coincher."), puzzle("bid-reading", "Apprends ce qu’une annonce permet d’affirmer sur la main du partenaire ou d’un adversaire."), { axis: "conventions", title: "Conventions KFFR", description: "Advanced Rules V4.1 · Conventions d’annonces.", unlocked: true, level: 1 }, { axis: "duo", title: "Lire les enchères à deux", description: "Même série, deux réponses indépendantes. Rejoins un partenaire sur iPhone ou sur le web.", unlocked: true, level: 1 }] },
  ];
}
