import { ChallengeScreen } from "@/training/challenge-screen";
import { PileScreen } from "@/training/pile-screen";
import { ConventionsScreen } from "@/training/conventions-screen";
import { DuoScreen } from "@/training/duo-screen";
import { TrainingGameScreen } from "@/training/game-screen";
import { parsePileCountMode } from "@/engine/training/pileCount";
import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { Screen, styles } from "@/components/ui";
import { isPuzzleAxis } from "@/training/catalogue";
import { PuzzleScreen } from "@/training/puzzle-screen";
export default function ExerciseRoute() {
  const { axis, level = "1", mode } = useLocalSearchParams<{ axis: string; level?: string; mode?: string }>();
  if (axis === "challenge" && (mode === "survival" || mode === "blitz")) return <ChallengeScreen key={mode} mode={mode} />;
  if (axis === "pile-count" && parsePileCountMode(mode)) return <PileScreen key={mode} mode={parsePileCountMode(mode)!} />;
  if (axis === "conventions") return <ConventionsScreen />;
  if (axis === "duo") return <DuoScreen />;
  if (axis === "game") return <TrainingGameScreen />;
  if (isPuzzleAxis(axis)) return <PuzzleScreen key={`${axis}:${level}`} axis={axis} level={Number(level)} />;
  return <Screen title="Entraînement" back><Text style={styles.body}>Parcours inconnu. Reviens au catalogue.</Text></Screen>;
}
