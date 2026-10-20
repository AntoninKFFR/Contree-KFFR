import { formatBidLabel, formatFinalContract } from "@/lib/solo/tableAnnouncements";
import { SoloText as Text } from "./appearance";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { tableSeatsFor } from "@/lib/solo/tableSeats";
import { currentTrickLeaderId, playedCardKey, type CardPresentation, type TrickLayer, type PresentedTrick } from "@/lib/trickPresentation";
import { isPreferenceAnimationEnabled } from "@/lib/preferences/presentation";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";
import { formatContractLabel, resolveContractMode } from "@/engine/contractMode";
import { SUIT_SYMBOLS } from "@/engine/cards";
import { getPublicRoundPoints } from "@/engine/contractProgress";
import { playerName, teamName } from "@/engine/players";
import type { PlayedCard, PlayerId } from "@/engine/types";
import felt from "../../assets/solo-felt.png";
import { NativeBidding } from "./bidding";
import { NativeHand } from "./hand";
import { CardFace, cardLabel } from "./card-face";
import { TableButton } from "./table-controls";
import type { NativeSoloSession, SoloIntent } from "./contract";

const clamp = (min: number, n: number, max: number) => Math.min(max, Math.max(min, n));
const playEntry = (x: number, y: number) => ({ from: { opacity: 0, transform: [{ translateX: x }, { translateY: y }, { scale: .96 }] }, to: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] } });
const playEntries = { 0: playEntry(0, 12), 1: playEntry(12, 0), 2: playEntry(0, -6), 3: playEntry(-12, 0) };
export function soloSceneGeometry(width: number, height: number, bidding: boolean) {
  const handHeight = bidding ? clamp(70, height - 212, 90) : clamp(74, height * .25, 96);
  return { width, height, handHeight, trickHeight: clamp(76.44, height * .273, 100.1), trickY: (height - handHeight + 106) / 2, biddingTop: Math.max(88, 52 + (height - handHeight - 196) / 2) };
}
function PlayerCell({ game, player, position, width, height, preferences, reduced }: { game: NativeSoloSession["state"]; player: PlayerId; position: string; width: number; height: number; preferences: PlayerPreferences; reduced: boolean }) {
  const lead = currentTrickLeaderId(game) === player, active = game.currentPlayerId === player && preferences.assistance.showTurnIndicator;
  const last = game.bids.filter((b) => b.playerId === player).at(-1);
  const announcement = game.phase === "bidding" ? last ? formatBidLabel(last) : null : game.contract?.playerId === player ? formatFinalContract(game.contract) : null;
  const bubble = announcement ? [announcement.label, announcement.detail].filter(Boolean).join("\n") : null;
  const neutral = announcement?.tone === "neutral";
  const offset = position === "top" ? { left: width / 2 - 30, top: 4 } : position === "left" ? { left: 4, top: height / 2 - 12 } : position === "right" ? { right: 4, top: height / 2 - 12 } : { left: 4, bottom: 8 };
  return <View testID={`solo-seat-${player}`} style={[{ position: "absolute", width: 60, zIndex: 10 }, offset]}>
    <View accessible accessibilityLabel={`${playerName(player, game.playerNames)}, ${position === "bottom" ? "Sud" : position === "top" ? "Nord, partenaire" : position === "right" ? "Est, adversaire" : "Ouest, adversaire"}${active ? ", à son tour" : ""}${game.inactivePlayerId === player ? ", ne joue pas cette donne" : ""}`}
      style={{ minHeight: 24, width: 60, borderWidth: preferences.visual.highContrast ? 2 : 1, borderRadius: 7, borderColor: active ? "#6ee7b7cc" : "#ffffff1a", backgroundColor: "#07150fb8", paddingHorizontal: 4, paddingVertical: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={{ flexShrink: 1, color: "#fff", fontSize: 11, lineHeight: 14, fontWeight: "700" }}>{playerName(player, game.playerNames)}</Text>
      {lead ? <Text allowFontScaling={false} style={{ color: "#f0dfb1", borderWidth: 1, borderColor: "#d8c48f80", borderRadius: 3, fontSize: 8, lineHeight: 12, width: 10, textAlign: "center" }}>P</Text> : <View style={{ width: 10 }} />}
    </View>
    {bubble ? <Animated.View key={`${game.roundNumber}:${last ? game.bids.indexOf(last) : "contract"}:${bubble}`} entering={game.phase === "bidding" && last === game.bids.at(-1) && isPreferenceAnimationEnabled(preferences, "bidding", reduced) ? FadeIn.duration(150) : undefined}
      style={{ position: "absolute", width: 60, ...(position === "bottom" ? { bottom: 26 } : { top: 26 }), borderRadius: 8, borderWidth: 1, borderColor: neutral ? "#ffffff1a" : "#ead8a640", backgroundColor: neutral ? "#00000040" : "#f8f2dff2", padding: 4 }}>
      <Text maxFontSizeMultiplier={1.5} style={{ fontSize: 8, lineHeight: 9, textAlign: "center", fontWeight: "700", color: neutral ? "#ffffffa6" : "#1c1917" }}>{bubble}</Text>
    </Animated.View> : null}
  </View>;
}
export function TrickCards({ cards, height, animatedKeys = [], preferences, reduced, details = false }: { cards: PlayedCard[]; height: number; animatedKeys?: string[]; preferences: PlayerPreferences; reduced: boolean; details?: boolean }) {
  return <View testID="solo-trick-cards" pointerEvents="none" style={{ width: 180, height: 160 }}>
    {cards.map((played, index) => {
      const p = played.playerId, x = p === 1 ? height * .44 : p === 3 ? -height * .44 : p === 0 ? 5 : -5, y = p === 2 ? -height * .22 : p === 0 ? height * .22 : 0;
      const rotation = p === 2 ? -2 : p === 0 ? 1 : p === 3 ? -4 : 4;
      return <View key={playedCardKey(played)} testID={`solo-play-${p}`} accessible accessibilityLabel={`${playerName(p)} : ${cardLabel(played.card)}, carte ${index + 1}`} style={{ position: "absolute", left: 90 - height * .34 + x, top: 80 - height / 2 + y, zIndex: index + 1, transform: [{ rotate: `${rotation}deg` }] }}>
        <Animated.View style={!reduced && animatedKeys.includes(playedCardKey(played)) ? { animationName: playEntries[p], animationDuration: 240, animationTimingFunction: "ease-out", animationFillMode: "both" } : undefined}>
          <CardFace card={played.card} height={height} modern={preferences.cards.cardStyle === "modern"} contrast={preferences.visual.highContrast} />
          {details ? <Text style={{ position: "absolute", right: -8, top: -8, width: 20, height: 20, borderRadius: 10, textAlign: "center", backgroundColor: "#022c22", color: "#fff", fontWeight: "900" }}>{index + 1}</Text> : null}
        </Animated.View>
      </View>;
    })}
  </View>;
}
export function SoloScene({ session, width, height, preferences, reduced, human, onIntent, layers, cardPresentations, presented, policy, onCollect, onLastTrick }: {
  session: NativeSoloSession; width: number; height: number; preferences: PlayerPreferences; reduced: boolean; human: boolean; onIntent: (intent: SoloIntent) => void;
  layers: TrickLayer[]; cardPresentations: Map<string, CardPresentation>; presented: PresentedTrick | null; policy: { autoCollect: boolean; delayMs: number }; onCollect: () => void; onLastTrick: () => void;
}) {
  const game = session.state, geometry = soloSceneGeometry(width, height, game.phase === "bidding"), seats = tableSeatsFor(game), live = getPublicRoundPoints(game);
  const contractText = game.contract ? `${formatContractLabel(game.contract)}${game.contract.status === "coinched" ? " · Coinché" : game.contract.status === "surcoinched" ? " · Surcoinché" : ""}` : "Annonces";
  const colors = { "classic-green": "#0d5b3c", "midnight-blue": "#17345a", burgundy: "#742f3b", "dark-neutral": "#343a3a" };
  const playDelay = isPreferenceAnimationEnabled(preferences, "card-play", reduced) ? Math.min(240, policy.delayMs) : 0;
  const obscured = game.phase === "finished" || game.phase === "game-over";
  return <View testID="solo-card-table" aria-hidden={obscured} accessibilityElementsHidden={obscured} importantForAccessibility={obscured ? "no-hide-descendants" : "auto"} pointerEvents={obscured ? "none" : "auto"} style={{ flex: 1, overflow: "hidden", backgroundColor: colors[preferences.visual.tableTheme] }}>
    {preferences.visual.tableTheme === "classic-green" ? <Image source={felt} resizeMode="cover" style={StyleSheet.absoluteFill} accessible={false} /> : null}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: preferences.visual.tableTheme === "classic-green" ? "#04301f5e" : "#00000020", boxShadow: "inset 0 0 90px #00000061" }]} />
    {layers.map((layer, i) => {
      const collecting = layer.kind === "completed" && presented && policy.autoCollect && isPreferenceAnimationEnabled(preferences, "trick", reduced);
      const winner = presented?.trick.winnerId;
      const x = winner === 3 ? -width / 2 + 80 : winner === 1 ? width / 2 - 80 : 0, y = winner === 2 ? -height * .4 + 32 : winner === 0 ? height * .32 : 0;
      return <Animated.View key={layer.key} pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 25 + i }, collecting ? {
        animationName: { "0%, 85%": { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] }, to: { opacity: 0, transform: [{ translateX: x }, { translateY: y }, { scale: .82 }] } }, animationDuration: Math.max(0, policy.delayMs - playDelay), animationDelay: playDelay, animationTimingFunction: "ease-in", animationFillMode: "forwards",
      } : {}]}>
        <View testID="solo-trick-area" style={{ position: "absolute", left: width / 2 - 90, top: geometry.trickY - 80 }}><TrickCards cards={layer.cards} height={geometry.trickHeight} preferences={preferences} reduced={reduced} animatedKeys={cardPresentations.get(layer.key)?.animatedKeys} /></View>
      </Animated.View>;
    })}
    <View testID="solo-hud" style={{ position: "absolute", left: 56, top: 5, maxWidth: width / 2 - 96, paddingVertical: 5, paddingHorizontal: 8, borderColor: "#ead8a638", borderWidth: 1, borderRadius: 12, backgroundColor: "#07150fdb", zIndex: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Text numberOfLines={1} allowFontScaling={false} style={{ flexShrink: 0, fontSize: 10, lineHeight: 12, fontWeight: "900", color: "#fff" }}>Nous {game.totalScore[0]} — Eux {game.totalScore[1]}</Text><Text numberOfLines={1} allowFontScaling={false} style={{ flexShrink: 1, fontSize: 9, lineHeight: 12, color: "#e8d8adbf", fontWeight: "700" }}>{contractText.toLocaleUpperCase("fr")}</Text></View>
      {game.inactivePlayerId !== null ? <Text style={{ color: "#ffffffb3", fontSize: 9 }}>{playerName(game.inactivePlayerId, game.playerNames)} ne joue pas cette donne.</Text> : null}
    </View>
    {preferences.assistance.showLivePoints ? <View accessibilityLabel="Points en direct" style={{ position: "absolute", right: 56, top: 5, borderWidth: 1, borderColor: "#ffffff33", backgroundColor: "#07150fdb", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, flexDirection: "row", gap: 6 }}><Text allowFontScaling={false} style={{ color: "#e8d8adbf", fontSize: 8, fontWeight: "700" }}>DIRECT</Text><Text allowFontScaling={false} style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>Nous {live[0]}  Eux {live[1]}</Text></View> : null}
    {Object.entries(seats).map(([position, player]) => <PlayerCell key={player} game={game} player={player} position={position} width={width} height={height} preferences={preferences} reduced={reduced} />)}
    <NativeHand key={`${session.id}:${game.roundNumber}`} game={game} width={width} height={geometry.handHeight} canPlay={human && game.phase === "playing"} onPlay={(card) => onIntent({ type: "play-card", playerId: 0, card })} preferences={preferences} reduced={reduced} />
    {game.phase === "bidding" ? <NativeBidding key={`${session.id}:${game.roundNumber}:${game.bids.length}`} game={game} canBid={human} width={width} height={height} handHeight={geometry.handHeight} top={geometry.biddingTop} preferences={preferences} reduced={reduced} onIntent={onIntent} /> : null}
    {presented && !policy.autoCollect ? <View style={{ position: "absolute", right: 68, bottom: geometry.handHeight + 10, width: 112, zIndex: 40 }}><TableButton label={`Ramasser le pli\n${playerName(presented.trick.winnerId, game.playerNames)} · ${presented.trick.points} pts`} onPress={onCollect} /></View> : null}
    {preferences.assistance.showLastTrick && game.completedTricks.length > 0 && !presented ? <Pressable accessibilityRole="button" accessibilityLabel="Dernier pli" onPress={onLastTrick} style={{ position: "absolute", right: 4, bottom: 60, width: 80, height: 44, alignItems: "center", justifyContent: "flex-end", zIndex: 20 }}><Text style={{ backgroundColor: "#07150fdb", borderColor: "#ead8a64d", borderWidth: 1, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2, fontSize: 10, color: "#fff" }}>Dernier pli</Text></Pressable> : null}
  </View>;
}
export function RoundCompletion({ game, disabled, onAction, onDetails, reduced }: { game: NativeSoloSession["state"]; disabled: boolean; onAction: () => void; onDetails: () => void; reduced: boolean }) {
  const result = game.result?.kind === "played" ? game.result : null, success = result?.contractSucceeded;
  const mode = result ? resolveContractMode(result.contract) : null;
  const winner = game.roundScore[0] === game.roundScore[1] ? null : game.roundScore[0] > game.roundScore[1] ? 0 : 1;
  return <View style={[StyleSheet.absoluteFill, { zIndex: 40, alignItems: "center", justifyContent: "center", padding: 16 }]} pointerEvents="box-none" accessibilityViewIsModal>
    <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000000b8" }]} />
    <Animated.View testID="solo-round-result" entering={reduced ? undefined : FadeIn.duration(220)} style={{ width: "100%", maxWidth: 448, borderRadius: 16, borderWidth: 1, borderColor: success ? "#ead8a673" : "#fca5a559", backgroundColor: "#0b1c15ed", padding: 16, flexDirection: "row", gap: 16 }}>
      <View style={{ flex: 1, gap: 8, alignItems: "stretch" }}>
        <Text style={{ color: success ? "#ead8a6" : "#fca5a5", fontWeight: "900", fontSize: 12, textAlign: "center", letterSpacing: 2 }}>{result ? success ? "CONTRAT RÉUSSI ✓" : "CONTRAT CHUTÉ" : "MANCHE TERMINÉE"}</Text>
        {result ? <Text style={{ color: "#f3ead2", textAlign: "center", fontSize: 18, fontWeight: "900" }}>{result.contract.kind === "capot" ? "Capot" : result.contract.kind === "generale" ? "Générale" : result.contract.value} {mode?.kind === "suit" ? SUIT_SYMBOLS[mode.suit] : mode?.kind === "no-trump" ? "SA" : "TA"} — {playerName(result.contract.playerId, game.playerNames)}</Text> : null}
        <View style={{ borderWidth: 1, borderColor: "#ffffff1a", borderRadius: 12, padding: 10, backgroundColor: "#ffffff0f", gap: 4 }}><Text style={{ color: "#f5f1e7", textAlign: "center", fontWeight: "900", fontSize: 24 }}>{game.roundScore[0]} — {game.roundScore[1]}</Text><Text style={{ color: "#ffffffb3", textAlign: "center", fontWeight: "700", fontSize: 12 }}>{winner === null ? "Score de manche partagé" : `${teamName(winner, game.playerNames)} remportent la manche`}</Text><Text style={{ borderTopWidth: 1, borderColor: "#ffffff1a", paddingTop: 8, color: "#e7d7aebf", fontWeight: "700", textAlign: "center", fontSize: 12 }}>Partie : {game.totalScore[0]} — {game.totalScore[1]}</Text></View>
      </View>
      <View style={{ flex: 1, paddingTop: 42, gap: 48 }}><TableButton label={game.phase === "game-over" ? "Nouvelle partie" : "Manche suivante"} primary paper disabled={disabled} onPress={onAction} reduced={reduced} /><TableButton label="Détails" onPress={onDetails} /></View>
    </Animated.View>
  </View>;
}
