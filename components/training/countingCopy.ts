import type { RoundCountExercise } from "@/engine/training/roundCount";
import type { RunningScoreExercise } from "@/engine/training/runningScore";
import type { PlayerId, TeamId } from "@/engine/types";
import type { CountingAxisId, CountingLevel } from "@/components/training/progress";

export type CountingExercise = RoundCountExercise | RunningScoreExercise;

type Names = Record<PlayerId, string>;

export const COUNTING_AXIS_COPY: Record<CountingAxisId, {
  title: string;
  description: string;
  watch: string;
  levels: Record<CountingLevel, { name: string; description: string }>;
}> = {
  "round-count": {
    title: "Compter une manche",
    description: "Regarde une donne défiler pli par pli, puis fais le total des points.",
    watch: "Regarde la donne défiler et compte les points au fil des plis.",
    levels: {
      1: { name: "Points de plis", description: "Le total des plis d’une équipe, 10 de der compris." },
      2: { name: "Plis et belote", description: "Ajoute la belote quand elle est annoncée." },
      3: { name: "Score marqué", description: "Le score inscrit au tableau, contrat réussi ou chuté." },
    },
  },
  "running-score": {
    title: "Points en cours de donne",
    description: "La donne s’arrête en route : sais-tu où en est chaque équipe ?",
    watch: "Regarde les premiers plis : la donne va s’arrêter en route.",
    levels: {
      1: { name: "Ton équipe", description: "Les points de plis de ton équipe à ce stade." },
      2: { name: "Les deux équipes", description: "Les points de plis de chaque équipe." },
      3: { name: "Reste à faire", description: "Les points qui manquent encore au preneur." },
    },
  },
};

/** Name under a card. */
export function playerLabel(playerId: PlayerId, names: Names): string {
  return playerId === 0 ? "Toi" : names[playerId];
}

/** Name inside a sentence, with the seat's relation to the player. */
export function playerInSentence(playerId: PlayerId, names: Names): string {
  if (playerId === 0) return "toi";
  return `${names[playerId]} (${playerId === 2 ? "ton partenaire" : "adversaire"})`;
}

export function announcementLine(playerId: PlayerId, names: Names, kind: "belote" | "rebelote"): string {
  const word = kind === "belote" ? "Belote" : "Rebelote";
  return playerId === 0 ? `Tu annonces « ${word} ! »` : `${names[playerId]} annonce « ${word} ! »`;
}

export function teamLabel(team: TeamId, names: Names): string {
  return team === 0 ? `ton équipe (avec ${names[2]})` : `l’équipe de ${names[1]} et ${names[3]}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatScore(score: number): string {
  return score.toLocaleString("fr-FR");
}

/** French: "0 point", "1 point", "2 points". */
export function formatPoints(points: number): string {
  return `${points} point${Math.abs(points) >= 2 ? "s" : ""}`;
}

/** The question, and one input label per expected value (team 0 first for two-team questions). */
export function countingQuestion(exercise: CountingExercise): { text: string; prompts: string[] } {
  const names = exercise.playerNames;
  const single = ["Ta réponse en points"];
  const perTeam = (prefix: string) => [`${prefix} ${teamLabel(0, names)}`, `${prefix} ${teamLabel(1, names)}`];
  const { question } = exercise;
  switch (question.kind) {
    case "team-tricks":
      return { text: `Combien de points de plis ${teamLabel(question.team, names)} a-t-elle faits sur la donne ?`, prompts: single };
    case "team-tricks-belote":
      return { text: `Combien de points ${teamLabel(question.team, names)} a-t-elle faits, belote comprise ?`, prompts: single };
    case "round-score":
      return { text: "Quel score chaque équipe marque-t-elle au tableau pour cette donne ?", prompts: perTeam("Score de") };
    case "own-team":
      return { text: `À ce stade, combien de points de plis ${teamLabel(0, names)} a-t-elle faits ?`, prompts: single };
    case "both-teams":
      return { text: "À ce stade, combien de points de plis chaque équipe a-t-elle faits ?", prompts: perTeam("Points de") };
    case "points-needed":
      return { text: `Combien de points manque-t-il encore à ${teamLabel(question.takerTeam, names)} pour réussir son contrat ?`, prompts: single };
  }
}

/** One short explanation line, shown after the answer. It never replaces the expected values. */
export function countingExplanation(exercise: CountingExercise): string {
  const names = exercise.playerNames;
  const team = (id: TeamId) => teamLabel(id, names);
  if ("stopAfterTricks" in exercise) {
    const { explanation, stopAfterTricks } = exercise;
    const [ours, theirs] = [explanation.trickPoints[0], explanation.trickPoints[1]];
    if (exercise.question.kind !== "points-needed") {
      return `Après ${stopAfterTricks} plis : ${team(0)} a ${ours} points de plis, ${team(1)} en a ${theirs}.`;
    }
    const taker = explanation.takerTeam;
    const withBelote = explanation.belotePointsByTeam[taker] > 0 ? " (belote comprise)" : "";
    return `${capitalize(team(taker))} a ${explanation.takerPoints} points${withBelote}. Il lui en faut au moins `
      + `${explanation.target} et plus que la défense (${explanation.defenderPoints}) : il en manque ${explanation.pointsNeeded}.`;
  }
  const { explanation, question } = exercise;
  const tricks = explanation.trickPointsByTeam;
  const reference = explanation.capotTeam === null
    ? `Repère : les plis d’une donne valent toujours 162 points au total (${tricks[0]} + ${tricks[1]}).`
    : `Capot : ${team(explanation.capotTeam)} a fait tous les plis, bonus compris.`;
  if (question.kind === "team-tricks") return reference;
  if (question.kind === "team-tricks-belote") {
    const belote = explanation.belotePointsByTeam[question.team];
    return belote > 0
      ? `${capitalize(team(question.team))} : ${tricks[question.team]} points de plis + ${belote} de belote.`
      : `${capitalize(team(question.team))} n’a pas la belote : seuls ses ${tricks[question.team]} points de plis comptent.`;
  }
  const outcome = explanation.contractSucceeded ? "réussi" : "chuté";
  return `Contrat de ${team(explanation.takerTeam)} ${outcome}. Points de plis : ${tricks[0]} et ${tricks[1]}. ${reference}`;
}
