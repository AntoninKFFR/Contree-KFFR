import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import type { TrickValueExercise } from "@/engine/training/trickValue";
import { Button, styles } from "@/components/ui";
import { NumberPad, PlayedCards, Trump, ValueGuide } from "./primitives";
export function NumberExercise({ exercise, value, onChange, onSubmit, disabled, guide = false }: { exercise: TrickValueExercise; value: string; onChange: (v: string) => void; onSubmit: () => void; disabled: boolean; guide?: boolean }) {
  const { width, height, fontScale } = useWindowDimensions(), [help, showHelp] = useState(false);
  const landscape = width > height && fontScale <= 1.3;
  return <View style={{ gap: 12 }}><View style={{ flexDirection: landscape ? "row" : "column", gap: 16, alignItems: "flex-start" }}>
    <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
      {exercise.contractMode.kind === "suit" ? <Trump suit={exercise.contractMode.suit} /> : null}
      <Text style={styles.body}>Pli {exercise.trickNumber}{exercise.isLastTrick ? " · Dix de der" : ""}</Text>
      <PlayedCards compact cards={exercise.cards} names={{ 0: "Toi", 1: "Gauche", 2: "Partenaire", 3: "Droite" }} />
      {guide ? <Button label={help ? "Masquer l’aide" : "Aide des valeurs"} secondary onPress={() => showHelp(!help)} /> : null}
    </View>
    <View style={landscape ? { width: width < 700 ? 200 : 280 } : { width: "100%" }}><NumberPad label="Points" value={value} onChange={onChange} onSubmit={onSubmit} disabled={disabled} /></View>
  </View>{guide && help ? <ValueGuide /> : null}</View>;
}
