import { trainingPanel } from "./panel";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SoloRoom } from "@/app/(connected)/solo";
import { useAccount } from "@/auth/AccountProvider";
import { Screen, Button, styles } from "@/components/ui";
import { defaultInGameConfiguration, parseInGameConfiguration } from "@/lib/training/inGameConfiguration";
import { type InGameConfiguration } from "@/lib/training/inGameScheduler";
import { useTraining } from "./provider";
import { puzzleTitle } from "./catalogue";
export function TrainingGameScreen() {
  const { progress } = useTraining(), { session } = useAccount(), router = useRouter();
  const [configuration, configure] = useState(defaultInGameConfiguration), [playing, play] = useState(false), [loaded, load] = useState(false), [error, setError] = useState<string | null>(null);
  const key = `coinche:ios-training-game-settings:v1:${session?.user.id}`;
  const hasProgress = Boolean(progress);
  useEffect(() => {
    if (!progress) return; let live = true;
    void AsyncStorage.getItem(key).then((raw) => { if (live) { configure(parseInGameConfiguration(raw, progress)); load(true); } }).catch(() => { if (live) setError("Configuration locale indisponible."); });
    return () => { live = false; };
    // Read once before editing; a record refresh cannot overwrite choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasProgress]);
  function change(next: InGameConfiguration) { configure(next); }
  if (playing) return <SoloRoom training={configuration} />;
  return <Screen title="Entraînement en partie" bottomInset headerAction={<Button label="‹ Catalogue" secondary onPress={() => router.replace("/training")} />}><ScrollView contentContainerStyle={{ gap: 16, paddingVertical: 12 }}><Text accessibilityRole="header" style={styles.heading}>Entraînement en partie</Text><Text style={styles.body}>La table Solo officielle et ses bots. Les questions mettent le jeu en pause après les plis prévus. La reprise d’entraînement est distincte de ta partie Solo.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<Text style={styles.body}>Questions par manche</Text><View style={{ flexDirection: "row", gap: 8 }}>{([1, 2, 3] as const).map((n) => <Button key={n} label={String(n)} secondary={configuration.budgetPerRound !== n} onPress={() => change({ ...configuration, budgetPerRound: n })} />)}</View>{configuration.axes.map((axis) => <View key={axis.id} style={[trainingPanel, { flex: undefined, flexShrink: 0 }]}><Button label={`${axis.enabled ? "✓ " : ""}${puzzleTitle(axis.id)}`} secondary={!axis.enabled} onPress={() => change({ ...configuration, axes: configuration.axes.map((a) => a.id === axis.id ? { ...a, enabled: !a.enabled } : a) })} /><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{Array.from({ length: progress?.axes[axis.id].unlockedLevel ?? 1 }, (_, i) => i + 1).map((level) => <Button key={level} label={`Niveau ${level}`} secondary={axis.level !== level} onPress={() => change({ ...configuration, axes: configuration.axes.map((a) => a.id === axis.id ? { ...a, level } : a) })} />)}</View></View>)}<Button label="Ouvrir la table d’entraînement" disabled={!loaded || !configuration.axes.some((a) => a.enabled)} onPress={() => { void AsyncStorage.setItem(key, JSON.stringify({ version: 1, ...configuration })).then(() => play(true)).catch(() => setError("Configuration non enregistrée. Réessaie.")); }} /></ScrollView></Screen>;
}
