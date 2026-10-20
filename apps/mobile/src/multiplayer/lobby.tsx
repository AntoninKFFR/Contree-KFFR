import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";
import { SoloText as Text } from "../solo/appearance";
import { TableButton } from "../solo/table-controls";
import felt from "../../assets/solo-felt.png";
import type { MultiplayerRoomView, RoomIntent } from "./contract";
import { tableSeatsFor } from "../../../../lib/solo/tableSeats";

export function NativeLobby({ room, busy, send, onRules, onInvite, largeText, onMore }: { largeText?: boolean; onMore: () => void; room: MultiplayerRoomView; busy: boolean; send: (i: RoomIntent) => void; onRules: () => void; onInvite: () => void }) {
  const me = room.players.find((p) => p.seat_index === room.viewerSeatIndex);
  const seats = tableSeatsFor({ phase: "bidding", viewerPlayerId: room.viewerSeatIndex ?? 0 });
  const ready = room.players.every((p) => p.kind !== "human" || p.is_ready);
  return <View testID="multiplayer-lobby" style={{ flex: 1, gap: 6 }}>
    <View style={{ flex: 1, minHeight: 148, borderRadius: 24, borderWidth: 1, borderColor: "#ead8a64d", overflow: "hidden", backgroundColor: "#0d5b3c" }}>
      <Image source={felt} contentFit="cover" style={StyleSheet.absoluteFill} cachePolicy="memory-disk" accessible={false} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#04301f80" }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", paddingHorizontal: 132 }]}>
        <Text style={{ color: "#ead8a6", fontWeight: "900", textAlign: "center", fontSize: 12 }}>CONTRÉE KFFR</Text>
        <Text style={{ color: "#ffffffb3", textAlign: "center", fontSize: 10 }}>{room.room.target_score} points</Text>
      </View>
      {Object.entries(seats).map(([position, seat]) => {
        const p = room.players.find((p) => p.seat_index === seat)!;
        const mine = seat === room.viewerSeatIndex, free = p.kind === "empty";
        const offset = position === "top" ? { top: 4, left: "50%" as const, marginLeft: -64 } : position === "bottom" ? { bottom: 4, left: "50%" as const, marginLeft: -64 } : position === "left" ? { top: "50%" as const, left: 4, marginTop: -29 } : { top: "50%" as const, right: 4, marginTop: -29 };
        return <Pressable key={seat} testID={`lobby-seat-${seat}`} accessibilityRole="button" disabled={!free || busy}
          accessibilityLabel={`Place ${seat + 1} : ${free ? "libre, s'asseoir" : p.display_name}${mine ? ", moi" : ""}${p.is_host ? ", hôte" : ""}`}
          onPress={() => send({ type: "join-seat", seatIndex: seat })}
          style={[{ position: "absolute", width: 128, minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: mine ? "#ead8a6" : "#ffffff40", backgroundColor: "#071b15ed", padding: 6, alignItems: "center", justifyContent: "center" }, offset]}>
          <Text numberOfLines={1} style={{ color: "#f5f1e7", fontWeight: "800", fontSize: 12 }}>{free ? "+ Place libre" : p.display_name}{mine ? " · Moi" : ""}</Text>
          <Text numberOfLines={1} style={{ color: p.is_ready ? "#86efac" : "#e4d7b8", fontSize: 10 }}>{free ? "S’asseoir" : `${p.kind === "bot" ? "Bot" : p.is_connected ? "En ligne" : "Absent"} · ${p.is_ready ? "Prêt" : "Pas prêt"}${p.is_host ? " · Hôte" : ""}`}</Text>
        </Pressable>;
      })}
    </View>
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {me ? <TableButton label={me.is_ready ? "Pas prêt" : "Prêt"} primary disabled={busy} onPress={() => send({ type: "set-ready", ready: !me.is_ready })} /> : null}
      {me && !largeText ? <TableButton label="Quitter la place" disabled={busy} onPress={() => send({ type: "leave-seat" })} /> : null}
      {!largeText ? <TableButton label="Règles" onPress={onRules} /> : null}
      {me && !largeText && room.players.some((p) => p.kind === "empty") ? <TableButton label="Inviter" onPress={onInvite} /> : null}
      {room.isHost ? <TableButton label="Lancer la partie" primary disabled={busy || !ready || !me} onPress={() => send({ type: "start-game" })} /> : null}
      {largeText ? <TableButton label="Options" onPress={onMore} /> : null}
      {room.canClaimHost ? <TableButton label="Devenir hôte" disabled={busy} onPress={() => send({ type: "claim-host" })} /> : null}
    </View>
    <Text style={{ color: "#d1c4a4", fontSize: 10 }}>{room.isHost ? "Les places libres seront confiées aux bots officiels au démarrage." : "La partie démarre lorsque les humains sont prêts et que l’hôte la lance."}</Text>
  </View>;
}
