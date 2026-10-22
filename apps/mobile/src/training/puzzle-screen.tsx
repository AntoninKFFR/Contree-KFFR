import { NumberExercise } from "./number-exercise";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { TrainingSeriesDelivery } from "./delivery";
import { trainingPanel } from "./panel";
import { useEffect, useRef, useState } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Screen, styles } from "@/components/ui";
import { useAccount } from "@/auth/AccountProvider";
import { isPersistablePuzzleAxisId, type SubmittedTrainingAnswer } from "@/engine/training/seriesContract";
import { puzzleTitle, levelName, type PuzzleAxis } from "./catalogue";
import { PuzzleRun, recordPuzzle, type PuzzleAnswer } from "./puzzles";
import { useTraining } from "./provider";
import { createTrainingApi, seriesSubmission } from "./api";
import { MemoryQuestion, Observation, VoidsQuestion } from "./knowledge";
import { BiddingQuestion, ReadingQuestion } from "./auction";
import { PuzzleCorrection } from "./correction";

export function PuzzleScreen({ axis, level }: { axis: PuzzleAxis; level: number }) {
  const { progress, store, refresh } = useTraining(), { session } = useAccount(), router = useRouter();
  const [run, setRun] = useState<PuzzleRun | null>(null), [, render] = useState(0), [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState(""), [studying, study] = useState(true), [sync, setSync] = useState(""), [saving, save] = useState(false);
  const [saved, setSaved] = useState(false), [attempt, retry] = useState(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasProgress = Boolean(progress);
  useEffect(() => {
    if (!progress) return;
    const timer = setTimeout(() => { try { setRun(new PuzzleRun(axis, level, progress!)); } catch (e) { setError((e as Error).message); } }, 0);
    return () => { clearTimeout(timer); if (advanceTimer.current) clearTimeout(advanceTimer.current); };
    // The run keeps its starting progress; a record refresh cannot regenerate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axis, level, hasProgress]);
  const finished = run?.finished;
  useEffect(() => {
    if (!run?.finished || !session) return;
    let active = true; const abort = new AbortController();
    Promise.resolve().then(() => { if (active) { save(true); setError(null); } });
    void store.commit(run.receipt, (p) => recordPuzzle(p, axis, level, run.score)).then(async () => {
      if (!active) return; setSaved(true);
      if (!isPersistablePuzzleAxisId(axis)) { setSync("Résultat local sauvegardé sur cet iPhone."); return; }
      setSync("Vérification serveur…");
      try {
        const body = seriesSubmission({ axisId: axis, level, seed: run.seed, answers: run.answers as SubmittedTrainingAnswer[], durationMs: Math.max(1, Math.round(run.endedAt - run.startedAt)) });
        await new TrainingSeriesDelivery(AsyncStorage, session.user.id, (value, signal) => createTrainingApi()(session, signal, "/api/training/series", value), async (value, signal) => {
          if (!supabase) throw Error("Records indisponibles.");
          const { data, error } = await supabase.from("training_series").select("id").eq("user_id", session.user.id).eq("axis_id", value.axisId).eq("axis_version", value.axisVersion).eq("level", value.level).eq("seed", value.seed).eq("generator_version", value.generatorVersion).eq("ruleset_version", value.rulesetVersion).eq("duration_ms", value.durationMs).eq("answers", JSON.stringify(value.answers)).limit(1).abortSignal(signal);
          if (error) throw error; return Boolean(data?.length);
        }).deliver(run.receipt, body, abort.signal);
        if (active) { setSync("Série vérifiée et sauvegardée sur ton compte."); }
      } catch (e) { if (active) { setSync("Record local sauvegardé · synchronisation impossible."); setError((e as Error).message); } }
    }).catch((e: Error) => { if (active) setError(e.message); }).finally(() => { if (active) { save(false); refresh(); } });
    return () => { active = false; abort.abort(); };
    // A finished run is committed once; retries reuse its seed/receipt and server deduplication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, attempt, session?.access_token]);
  const next = () => { if (run?.next()) { setAnswer(""); study(true); render((n) => n + 1); } };
  const submit = (value: PuzzleAnswer) => {
    if (!run || AppState.currentState !== "active") return;
    try {
      if (!run.submit(value)) return; render((n) => n + 1);
      if (axis === "trick-value" && level === 2) advanceTimer.current = setTimeout(() => { advanceTimer.current = null; next(); }, 190);
    } catch (e) { setError((e as Error).message); }
  };
  const puzzle = run?.puzzle;
  return <Screen title={puzzleTitle(axis)} bottomInset headerAction={<Button label="‹ Catalogue" secondary onPress={() => router.replace("/training")} />}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingVertical: 12, paddingBottom: 24 }}>
    {axis !== "trick-value" ? <Text accessibilityRole="header" style={styles.heading}>{puzzleTitle(axis)} · {levelName(axis, level)}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!run && !error ? <Text style={styles.body}>Préparation de la série…</Text> : null}
    {run?.finished ? <View style={[trainingPanel, { flex: undefined, flexShrink: 0 }]}><Text accessibilityRole="header" style={styles.heading}>Résultat : {run.score} / 10</Text><Text style={styles.body}>{saved ? "Progression locale enregistrée." : saving ? "Enregistrement…" : "Progression non enregistrée."}</Text><Text style={styles.body}>{sync}</Text>{run.score >= 8 ? <Text style={styles.body}>Seuil de progression atteint : retrouve les niveaux débloqués dans le catalogue.</Text> : null}{error ? <Button label="Réessayer l’enregistrement" disabled={saving} onPress={() => retry((n) => n + 1)} /> : null}<Button label="Retour aux niveaux" disabled={saving} onPress={() => router.replace("/training")} /></View> : run && puzzle ? <>
      <Text style={styles.body}>Question {run.index + 1} / 10 · Score {run.score}</Text>
      {(puzzle.kind === "cards" || puzzle.kind === "voids") && studying ? <Observation exercise={puzzle.data} onAnswer={() => study(false)} /> : <>
        {puzzle.kind === "number" ? <NumberExercise exercise={puzzle.data} value={answer} onChange={setAnswer} onSubmit={() => submit({ kind: "number", value: Number(answer) })} disabled={run.grade !== null} guide={level === 1} /> : null}
        {puzzle.kind === "cards" ? <MemoryQuestion key={run.index} exercise={puzzle.data} disabled={run.grade !== null} onSubmit={submit} /> : null}
        {puzzle.kind === "voids" ? <VoidsQuestion key={run.index} exercise={puzzle.data} disabled={run.grade !== null} onSubmit={submit} /> : null}
        {puzzle.kind === "bidding" ? <BiddingQuestion key={run.index} exercise={puzzle.data} disabled={run.grade !== null} onSubmit={(value) => submit({ kind: "bidding", value })} /> : null}
        {puzzle.kind === "reading" ? <ReadingQuestion key={run.index} exercise={puzzle.data} disabled={run.grade !== null} onSubmit={(value) => submit({ kind: "reading", value })} /> : null}
        {run.grade !== null ? <View accessibilityLiveRegion="polite" style={[trainingPanel, { flex: undefined, flexShrink: 0 }]}><Text style={styles.heading}>{run.grade === 1 ? "Bonne réponse !" : "Réponse à revoir"} · {run.grade} point</Text><PuzzleCorrection puzzle={puzzle} />{axis !== "trick-value" || level !== 2 ? <Button label={run.index === 9 ? "Voir le résultat" : "Exercice suivant"} onPress={next} /> : null}</View> : null}
      </>}
    </> : null}
  </ScrollView></Screen>;
}

