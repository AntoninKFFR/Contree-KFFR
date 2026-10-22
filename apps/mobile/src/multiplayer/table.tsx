import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { PlayerPreferences } from "../../../../lib/preferences/playerPreferences";
import { isPreferenceAnimationEnabled } from "../../../../lib/preferences/presentation";
import { normalizeMultiplayerTablePreferences } from "../../../../lib/multiplayerTablePreferences";
import { cardKey, type NativeSoloSession, type SoloIntent } from "../solo/contract";
import { SoloScene, RoundCompletion, TrickCards } from "../solo/scene";
import { useTablePresentation } from "../solo/presentation";
import { SoloText as Text } from "../solo/appearance";
import { DetailDialog, styles } from "@/components/ui";
import { playerName } from "../../../../engine/players";
import type { RoomState } from "./controller";
import type { RoomIntent, RoomPlayerAction } from "./contract";

export function NativeMultiplayerTable({ state, preferences, reduced, width, height, send, onCollected, resultDetails }: { resultDetails?: ReactNode; onCollected: (key: string | null) => void; state: RoomState; preferences: PlayerPreferences; reduced: boolean; width: number; height: number; send: (i: RoomIntent) => void }) {
  const room = state.room!, game = room.game!;
  const session = useMemo<NativeSoloSession>(() => ({ id: room.gameId ?? room.room.id, version: room.room.state_version, state: game }), [room.gameId, room.room.id, room.room.state_version, game]);
  const table = normalizeMultiplayerTablePreferences(room.room.presentation_settings);
  const effective = useMemo(() => ({ ...preferences, gameplay: { ...preferences.gameplay, autoCollectTricks: table.autoCollectTricks, trickDisplayMs: table.trickDisplayMs } }), [preferences, table.autoCollectTricks, table.trickDisplayMs]);
  const presentation = useTablePresentation(session, effective, reduced, state.active);
  useEffect(() => { onCollected(presentation.lastCollected); }, [onCollected, presentation.lastCollected]);
  const [dialog, setDialog] = useState<"last" | "details" | null>(null);
  const ready = state.active && !state.busy && !state.requiresSync;
  const playerStatus = Object.fromEntries(room.players.map((p) => [p.seat_index, p.kind === "bot" || p.bot_takeover ? "bot" : p.is_connected ? "online" : "offline"])) as Record<0 | 1 | 2 | 3, "online" | "offline" | "bot">;
  const seat = room.players.find((p) => p.seat_index === room.viewerSeatIndex);
  const human = ready && width > height && game.currentPlayerId === room.viewerSeatIndex && !seat?.bot_takeover;
  const pending = state.pendingCard && game.hand.some((c) => cardKey(c) === cardKey(state.pendingCard!)) ? state.pendingCard : null;
  function action(intent: SoloIntent) {
    // The server derives playerId from the authenticated seat. Never send it.
    switch (intent.type) {
      case "bid": case "capot": case "generale": case "pass": case "coinche": case "surcoinche": case "play-card": {
        const { playerId: _playerId, ...payload } = intent; void _playerId;
        send({ type: "game-action", action: payload as RoomPlayerAction }); break;
      }
    }
  }
  const last = game.completedTricks.at(-1);
  return <View testID="multiplayer-game" style={{ flex: 1 }}>
    <SoloScene resultVisible={presentation.resultReady} playerStatus={playerStatus} showWaitingBids={false} session={session} width={width} height={height} preferences={effective} reduced={reduced} human={human} onIntent={action} pendingCard={pending}
      layers={presentation.layers} cardPresentations={presentation.cardPresentations} presented={presentation.presented} policy={presentation.policy} onCollect={presentation.collect} onLastTrick={() => setDialog("last")} />
    {presentation.resultReady ? <RoundCompletion finalResult={game.phase === "game-over"} game={game} disabled={!ready || game.phase === "game-over" && !room.isHost}
      actionLabel={game.phase === "game-over" ? room.isHost ? "Rejouer" : "En attente de l’hôte" : "Manche suivante"}
      onAction={() => send({ type: game.phase === "game-over" ? "rematch" : "next-round" })} onDetails={() => setDialog("details")} reduced={!isPreferenceAnimationEnabled(effective, "trick", reduced)} /> : null}
    {presentation.resultReady ? resultDetails : null}
    <DetailDialog visible={dialog !== null} title={dialog === "last" ? "Dernier pli" : "Détails et historique"} onClose={() => setDialog(null)} reduceMotion={reduced}>
      {dialog === "last" && last ? <><Text style={styles.body}>{playerName(last.winnerId, game.playerNames)} · {last.points} points</Text><View style={{ alignSelf: "center" }}><TrickCards cards={last.cards} viewer={game.viewerPlayerId} height={72} preferences={effective} reduced details /></View></> : null}
      {dialog === "details" ? <>
        <Text style={styles.heading}>{game.phase === "game-over" ? game.winnerTeam === game.viewerPlayerId % 2 ? "Victoire" : "Défaite" : "Résultat de manche"}{game.endReason === "forfeit" ? " · Forfait" : ""}</Text>
        {game.result?.kind === "played" ? <><Text style={styles.body}>Plis : {game.result.trickPointsByTeam[0]} — {game.result.trickPointsByTeam[1]}</Text><Text style={styles.body}>Annonces : {game.result.announcementPointsByTeam[0]} — {game.result.announcementPointsByTeam[1]}</Text><Text style={styles.body}>Belote : {game.result.belotePointsByTeam[0]} — {game.result.belotePointsByTeam[1]} · Multiplicateur ×{game.result.multiplier}</Text></> : null}
        {game.roundHistory.map((h) => <Text key={h.roundNumber} style={styles.body}>Manche {h.roundNumber} : {h.result.roundScore[0]} — {h.result.roundScore[1]} · Total {h.totalScoreAfterRound[0]} — {h.totalScoreAfterRound[1]}</Text>)}
        <Text style={styles.body}>L’historique, les statistiques et la progression sont enregistrés par le serveur commun.</Text>
      </> : null}
    </DetailDialog>
  </View>;
}
