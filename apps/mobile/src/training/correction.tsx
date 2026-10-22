import { Text, View } from "react-native";
import { styles } from "@/components/ui";
import { Cards } from "./primitives";
import { ReadingCorrection } from "./auction";
import type { NativePuzzle } from "./puzzles";
import { formatBiddingAnswer } from "@/engine/training/bidding";
import { explainBiddingTrace } from "@/engine/training/biddingFeedback";
import { cardId, SUIT_LABELS } from "@/engine/cards";
import type { PlayerId, Suit } from "@/engine/types";
export function PuzzleCorrection({ puzzle }: { puzzle: NativePuzzle }) {
  if (puzzle.kind === "number") return <Text style={styles.body}>Ce pli vaut {puzzle.data.answer} points, dont {puzzle.data.bonusPoints} de bonus du dernier pli.</Text>;
  if (puzzle.kind === "reading") return <ReadingCorrection exercise={puzzle.data} />;
  if (puzzle.kind === "bidding") return <><Text style={styles.heading}>Réponse : {formatBiddingAnswer(puzzle.data.expected)}</Text><Text style={styles.body}>{explainBiddingTrace(puzzle.data.trace)}</Text></>;
  if (puzzle.kind === "cards") {
    const e = puzzle.data;
    return <View style={{ gap: 8 }}><Text style={styles.heading}>Cartes attendues</Text>{e.expectedIds.length ? <Cards cards={e.candidates.filter((c) => e.expectedIds.includes(cardId(c)))} /> : <Text style={styles.body}>Aucune carte</Text>}{e.requiresPlayers ? e.expectedIds.map((id) => <Text key={id} style={styles.body}>{id} : {e.playerNames[e.expectedPlayers[id]!]}</Text>) : null}</View>;
  }
  const e = puzzle.data;
  return <View style={{ gap: 8 }}><Text style={styles.heading}>Coupures prouvées</Text>{e.expectedCells.length ? e.expectedCells.map((cell) => { const [p, suit] = cell.split(":"); return <Text key={cell} style={styles.body}>{e.playerNames[Number(p) as PlayerId]} · {SUIT_LABELS[suit as Suit]}{e.proofs[cell] ? ` · preuve au pli ${e.proofs[cell].trickNumber}` : ""}</Text>; }) : <Text style={styles.body}>Aucune coupure certaine.</Text>}{e.expectedTrumpCount !== null ? <Text style={styles.body}>Atouts encore chez les autres : {e.expectedTrumpCount}</Text> : null}</View>;
}
