import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { DetailDialog, Button, styles } from "@/components/ui";
import { gradeInGameExercise, type InGameAnswer, type InGameGrade } from "@/engine/training/inGame";
import type { PlayerGameView } from "@/engine/views";
import { detectInGameBoundary, emptyInGameSchedulerState, scheduleInGameQuestion, type InGameConfiguration, type InGameSchedulerState, type ScheduledInGameQuestion } from "@/lib/training/inGameScheduler";
import { recordInGameAnswer, type InGameSummary } from "@/lib/training/inGameSummary";
import { puzzleTitle } from "./catalogue";
import { MemoryQuestion, VoidsQuestion } from "./knowledge";
import { Cards } from "./primitives";
import { NumberExercise } from "./number-exercise";
import { PuzzleCorrection } from "./correction";
type Snapshot = { sessionId: string; game: PlayerGameView | null; scheduler: InGameSchedulerState; question: ScheduledInGameQuestion | null; grade: InGameGrade | null; summary: InGameSummary };
export function useInGameTraining(game: PlayerGameView | undefined, configuration?: InGameConfiguration, sessionId = "") {
  const [snapshot, setSnapshot] = useState<Snapshot>({ sessionId, game: null, scheduler: emptyInGameSchedulerState(), question: null, grade: null, summary: {} });
  let current = snapshot;
  if (game && game !== snapshot.game && configuration) {
    const baseline = snapshot.sessionId === sessionId ? snapshot : { sessionId, game: null, scheduler: emptyInGameSchedulerState(), question: null, grade: null, summary: {} };
    const boundary = detectInGameBoundary(baseline.game, game);
    const scheduled = boundary ? scheduleInGameQuestion(baseline.scheduler, boundary, configuration, Number.parseInt(sessionId.slice(0, 8), 16) || 153) : { state: baseline.scheduler, question: null };
    current = { ...baseline, game, scheduler: scheduled.state, question: baseline.question ?? scheduled.question };
    // Derive the pause before effects can send a bot or forced-card request.
    setSnapshot(current);
  }
  return { ...current, paused: current.question !== null,
    submit: (answer: InGameAnswer) => setSnapshot((previous) => {
      if (!previous.question || previous.grade) return previous;
      const grade = gradeInGameExercise(previous.question.exercise, answer);
      return { ...previous, grade, summary: recordInGameAnswer(previous.summary, previous.question.axisId, grade) };
    }),
    close: () => setSnapshot((previous) => ({ ...previous, question: null, grade: null })),
  };
}
export function TrainingSummary({ summary }: { summary: InGameSummary }) {
  const entries = Object.entries(summary);
  return <View style={{ gap: 8 }}><Text accessibilityRole="header" style={styles.heading}>Bilan de l’entraînement</Text>{entries.length ? entries.map(([axis, result]) => <Text key={axis} style={styles.body}>{puzzleTitle(axis as Parameters<typeof puzzleTitle>[0])} : {result.earnedScore}/{result.possibleScore} · {result.questions} question(s)</Text>) : <Text style={styles.body}>Aucune question répondue dans cette session.</Text>}<Text style={styles.hint}>Ce bilan pédagogique est distinct du score de la partie et ne modifie ni les cartes ni les records de séries.</Text></View>;
}
export function InGameOverlay({ training, ready }: { training: ReturnType<typeof useInGameTraining>; ready: boolean }) {
  const [revealed, reveal] = useState<string | null>(null), [answer, setAnswer] = useState("");
  const question = training.question;
  useEffect(() => {
    if (!question || !ready) return;
    const timer = setTimeout(() => { reveal(question.eventKey); setAnswer(""); }, 600);
    return () => clearTimeout(timer);
  }, [question, ready]);
  if (!question || !ready || revealed !== question.eventKey) return null;
  const e = question.exercise;
  return <DetailDialog visible title={puzzleTitle(question.axisId)} onClose={training.close}><View style={{ gap: 12 }}><Text style={styles.body}>La partie est en pause pour cette question.</Text>{e.kind === "number" ? <NumberExercise exercise={e.data} disabled={Boolean(training.grade)} value={answer} onChange={setAnswer} onSubmit={() => training.submit({ kind: "number", value: Number(answer) })} /> : e.kind === "cards" ? <MemoryQuestion exercise={e.data} disabled={Boolean(training.grade)} onSubmit={(a) => training.submit(a)} /> : e.kind === "voids" ? <VoidsQuestion exercise={e.data} disabled={Boolean(training.grade)} onSubmit={(a) => training.submit(a)} /> : <><Text style={styles.heading}>{e.data.question}</Text><Cards cards={e.data.candidates} /><Button label="Oui" disabled={Boolean(training.grade)} onPress={() => training.submit({ kind: "boolean", value: true })} /><Button label="Non" secondary disabled={Boolean(training.grade)} onPress={() => training.submit({ kind: "boolean", value: false })} /></>}{training.grade ? <View style={{ gap: 12 }}><Text accessibilityLiveRegion="polite" style={styles.heading}>{training.grade.correct ? "Bonne réponse !" : "Réponse à revoir"}</Text><PuzzleCorrection puzzle={e.kind === "boolean" ? { kind: "cards", data: e.data } : e} /><Button label="Reprendre la partie" onPress={training.close} /></View> : null}</View></DetailDialog>;
}
