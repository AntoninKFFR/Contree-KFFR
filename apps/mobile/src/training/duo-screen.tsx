import { trainingPanel } from "./panel";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { AppState, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useAccount } from "@/auth/AccountProvider";
import { Button, Screen, styles } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { subscribeToTrainingDuoRealtime } from "@/lib/trainingDuoRealtime";
import { BID_READING_LEVEL_NAMES, type BidReadingLevel } from "@/engine/training/bidReading";
import { NativeDuoController } from "./duo";
import { ReadingQuestion, ReadingCorrection } from "./auction";
import { DuoInvitations } from "./invitations";
export function DuoScreen() {
  const { session } = useAccount(), router = useRouter(), [, render] = useState(0);
  const [controller, setController] = useState<NativeDuoController | null>(null), [code, setCode] = useState(""), [level, setLevel] = useState<BidReadingLevel>(1);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const next = new NativeDuoController(session, AsyncStorage, () => { if (live) render((n) => n + 1); });
    Promise.resolve().then(() => { if (live) setController(next); }); void next.resume();
    return () => { live = false; next.dispose(); };
  }, [session]);
  const state = controller?.state, view = state?.view, id = view?.session.id;
  useEffect(() => {
    if (!controller || !id) return;
    const refresh = () => controller.load(id);
    const unsubscribe = supabase ? subscribeToTrainingDuoRealtime(supabase, id, refresh) : () => {};
    const timer = setInterval(() => { if (AppState.currentState === "active") { void controller.presence(); void refresh(); } }, 15000);
    const listener = AppState.addEventListener("change", (s) => { if (s === "active") { void controller.presence(); void refresh(); } });
    void refresh();
    return () => { unsubscribe(); clearInterval(timer); listener.remove(); };
  }, [controller, id]);
  const participant = view?.participants.find((p) => p.slot === view.viewerSlot), other = view?.participants.find((p) => p.slot !== view.viewerSlot);
  const busy = !controller || state?.busy === true;
  return <Screen title="Lire les enchères à deux" bottomInset headerAction={<Button label="‹ Catalogue" secondary onPress={() => router.replace("/training")} />}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 12, gap: 16 }}><Text accessibilityRole="header" style={styles.heading}>Lire les enchères à deux</Text><Text style={styles.body}>iPhone et web · Même série, deux réponses indépendantes.</Text>
    {state?.error ? <><Text accessibilityRole="alert" style={styles.error}>{state.error}</Text><Button label="Recharger la session" secondary disabled={busy} onPress={() => { void controller?.load(); }} /></> : null}
    {!view || state?.terminal ? <><Text style={styles.body}>Niveau de la série</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{([1, 2, 3, 4] as const).map((n) => <Button key={n} label={`${n} · ${BID_READING_LEVEL_NAMES[n]}`} secondary={n !== level} disabled={busy} onPress={() => setLevel(n)} />)}</View><Button label="Créer une session Duo" disabled={busy} onPress={() => { void controller?.create(level); }} /><TextInput style={[styles.body, { minHeight: 48, padding: 12, borderWidth: 1, borderColor: "#3E5E4B", borderRadius: 12 }]} accessibilityLabel="Code de session Duo" placeholder="Code de session" placeholderTextColor="#B5C9BA" autoCapitalize="characters" autoCorrect={false} maxLength={12} value={code} onChangeText={setCode} /><Button label="Rejoindre par code" disabled={busy || !code.trim()} onPress={() => { void controller?.join(code); }} /><DuoInvitations onJoined={(sessionId) => { void controller?.load(sessionId); }} /></> : <>
      <Text style={styles.heading}>{view.session.code ? `Code : ${view.session.code}` : "Session rejointe"} · Niveau {view.session.level}</Text><Text style={styles.hint}>Version {view.session.stateVersion} · {view.session.status}</Text>
      {view.participants.map((p) => <Text key={p.slot} style={styles.body}>{p.slot === view.viewerSlot ? "Toi" : p.displayName}{p.isHost ? " · Hôte" : ""} · {p.isConnected ? "connecté" : "déconnecté"}{p.hasAnswered ? " · réponse envoyée" : ""}</Text>)}
      {view.session.status === "lobby" ? <><Button label={participant?.isReady ? "Ne plus être prêt" : "Je suis prêt"} disabled={busy} onPress={() => { void controller?.intent({ type: "set-ready", ready: !participant?.isReady }); }} />{participant?.isHost ? <Button label="Commencer à deux" disabled={busy || view.participants.length !== 2 || !view.participants.every((p) => p.isReady)} onPress={() => { void controller?.intent({ type: "start" }); }} /> : <Text style={styles.body}>L’hôte lance la série lorsque vous êtes prêts.</Text>}<DuoInvitations sessionId={view.session.id} onJoined={(sessionId) => { void controller?.load(sessionId); }} /></> : null}
      {view.session.status === "active" && view.exercise ? <><Text style={styles.heading}>Question {view.session.currentIndex + 1} / 10</Text>{view.exercise.kind === "public" ? <ReadingQuestion key={`${id}:${view.session.currentIndex}`} exercise={view.exercise} disabled={busy || participant?.hasAnswered === true} onSubmit={(answer) => { void controller?.intent({ type: "submit-answer", answer }); }} /> : <><ReadingCorrection exercise={view.exercise} />{view.exercise.answers.map((a) => <Text key={a.slot} style={styles.body}>{a.slot === view.viewerSlot ? "Ta réponse" : other?.displayName ?? "Partenaire"} : {a.correct ? "correcte" : "à revoir"} · {a.score} point</Text>)}<Button label={participant?.readyForNext ? "En attente du partenaire…" : "Prêt pour la suite"} disabled={busy || participant?.readyForNext} onPress={() => { void controller?.intent({ type: "ready-next" }); }} /></>}{participant?.hasAnswered && view.exercise.kind === "public" ? <Text accessibilityLiveRegion="polite" style={styles.body}>Ta réponse est enregistrée. En attente de l’autre joueur.</Text> : null}</> : null}
      {view.result ? <View style={[trainingPanel, { flex: undefined, flexShrink: 0 }]}><Text accessibilityRole="header" style={styles.heading}>Série terminée</Text><Text style={styles.body}>Joueur 1 : {view.result.scoreA}/10 · Joueur 2 : {view.result.scoreB}/10 · Réussites communes : {view.result.commonSuccesses}</Text></View> : null}
      {view.session.status === "cancelled" ? <Text style={styles.body}>Session terminée : {view.session.cancelReason ?? "annulée"}.</Text> : null}
      {["completed", "cancelled"].includes(view.session.status) ? <Button label="Nouvelle session Duo" onPress={() => { void controller?.closeCompleted(); }} /> : null}
      <Button label="Quitter la session Duo" secondary disabled={busy} onPress={() => { void controller?.intent({ type: "leave" }); }} />
    </>}
  </ScrollView></Screen>;
}
