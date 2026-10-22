import { trainingPanel } from "./panel";
import { TrainingLeaderboard } from "./leaderboard";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Screen, styles } from "@/components/ui";
import { tokens } from "@/theme/tokens";
import { catalogue, isPuzzleAxis, levelName, type CatalogueItem } from "./catalogue";
import { useTraining } from "./provider";

function ModeCard({ item }: { item: CatalogueItem }) {
  const router = useRouter(), { progress, records } = useTraining();
  const [selected, select] = useState(item.level);
  const max = progress && isPuzzleAxis(item.axis) ? progress.axes[item.axis].unlockedLevel : 1;
  const local = progress && isPuzzleAxis(item.axis) ? progress.axes[item.axis].levels[selected as 1] : null;
  const record = records.find((r) => r.axisId === item.axis && r.level === selected);
  return <View testID={`training-mode:${item.axis}:${item.mode ?? ""}`} style={[trainingPanel, { justifyContent: "flex-start", width: "100%", maxWidth: 680 }]}>
    <Text accessibilityRole="header" style={styles.heading}>{item.title}</Text><Text style={styles.body}>{item.description}</Text>
    {item.levels ? <><Text style={styles.hint}>Niveau {selected} · {isPuzzleAxis(item.axis) ? levelName(item.axis, selected) : ""} · {max}/{item.levels} niveaux débloqués</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{Array.from({ length: item.levels }, (_, i) => i + 1).map((level) => <Button key={level} label={`${selected === level ? "✓ " : ""}${level}${level > max ? " 🔒" : ""}`} accessibilityLabel={`Niveau ${level}${level > max ? " verrouillé" : selected === level ? " sélectionné" : ""}`} disabled={level > max} secondary={selected !== level} onPress={() => select(level)} />)}</View></> : null}
    {local?.completedSeries ? <Text style={styles.body}>Record local · {local.bestScore} / 10 · {local.completedSeries} série(s)</Text> : item.record ? <Text style={styles.body}>{item.record}</Text> : null}
    {record ? <Text style={[styles.body, { color: tokens.colors.accent }]}>Record compte · {record.bestScore} / 10{record.bestDurationMs !== null ? ` · ${(record.bestDurationMs / 1000).toFixed(1)} s` : ""}</Text> : null}
    {!item.unlocked ? <Text style={styles.hint}>{item.axis === "challenge" ? "Réussis 8/10 en Confirmé pour débloquer ce mode." : "Réussis 8/10 en Débutant pour débloquer ce mode."}</Text> : null}
    <Button label="Commencer" accessibilityLabel={`Commencer ${item.title}`} disabled={!item.unlocked} onPress={() => router.push({ pathname: "/training/[axis]", params: { axis: item.axis, level: selected, ...(item.mode ? { mode: item.mode } : {}) } })} />
  </View>;
}
export function TrainingCatalogue() {
  const { progress, error, recordsError, refresh } = useTraining();
  return <Screen title="Entraînement" back bottomInset><ScrollView testID="training-catalogue" contentContainerStyle={{ paddingVertical: 12, gap: 16, alignItems: "center" }}>
    <Text accessibilityRole="header" style={styles.heading}>Entraînement</Text><Text style={styles.body}>Calcul, mémoire, lecture du jeu et enchères.</Text>
    <Text style={styles.hint}>Les niveaux et records locaux restent sur cet iPhone et ce compte. Les déblocages du navigateur ne sont pas transférés. Les records vérifiés du compte sont affichés séparément.</Text>
    {error || recordsError ? <><Text accessibilityRole="alert" style={styles.error}>{error ?? recordsError}</Text><Button label="Réessayer" secondary onPress={refresh} /></> : null}
    {!progress && !error ? <Text style={styles.body}>Chargement de la progression…</Text> : null}
    {progress ? catalogue(progress).map((section) => <View key={section.title} style={{ width: "100%", maxWidth: 680, gap: 12 }}><Text accessibilityRole="header" style={[styles.heading, { color: tokens.colors.accent }]}>{section.title}</Text>{section.items.map((item) => <ModeCard key={`${item.axis}:${item.mode ?? ""}`} item={item} />)}</View>) : null}
    <TrainingLeaderboard />
  </ScrollView></Screen>;
}

