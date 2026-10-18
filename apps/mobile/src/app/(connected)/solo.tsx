import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AccountGate } from "@/components/AccountGate";
import { Button, DetailDialog, ErrorMessage, Screen, styles, useGameLayout } from "@/components/ui";
import { useSolo } from "@/solo/useSolo";
import { cardKey, suits, type Card, type SoloIntent, type NativeSoloSession } from "@/solo/contract";
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
      : game?.phase === "bidding" ? <View style={[s.bidButtons, compact && s.compactBidButtons]}>
        <View style={s.bidButton}><Button label="Enchérir" disabled={!human} onPress={() => setDialog("bid")} /></View>
        <View style={s.bidButton}><Button label="Passer" secondary disabled={!human} onPress={() => { void send({ type: "pass", playerId: 0 }); }} /></View>
      </View> : game?.phase === "playing" ? <Button label={selected ? "Poser la carte" : "Choisis une carte"} disabled={!human || !selected} onPress={() => { if (selected) void send({ type: "play-card", playerId: 0, card: selected }); }} />
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
          <NativeTable game={game} compact={compact} />
          <View testID="game-panel" style={s.actions}>
            <View><Text style={s.score}>Nous {game.totalScore[0]} · Eux {game.totalScore[1]}</Text>
              {!largeText && !state.error ? <Text style={styles.hint}>Manche {game.roundNumber}{game.contract ? " · " + game.contract.value + " " + game.contract.label : " · Enchères"}</Text> : null}</View>
            {state.busy ? <ActivityIndicator accessibilityLabel="Synchronisation Solo" color={t.colors.accent} /> : !state.error ? <Text style={styles.hint}>{game.phase === "finished" || game.phase === "game-over" ? "Résultat" : game.currentPlayerId === 0 ? "À toi de jouer" : "Tour du joueur " + (game.currentPlayerId + 1)}</Text> : null}
            {largeText ? <Button label="Actions" onPress={() => setDialog("actions")} /> : actionButtons}
          </View>
        </View>
        <View style={s.hand} accessibilityLabel="Ta main, au Sud"><View accessible accessibilityLabel="Toi, au Sud" style={[s.southSeat, game.currentPlayerId === 0 && ["bidding", "playing"].includes(game.phase) && s.activeSeat]}><Text allowFontScaling={false} style={s.southLabel}>S</Text></View>{game.hand.map((card) => <Pressable key={cardKey(card)} accessibilityRole="button" accessibilityLabel={cardLabel(card)} accessibilityState={{ selected: selected !== null && cardKey(selected) === cardKey(card), disabled: !human || game.phase !== "playing" }} disabled={!human || game.phase !== "playing"} onPress={() => { if (session) setSelection({ id: session.id, version: session.version, card }); }} style={[s.handCard, selected !== null && cardKey(selected) === cardKey(card) && s.selected]}>
          <CardFace card={card} compact={compact} />
        </Pressable>)}{game.result && !game.hand.length && !largeText ? <Text style={[styles.body, s.roundResult]}>{game.result}</Text> : null}</View>
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
function NativeTable({ game, compact }: { game: NativeSoloSession["state"]; compact: boolean }) {
  const cards = game.currentTrick.cards.length ? game.currentTrick.cards : game.lastTrick?.cards ?? [];
  const last = !game.currentTrick.cards.length && Boolean(game.lastTrick);
  const turnActive = ["bidding", "playing"].includes(game.phase);
  const positions = { 0: s.southPlay, 1: s.westPlay, 2: s.northPlay, 3: s.eastPlay };
  return <View testID="solo-card-table" style={s.table}>
    <View pointerEvents="none" style={s.tableRail} />
    {([1, 2, 3] as const).map((player) => <View key={player} testID={"solo-seat-" + player} accessible accessibilityLabel={game.playerNames[player] + ", " + { 1: "Ouest, adversaire", 2: "Nord, partenaire", 3: "Est, adversaire" }[player] + ", " + game.handCounts[player] + " cartes masquées" + (turnActive && game.currentPlayerId === player ? ", à son tour" : "")}
      style={[s.seat, player === 1 ? s.westSeat : player === 2 ? s.northSeat : s.eastSeat, turnActive && game.currentPlayerId === player && s.activeSeat]}>
      <Text style={s.seatLabel}>{({ 1: "Ouest", 2: "Nord", 3: "Est" })[player]}</Text>
      <View style={s.backs} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{Array.from({ length: game.handCounts[player] }, (_, index) => <View key={index} testID={"solo-card-back-" + player} style={[s.cardBack, { left: index * 5 }]} />)}</View>
    </View>)}
    {last ? <Text accessibilityLabel="Dernier pli terminé" style={s.lastTrick}>Pli préc.</Text> : null}
    <View style={[s.trick, compact && s.compactTrick]}>
      {cards.map((play) => <View key={play.playerId} testID={"solo-play-" + play.playerId} accessible accessibilityLabel={(play.playerId === 0 ? "Toi" : game.playerNames[play.playerId]) + " : " + cardLabel(play.card)} style={[s.play, positions[play.playerId], play.playerId % 2 === 0 ? { transform: [{ translateX: compact ? -14 : -19 }] } : { transform: [{ translateY: compact ? -20 : -28 }] }]}><CardFace card={play.card} compact={compact} table /></View>)}
      {!cards.length ? <View style={s.tableCenter}><Text style={s.tableMark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">♠</Text><Text style={s.tableCaption}>{game.phase === "bidding" ? "Enchères" : game.result ? "Fin de manche" : "À la table"}</Text></View> : null}
    </View>
  </View>;
}
function CardFace({ card, compact = false, table = false }: { card: Card; compact?: boolean; table?: boolean }) {
  return <View style={[s.cardFace, compact && s.compactCard, table && s.playedFace, table && compact && s.compactPlayedFace]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Text allowFontScaling={false} style={[s.cardRank, table && s.playedRank, table && compact && s.smallRank, (card.suit === "hearts" || card.suit === "diamonds") && s.red]}>{card.rank}</Text>
    <Text allowFontScaling={false} style={[s.cardSuit, table && s.playedSuit, table && compact && s.smallSuit, (card.suit === "hearts" || card.suit === "diamonds") && s.red]}>{symbols[card.suit] + "\uFE0E"}</Text>
  </View>;
}
const s = StyleSheet.create({
  headerAction: { minWidth: 44, height: 44, paddingHorizontal: t.spacing.xs, alignItems: "center", justifyContent: "center", borderRadius: t.radius.sm },
  headerLabel: { ...t.type.label, color: t.colors.accent },
  root: { flex: 1, minHeight: 0, gap: t.spacing.xs },
  lobbyBrand: { flex: 0.8, minWidth: 0, justifyContent: "center", alignItems: "center", gap: t.spacing.sm },
  title: { ...t.type.displayCompact, color: t.colors.text, textAlign: "center" },
  upper: { flex: 1, minHeight: 0, flexDirection: "row", gap: t.spacing.sm },
  table: { flex: 1.5, minWidth: 0, minHeight: 0, backgroundColor: t.colors.surface, borderWidth: 2, borderColor: t.colors.border, borderRadius: 80, boxShadow: t.shadow.panel },
  tableRail: { position: "absolute", top: 6, bottom: 6, left: 6, right: 6, borderWidth: 1, borderColor: t.colors.hairline, borderRadius: 74 },
  score: { ...t.type.label, color: t.colors.accent, textAlign: "center", maxWidth: "100%" },
  actions: { flex: 1, minWidth: 0, minHeight: 0, justifyContent: "center", gap: t.spacing.xs },
  hand: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: t.spacing.xxs, height: 72 },
  southSeat: { width: 28, height: 28, borderRadius: 14, borderColor: t.colors.border, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: t.spacing.xxs },
  southLabel: { color: t.colors.accent, fontSize: 16, fontFamily: "Georgia" },
  roundResult: { flex: 1, textAlign: "center" },
  handCard: { flex: 1, minWidth: 44, maxWidth: 64, height: 72, borderWidth: 2, borderColor: t.colors.paper, borderRadius: t.radius.sm, backgroundColor: t.colors.paper, justifyContent: "center" },
  selected: { borderColor: t.colors.accent, boxShadow: t.shadow.card, transform: [{ translateY: -2 }] },
  cardFace: { minWidth: 40, height: 64, padding: t.spacing.xxs, borderRadius: t.radius.sm, backgroundColor: t.colors.paper, justifyContent: "center" },
  compactCard: { height: 60 },
  cardRank: { color: t.colors.cardInk, fontFamily: "Georgia", fontSize: 19, lineHeight: 23 },
  cardSuit: { color: t.colors.cardInk, fontSize: 27, lineHeight: 29, textAlign: "center" },
  red: { color: t.colors.cardRed },
  seat: { position: "absolute", width: 64, alignItems: "center", paddingVertical: 2, borderWidth: 1, borderColor: t.colors.clear, borderRadius: t.radius.sm, backgroundColor: t.colors.inset },
  activeSeat: { borderColor: t.colors.accent },
  northSeat: { top: 4, left: "50%", transform: [{ translateX: -32 }] },
  westSeat: { width: 56, top: "50%", left: 4, transform: [{ translateY: -22 }] },
  eastSeat: { width: 56, top: "50%", right: 4, transform: [{ translateY: -22 }] },
  backs: { width: 49, height: 18 },
  cardBack: { position: "absolute", width: 14, height: 18, borderRadius: 2, borderWidth: 1, borderColor: t.colors.accent, backgroundColor: t.colors.raised },
  seatLabel: { ...t.type.caption, color: t.colors.text },
  trick: { position: "absolute", width: 176, height: 132, left: "50%", bottom: 12, transform: [{ translateX: -88 }] },
  compactTrick: { width: 132, height: 96, bottom: 8, transform: [{ translateX: -66 }] },
  play: { position: "absolute", boxShadow: t.shadow.card },
  northPlay: { top: 0, left: "50%" }, southPlay: { bottom: 0, left: "50%" },
  westPlay: { top: "50%", left: 0 }, eastPlay: { top: "50%", right: 0 },
  playedFace: { minWidth: 0, width: 38, height: 56, borderRadius: 4 },
  compactPlayedFace: { width: 28, height: 40 },
  playedRank: { fontSize: 14, lineHeight: 17 }, smallRank: { fontSize: 12, lineHeight: 14 },
  playedSuit: { fontSize: 22, lineHeight: 25 }, smallSuit: { fontSize: 16, lineHeight: 18 },
  tableCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  tableMark: { color: t.colors.accent, fontSize: 32 },
  tableCaption: { ...t.type.caption, color: t.colors.muted },
  lastTrick: { position: "absolute", left: 16, top: 30, fontSize: 10, lineHeight: 14, color: t.colors.muted },
  bidButtons: { gap: t.spacing.xs }, compactBidButtons: { flexDirection: "row", gap: t.spacing.xxs }, bidButton: { flexGrow: 1 },
  bidRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: t.spacing.xs, flexWrap: "wrap" },
  suitChoice: { flexGrow: 1, minWidth: 100 },
});
