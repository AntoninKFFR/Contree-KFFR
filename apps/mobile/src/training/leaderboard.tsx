import { trainingPanel } from "./panel";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, styles } from "@/components/ui";
import { useAccount } from "@/auth/AccountProvider";
import { supabase } from "@/lib/supabase";
import { PERSISTABLE_PUZZLE_AXES, type PersistablePuzzleAxisId } from "@/engine/training/seriesContract";
import { parseTrainingLeaderboardRows, type TrainingLeaderboardEntry } from "@/lib/training/leaderboard";
import { levelCount, puzzleTitle } from "./catalogue";
export function TrainingLeaderboard() {
  const { session } = useAccount();
  const [axis, setAxis] = useState<PersistablePuzzleAxisId>("trick-value"), [level, setLevel] = useState(1), [epoch, retry] = useState(0);
  const [result, setResult] = useState<{ key: string; entries?: TrainingLeaderboardEntry[]; error?: string } | null>(null);
  const key = `${session?.user.id}:${axis}:${level}:${epoch}`;
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        if (!supabase || !session) throw Error("unavailable");
        const { data, error } = await supabase.rpc("get_friends_training_leaderboard", { p_axis_id: axis, p_level: level }).abortSignal(abort.signal);
        if (error) throw error;
        const entries = parseTrainingLeaderboardRows(data);
        if (!abort.signal.aborted) setResult({ key, entries });
      } catch { if (!abort.signal.aborted) setResult({ key, error: "Classement indisponible pour le moment." }); }
    })();
    return () => abort.abort();
  }, [axis, level, key, session]);
  const current = result?.key === key ? result : null;
  return <View style={[trainingPanel, { width: "100%", maxWidth: 680 }]}><Text accessibilityRole="header" style={styles.heading}>Classement entre amis</Text><Text style={styles.hint}>Records de compte vérifiés uniquement.</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(Object.keys(PERSISTABLE_PUZZLE_AXES) as PersistablePuzzleAxisId[]).map((id) => <Button key={id} label={puzzleTitle(id)} secondary={axis !== id} onPress={() => { setAxis(id); setLevel(1); }} />)}</View><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{Array.from({ length: levelCount(axis) }, (_, i) => i + 1).map((n) => <Button key={n} label={`Niveau ${n}`} secondary={n !== level} onPress={() => setLevel(n)} />)}</View>{!current ? <Text style={styles.body}>Chargement du classement…</Text> : current.error ? <><Text style={styles.error}>{current.error}</Text><Button label="Recharger le classement" secondary onPress={() => retry((n) => n + 1)} /></> : current.entries?.length ? current.entries.map((entry, i) => <Text key={`${entry.username}:${i}`} style={styles.body}>{i + 1}. {entry.username} · {entry.bestScore} / 10{entry.bestDurationMs !== null ? ` · ${(entry.bestDurationMs / 1000).toFixed(1)} s` : ""}</Text>) : <Text style={styles.body}>Aucun record à afficher pour ce niveau.</Text>}</View>;
}
