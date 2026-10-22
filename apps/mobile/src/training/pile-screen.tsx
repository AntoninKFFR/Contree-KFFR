import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { Host, Slider } from "@expo/ui";
import { useRouter } from "expo-router";
import { Button, Screen, styles } from "@/components/ui";
import { generatePileCountSeries, pileGeneratorVersion, type PileCountMode, type PileCountExercise } from "@/engine/training/pileCount";
import { isPileCountModeUnlocked, pileCountSeriesSeed, recordPileCountSeries } from "@/lib/training/progress";
import { continuousClock } from "./challenge";
import { PILE_NAMES, PILE_DESCRIPTIONS } from "./catalogue";
import { Cards, NumberPad, Trump, ValueGuide } from "./primitives";
import { useTraining } from "./provider";
export function PileScreen({ mode }: { mode: PileCountMode }) {
  const { progress, store, refresh } = useTraining(), router = useRouter();
  const [series, setSeries] = useState<PileCountExercise[] | null>(null), [index, setIndex] = useState(0), [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<"briefing" | "scrolling" | "answer" | "feedback" | "finished">("briefing"), phaseRef = useRef(phase);
  const [paused, pause] = useState(false), [delay, setDelay] = useState(1000), [answer, setAnswer] = useState(""), [score, setScore] = useState(0), [correct, setCorrect] = useState(false), [review, setReview] = useState(false);
  const [elapsed, setElapsed] = useState(0), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false), [attempt, retry] = useState(0);
  const time = useRef(continuousClock()), start = useRef(0), total = useRef(0), seed = useRef(0), deadline = useRef(0), position = useRef(0);
  const exercise = series?.[index], manual = mode === "manual", cardDelay = mode === "beginner" ? 1500 : mode === "normal" ? 800 : delay;
  const phaseTo = useCallback((next: typeof phase) => { phaseRef.current = next; setPhase(next); }, []);
  const hasProgress = Boolean(progress);
  const [totalTime, setTotalTime] = useState(0);
  useEffect(() => {
    if (!progress) return;
    const timer = setTimeout(() => { try { if (!isPileCountModeUnlocked(progress, mode)) throw Error("Réussis 8/10 en Débutant pour débloquer Normal."); seed.current = pileCountSeriesSeed(progress, mode); setSeries(generatePileCountSeries({ seed: seed.current, generatorVersion: pileGeneratorVersion })); } catch (e) { setError((e as Error).message); } }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasProgress]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (s) => { if (s !== "active" && phaseRef.current === "scrolling" && !manual) pause(true); });
    return () => listener.remove();
  }, [manual]);
  useEffect(() => {
    if (!exercise || phase !== "scrolling" || paused || manual) return;
    deadline.current = time.current() + cardDelay;
    const timer = setInterval(() => {
      if (AppState.currentState !== "active" || time.current() < deadline.current) return;
      deadline.current += cardDelay;
      if (position.current < exercise.cards.length - 1) { position.current += 1; setShown(position.current); }
      else phaseTo("answer");
    }, 25);
    return () => clearInterval(timer);
  }, [exercise, phase, paused, manual, cardDelay, phaseTo]);
  useEffect(() => {
    if (!manual || !["scrolling", "answer"].includes(phase)) return;
    const timer = setInterval(() => setElapsed(time.current() - start.current), 100);
    return () => clearInterval(timer);
  }, [manual, phase]);
  useEffect(() => {
    if (phase !== "finished") return; let active = true;
    void store.commit(`pile:${mode}:${seed.current}`, (p) => recordPileCountSeries(p, mode, score, manual ? Math.max(1, total.current) : undefined)).then(() => { if (active) { setSaved(true); setError(null); refresh(); } }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, attempt]);
  const submit = () => {
    if (!exercise || phaseRef.current !== "answer" || !answer || AppState.currentState !== "active") return;
    phaseTo("feedback"); setCorrect(Number(answer) === exercise.answer);
    if (manual) { const spent = time.current() - start.current; total.current += spent; setElapsed(spent); }
  };
  const next = () => {
    if (phaseRef.current !== "feedback" || !series) return;
    const nextScore = score + Number(correct); setScore(nextScore); setAnswer(""); setReview(false);
    if (index === 9) { setTotalTime(total.current); phaseTo("finished"); } else { setIndex(index + 1); phaseTo("briefing"); }
  };
  return <Screen title="Compter son tas" bottomInset headerAction={<Button label="‹ Catalogue" secondary onPress={() => router.replace("/training")} />}><ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 16 }}><Text accessibilityRole="header" style={styles.heading}>Compter son tas · {PILE_NAMES[mode]}</Text><Text style={styles.body}>{PILE_DESCRIPTIONS[mode]}</Text>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{!series && !error ? <Text style={styles.body}>Préparation des tas…</Text> : null}{phase === "finished" ? <><Text accessibilityRole="header" style={styles.heading}>Résultat : {score} / 10{manual ? ` · ${(totalTime / 1000).toFixed(1)} s` : ""}</Text><Text style={styles.body}>{saved ? mode === "free" ? "Série locale enregistrée, sans record en Libre." : "Progression et record local enregistrés selon les règles du mode." : "Enregistrement…"}</Text>{error ? <Button label="Réessayer" onPress={() => retry((n) => n + 1)} /> : null}<Button label="Retour aux modes" onPress={() => router.replace("/training")} /></> : exercise ? <>
    <Text style={styles.body}>Tas {index + 1}/10 · Score {score}</Text><Trump suit={exercise.trump} /><Text style={styles.body}>Dix de der : {exercise.hasTenDeDer ? "oui" : "non"} · Belote : {exercise.hasBelote ? "oui" : "non"}</Text>
    {phase === "briefing" ? <>{mode === "free" ? <><Text style={styles.body}>Vitesse : {(delay / 1000).toFixed(1)} s par carte</Text><Host matchContents><Slider value={delay} min={300} max={3000} step={100} onValueChange={setDelay} /></Host></> : null}<Button label="Voir le tas" onPress={() => { position.current = 0; setShown(0); pause(false); start.current = time.current(); setElapsed(0); phaseTo("scrolling"); }} /></> : null}
    {manual && phase !== "briefing" ? <Text style={styles.body}>Chronomètre : {(elapsed / 1000).toFixed(1)} s</Text> : null}
    {phase === "scrolling" ? <><Text style={styles.body}>Carte {shown + 1}/{exercise.cards.length}</Text><Cards cards={[exercise.cards[shown]]} />{mode === "beginner" ? <Text style={styles.body}>{exercise.cardValues[shown]} points</Text> : null}{manual ? <View style={{ flexDirection: "row", gap: 12 }}><Button label="Carte précédente" secondary disabled={shown === 0} onPress={() => { position.current = Math.max(0, position.current - 1); setShown(position.current); }} /><Button label={shown === exercise.cards.length - 1 ? "Répondre" : "Carte suivante"} onPress={() => { if (position.current === exercise.cards.length - 1) phaseTo("answer"); else { position.current += 1; setShown(position.current); } }} /></View> : <Button label={paused ? "Reprendre le défilement" : "Pause"} secondary onPress={() => pause(!paused)} />}</> : null}
    {phase === "answer" ? <NumberPad value={answer} onChange={setAnswer} onSubmit={submit} /> : null}
    {phase === "feedback" ? <><Text accessibilityLiveRegion="polite" style={styles.heading}>{correct ? "Bonne réponse !" : "Réponse à revoir"}</Text><Text style={styles.body}>{exercise.cardPoints} points de cartes + {exercise.tenDeDerPoints} dix de der + {exercise.belotePoints} belote = {exercise.answer} points.</Text><Cards cards={exercise.cards} /><Button label={index === 9 ? "Voir le résultat" : "Tas suivant"} onPress={next} /></> : null}
    {mode === "beginner" ? <><ValueGuide /><Button label={review ? "Masquer le tas" : "Revoir les cartes du tas"} secondary onPress={() => setReview(!review)} />{review ? <Cards cards={exercise.cards} /> : null}</> : null}
  </> : null}</ScrollView></Screen>;
}

