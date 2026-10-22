import { useEffect, useState } from "react";
import { AppState, ScrollView, Text } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Button, styles } from "@/components/ui";
import { recordTrickValueChallengeRun } from "@/lib/training/progress";
import type { TrickValueChallengeMode } from "@/engine/training/trickValueChallenge";
import { ChallengeRun } from "./challenge";
import { NumberPad, PlayedCards, Trump } from "./primitives";
import { useTraining } from "./provider";
export function ChallengeScreen({ mode }: { mode: TrickValueChallengeMode }) {
  const { progress, store, refresh } = useTraining(), router = useRouter();
  const [run, setRun] = useState<ChallengeRun | null>(null), [, render] = useState(0), [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false), [attempt, retry] = useState(0);
  const hasProgress = Boolean(progress);
  useEffect(() => { if (!progress) return; const timer = setTimeout(() => { try { setRun(new ChallengeRun(mode, progress)); } catch (e) { setError((e as Error).message); } }, 0); return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasProgress]);
  useEffect(() => {
    if (!run) return;
    const tick = () => { if (AppState.currentState === "active") { const previous = run.state, index = run.state.exerciseIndex; run.tick(); if (index !== run.state.exerciseIndex) setAnswer(""); if (previous !== run.state) render((n) => n + 1); } };
    const timer = setInterval(tick, 50), listener = AppState.addEventListener("change", (state) => { if (state === "active") tick(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [run]);
  const finished = run?.state.finished;
  useEffect(() => {
    if (!run?.state.finished) return;
    let active = true;
    void store.commit(run.receipt, (p) => recordTrickValueChallengeRun(p, run.state)).then(() => { if (active) { setSaved(true); setError(null); refresh(); } }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, attempt]);
  return <Screen title={mode === "survival" ? "Survie" : "Blitz"} bottomInset headerAction={<Button label="‹ Catalogue" secondary onPress={() => router.replace("/training")} />}><ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 16 }}><Text accessibilityRole="header" style={styles.heading}>{mode === "survival" ? "Survie" : "Blitz"}</Text>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{run ? <>
    {!run.state.finished ? <Countdown run={run} /> : null}<Text style={styles.heading}>{run.state.finished ? `Résultat · ${run.state.correctAnswers}` : `${run.state.correctAnswers} bonnes réponses${mode === "survival" ? ` · ${run.state.lives} vies` : ` · Série ${run.state.correctStreak}`}`}</Text>
    {run.state.finished ? <><Text style={styles.body}>{saved ? "Record local sauvegardé." : "Enregistrement du record local…"}</Text>{error ? <Button label="Réessayer" onPress={() => retry((n) => n + 1)} /> : null}<Button label="Retour aux défis" onPress={() => router.replace("/training")} /></> : <>{run.exercise.contractMode.kind === "suit" ? <Trump suit={run.exercise.contractMode.suit} /> : null}<Text style={styles.body}>{run.exercise.isLastTrick ? "Dernier pli · Dix de der" : `Pli ${run.exercise.trickNumber}`}</Text><PlayedCards cards={run.exercise.cards} names={{ 0: "Toi", 1: "Gauche", 2: "Partenaire", 3: "Droite" }} /><Text accessibilityLiveRegion="polite" style={styles.body}>{run.message}</Text><NumberPad value={answer} onChange={setAnswer} disabled={run.transitionAt !== null} onSubmit={() => { if (AppState.currentState === "active" && run.submit(Number(answer))) render((n) => n + 1); }} /></>}
  </> : null}</ScrollView></Screen>;
}


function Countdown({ run }: { run: ChallengeRun }) {
  const [left, setLeft] = useState(() => run.remaining());
  useEffect(() => { const timer = setInterval(() => { if (AppState.currentState === "active") setLeft(run.remaining()); }, 50); return () => clearInterval(timer); }, [run]);
  return <Text accessibilityLabel="Temps restant" style={styles.heading}>{(left / 1000).toFixed(1)} s</Text>;
}
