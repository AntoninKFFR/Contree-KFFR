import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AccountGate } from "@/components/AccountGate";
import { Button, DetailDialog, ErrorMessage, Screen, styles, useGameLayout } from "@/components/ui";
import { useSolo } from "@/solo/useSolo";
import { cardKey, suits, type Card, type SoloIntent } from "@/solo/contract";
import { tokens as t } from "@/theme/tokens";

const suitNames = { clubs: "Trèfle", diamonds: "Carreau", hearts: "Cœur", spades: "Pique" };
const symbols = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const rankNames = { "7": "Sept", "8": "Huit", "9": "Neuf", "10": "Dix", J: "Valet", Q: "Dame", K: "Roi", A: "As" };
export const cardLabel = (card: Card) => rankNames[card.rank] + " de " + suitNames[card.suit].toLocaleLowerCase("fr");

export default function SoloScreen() { return <AccountGate bottomInset><SoloRoom /></AccountGate>; }
function SoloRoom() {
  const { state, controller } = useSolo();
  const { compact, largeText } = useGameLayout();
  const [dialog, setDialog] = useState<"table" | "bid" | "new" | "actions" | "error" | null>(null);
  const [selection, setSelection] = useState<{ id: string; version: number; card: Card } | null>(null);
  const [bid, setBid] = useState(80), [suit, setSuit] = useState<Card["suit"]>("spades");
  const [tableFocused, setTableFocused] = useState(false);
  const session = state.session, game = session?.state;
  const tableCards = game?.currentTrick.cards.length ? game.currentTrick.cards : game?.lastTrick?.cards ?? [];
  const selected = selection?.id === session?.id && selection?.version === session?.version ? selection?.card ?? null : null;
  const ready = Boolean(controller && !state.busy && !state.requiresSync && !state.error);
  const human = ready && state.active && game?.currentPlayerId === 0;
  useEffect(() => {
    if (!state.active || !ready || !game || !["bidding", "playing"].includes(game.phase) || game.currentPlayerId === 0) return;
    const timer = setTimeout(() => { void controller?.move({ type: "advance-bot" }); }, 600);
    return () => clearTimeout(timer);
  }, [state.active, ready, game, controller]);
  async function send(intent: SoloIntent) {
    await controller?.move(intent);
    if (controller && !controller.state.error) setDialog(null);
  }
  const actionButtons = <>
    {state.error ? <><Text accessibilityRole="alert" style={styles.hint}>Action interrompue</Text><Button label="Détails" secondary onPress={() => setDialog("error")} /><Button label="Recharger" secondary onPress={() => { void controller?.load(); }} disabled={state.busy} /></>
      : game?.phase === "bidding" ? <>
        <Button label="Enchérir" disabled={!human} onPress={() => setDialog("bid")} />
        <Button label="Passer" secondary disabled={!human} onPress={() => { void send({ type: "pass", playerId: 0 }); }} />
      </> : game?.phase === "playing" ? <Button label={selected ? "Poser la carte" : "Choisis une carte"} disabled={!human || !selected} onPress={() => { if (selected) void send({ type: "play-card", playerId: 0, card: selected }); }} />
      : game?.phase === "finished" ? <Button label="Manche suivante" disabled={!ready} onPress={() => { void send({ type: "start-next-round" }); }} />
      : <Text style={styles.body}>{game?.winnerTeam === 0 ? "Victoire !" : game?.winnerTeam === 1 ? "Défaite" : "Partie terminée."}</Text>}
  </>;
  return <Screen bottomInset back title="Solo" headerAction={game ? <Pressable accessibilityRole="button" accessibilityLabel="Joueurs, enchères et scores" onPress={() => setDialog("table")} onFocus={() => setTableFocused(true)} onBlur={() => setTableFocused(false)} style={({ pressed }) => [s.headerAction, tableFocused && t.focus, pressed && { backgroundColor: t.colors.raised }]}><Text style={s.headerLabel}>Table</Text></Pressable> : undefined}>
    <View testID="solo-screen" style={s.root} aria-hidden={dialog !== null} accessibilityElementsHidden={dialog !== null} importantForAccessibility={dialog !== null ? "no-hide-descendants" : "auto"}>
      {!state.active ? <View style={styles.row}>
        <View style={s.lobbyBrand}><Text accessibilityRole="header" style={s.title}>À toi de jouer.</Text>{!largeText ? <Text style={styles.body}>Solo · Contrée KFFR</Text> : null}</View>
        <View testID="game-panel" style={styles.panel}>
          {state.busy || !state.hydrated ? <><ActivityIndicator color={t.colors.accent} accessibilityLabel="Chargement Solo" /><Text style={styles.body}>Recherche de ta partie…</Text></> : <>
            <Text accessibilityRole="header" style={styles.heading}>{session ? "Partie sauvegardée" : "Ta prochaine partie"}</Text>
            {state.error ? <ErrorMessage message={state.error} /> : !largeText ? <Text style={styles.body}>{session ? "Manche " + game?.roundNumber + " · Nous " + game?.totalScore[0] + " / Eux " + game?.totalScore[1] : "Les mêmes règles, face aux bots KFFR."}</Text> : null}
            {state.requiresSync ? <Button label="Réessayer" secondary onPress={() => { void controller?.load(); }} /> : session ? <Button label="Reprendre" onPress={() => controller?.resume()} /> : null}
            <Button label="Nouvelle partie" secondary={Boolean(session)} disabled={state.busy || !state.hydrated} onPress={() => { if (session) setDialog("new"); else void controller?.start(); }} />
          </>}
        </View>
      </View> : game ? <>
        <View style={s.upper}>
          <View testID="game-panel" style={s.table}>
            <Text style={s.score}>Nous {game.totalScore[0]} · Eux {game.totalScore[1]}</Text>
            {!largeText ? <Text style={styles.hint}>Manche {game.roundNumber}{game.contract ? " · " + game.contract.value + " " + game.contract.label : " · Enchères"}{!game.currentTrick.cards.length && game.lastTrick ? " · Dernier pli" : ""}</Text> : null}
            {tableCards.length ? <View style={s.trick}>{tableCards.map((play) => <View key={play.playerId} style={s.trickSeat}><CardFace card={play.card} /><Text style={s.seatLabel}>{play.playerId === 0 ? "Toi" : "J" + (play.playerId + 1)}</Text></View>)}</View>
              : <Text style={s.tableHint}>{game.result ? (game.phase === "game-over" ? "Partie terminée" : "Fin de manche") : game.phase === "bidding" ? "Les enchères" : "Le pli commence"}</Text>}
          </View>
          <View testID="game-panel" style={s.actions}>
            {state.busy ? <ActivityIndicator accessibilityLabel="Synchronisation Solo" color={t.colors.accent} /> : <Text style={styles.hint}>{game.phase === "finished" || game.phase === "game-over" ? "Résultat" : game.currentPlayerId === 0 ? "À toi de jouer" : "Tour du joueur " + (game.currentPlayerId + 1)}</Text>}
            {largeText ? <Button label="Actions" onPress={() => setDialog("actions")} /> : actionButtons}
          </View>
        </View>
        <View style={s.hand} accessibilityLabel="Ta main">{game.hand.map((card) => <Pressable key={cardKey(card)} accessibilityRole="button" accessibilityLabel={cardLabel(card)} accessibilityState={{ selected: selected !== null && cardKey(selected) === cardKey(card), disabled: !human || game.phase !== "playing" }} disabled={!human || game.phase !== "playing"} onPress={() => { if (session) setSelection({ id: session.id, version: session.version, card }); }} style={[s.handCard, selected !== null && cardKey(selected) === cardKey(card) && s.selected]}>
          <CardFace card={card} compact={compact} />
        </Pressable>)}</View>
      </> : null}
    </View>
    <DetailDialog visible={dialog === "new"} title="Nouvelle partie" onClose={() => setDialog(null)}>
      <Text style={styles.body}>La reprise sur cet appareil pointera vers la nouvelle partie. La partie actuelle ne sera pas effacée du serveur.</Text>
      <Button label="Commencer" disabled={state.busy} onPress={() => { setDialog(null); void controller?.start(); }} />
    </DetailDialog>
    <DetailDialog visible={dialog === "table"} title="La table" onClose={() => setDialog(null)}>
      {game ? <><Text style={styles.heading}>Manche {game.roundNumber} · Nous {game.totalScore[0]} / Eux {game.totalScore[1]}</Text>
        <Text style={styles.body}>{game.contract ? "Contrat : " + game.contract.value + " " + game.contract.label : "Enchères en cours"}</Text>
        {([0, 1, 2, 3] as const).map((p) => <Text key={p} style={styles.body}>{p === 0 ? "Toi" : "Joueur " + (p + 1)} : {game.playerNames[p]} · {game.handCounts[p]} cartes</Text>)}
        {game.result ? <Text accessibilityRole="header" style={styles.heading}>{game.result}</Text> : null}
        <Text style={styles.body}>{game.message}</Text>
        {game.bids.map((bid, index) => <Text key={index} style={styles.body}>{bid}</Text>)}
        <Button label="Nouvelle partie" secondary onPress={() => setDialog("new")} />
      </> : null}
    </DetailDialog>
    <DetailDialog visible={dialog === "actions"} title="Actions Solo" onClose={() => setDialog(null)}>{actionButtons}</DetailDialog>
    <DetailDialog visible={dialog === "error"} title="Synchronisation Solo" onClose={() => setDialog(null)}><Text accessibilityRole="alert" style={styles.body}>{state.error}</Text></DetailDialog>
    <DetailDialog visible={dialog === "bid"} title="Ton enchère" onClose={() => setDialog(null)}>
      <Text style={styles.body}>Les enchères sont validées à la table. Tu peux passer si tu ne souhaites pas annoncer.</Text>
      <View style={s.bidRow}><Button label="−10" accessibilityLabel="Réduire l’enchère" disabled={bid <= 80 || state.busy} secondary onPress={() => setBid((value) => value - 10)} /><Text style={styles.heading}>{bid}</Text><Button label="+10" accessibilityLabel="Augmenter l’enchère" disabled={bid >= 160 || state.busy} secondary onPress={() => setBid((value) => value + 10)} /></View>
      <View style={s.bidRow}>{suits.map((value) => <View key={value} style={s.suitChoice}><Button label={suitNames[value]} accessibilityLabel={"Atout " + suitNames[value] + (suit === value ? ", sélectionné" : "")} secondary={suit !== value} disabled={state.busy} onPress={() => setSuit(value)} /></View>)}</View>
      {state.error ? <ErrorMessage message={state.error} /> : null}
      <Button label={state.busy ? "Envoi…" : "Annoncer " + bid} disabled={!human} onPress={() => { void send({ type: "bid", playerId: 0, value: bid as 80, contractMode: { kind: "suit", suit } }); }} />
    </DetailDialog>
  </Screen>;
}
function CardFace({ card, compact = false }: { card: Card; compact?: boolean }) {
  return <View style={[s.cardFace, compact && s.compactCard]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Text allowFontScaling={false} style={[s.cardRank, (card.suit === "hearts" || card.suit === "diamonds") && s.red]}>{card.rank}</Text>
    <Text allowFontScaling={false} style={[s.cardSuit, (card.suit === "hearts" || card.suit === "diamonds") && s.red]}>{symbols[card.suit] + "\uFE0E"}</Text>
  </View>;
}
const s = StyleSheet.create({
  headerAction: { minWidth: 44, height: 44, paddingHorizontal: t.spacing.xs, alignItems: "center", justifyContent: "center", borderRadius: t.radius.sm },
  headerLabel: { ...t.type.label, color: t.colors.accent },
  root: { flex: 1, minHeight: 0, gap: t.spacing.xs },
  lobbyBrand: { flex: 0.8, minWidth: 0, justifyContent: "center", alignItems: "center", gap: t.spacing.sm },
  title: { ...t.type.displayCompact, color: t.colors.text, textAlign: "center" },
  upper: { flex: 1, minHeight: 0, flexDirection: "row", gap: t.spacing.sm },
  table: { flex: 1.5, minWidth: 0, minHeight: 0, alignItems: "center", justifyContent: "center", padding: t.spacing.xxs, gap: t.spacing.xxs, borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radius.lg },
  score: { ...t.type.label, color: t.colors.accent, textAlign: "center", maxWidth: "100%" },
  tableHint: { ...t.type.heading, color: t.colors.text, textAlign: "center", maxWidth: "100%" },
  actions: { flex: 1, minWidth: 0, minHeight: 0, justifyContent: "center", gap: t.spacing.xs },
  hand: { flexDirection: "row", justifyContent: "center", gap: t.spacing.xxs, height: 72 },
  handCard: { flex: 1, minWidth: 44, maxWidth: 64, height: 72, borderWidth: 2, borderColor: t.colors.paper, borderRadius: t.radius.sm, backgroundColor: t.colors.paper, justifyContent: "center" },
  selected: { borderColor: t.colors.accent, boxShadow: t.shadow.card, transform: [{ translateY: -2 }] },
  cardFace: { minWidth: 40, height: 64, padding: t.spacing.xxs, borderRadius: t.radius.sm, backgroundColor: t.colors.paper, justifyContent: "center" },
  compactCard: { height: 60 },
  cardRank: { color: t.colors.cardInk, fontFamily: "Georgia", fontSize: 19, lineHeight: 23 },
  cardSuit: { color: t.colors.cardInk, fontSize: 27, lineHeight: 29, textAlign: "center" },
  red: { color: t.colors.cardRed },
  trick: { flexDirection: "row", gap: t.spacing.xxs },
  trickSeat: { alignItems: "center", minWidth: 40, maxWidth: 52 },
  seatLabel: { ...t.type.caption, color: t.colors.muted },
  bidRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.spacing.xs, flexWrap: "wrap" },
  suitChoice: { flexGrow: 1, minWidth: 100 },
});
