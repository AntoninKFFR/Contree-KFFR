import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Share, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { AccountGate } from "@/components/AccountGate";
import { DetailDialog, styles } from "@/components/ui";
import { useAccount } from "@/auth/AccountProvider";
import { SoloAppearance, SoloText as Text } from "@/solo/appearance";
import { TableButton } from "@/solo/table-controls";
import { SoloRulesPanel } from "@/solo/rules-panel";
import { Choice, Toggle, SoloSettingsPanel } from "@/solo/settings-panel";
import { useSoloPreferences } from "@/solo/preferences";
import { soloEnvironment } from "@/solo/environment";
import { useSoloAudio } from "@/solo/audio";
import { rulesetDifferences } from "../../../../../engine/rulesets/rulesetDiff";
import { uuidPattern } from "@/solo/contract";
import { useRoom } from "@/multiplayer/use-room";
import { useMultiplayerService, savedRoomKey } from "@/multiplayer/use-service";
import { NativeLobby } from "@/multiplayer/lobby";
import { NativeMultiplayerTable } from "@/multiplayer/table";
import type { RoomIntent, MultiplayerRoomView } from "@/multiplayer/contract";
import type { CustomRulesetInput } from "../../../../../engine/rulesets/custom";
import { rulesetToCustomInput } from "../../../../../engine/rulesets/custom";
import { resolveRoomRules } from "../../../../../engine/rulesets/room";
import { normalizeMultiplayerTablePreferences, withMultiplayerTableSpeed, withMultiplayerTableTrickDisplay } from "../../../../../lib/multiplayerTablePreferences";
import type { PresetGameSpeed } from "../../../../../lib/preferences/playerPreferences";
import type { GameInvitation, InvitableFriend } from "../../../../../lib/socialInvitationContracts";
import { supabase } from "@/lib/supabase";
import { getProgression } from "../../../../../lib/progression/formulaV1";
import { parseRatingMatchResult } from "../../../../../lib/rating/queries";

type Dialog = "join" | "rules" | "invitations" | "invite" | "menu" | "host" | "forfeit" | "preferences" | "table" | null;
export default function MultiplayerScreen() {
  const account = useAccount();
  return <SelectedMultiplayer key={account.navigationIdentity ?? "signed-out"} />;
}
function SelectedMultiplayer() {
  const [id, setId] = useState<string | null>(null);
  return <AccountGate bottomInset><Multiplayer id={id} onRoomChange={setId} /></AccountGate>;
}
function Multiplayer({ id, onRoomChange: setId }: { id: string | null; onRoomChange: (id: string | null) => void }) {
  const router = useRouter(), account = useAccount(), settings = useSoloPreferences();
  const [saved, setSaved] = useState<string | null>(null);
  const service = useMultiplayerService(id);
  const [dialog, setDialog] = useState<Dialog>(null), [code, setCode] = useState("");
  const [rules, setRules] = useState<CustomRulesetInput>({ presetId: "contree-kffr" });
  const [invitations, setInvitations] = useState<GameInvitation[]>([]), [friends, setFriends] = useState<InvitableFriend[]>([]);
  const [invitationId, setInvitationId] = useState<string | null>(null), accepted = useRef<string | null>(null);
  const [progression, setProgression] = useState<{ gameId: string; token: string; label: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [rating, setRating] = useState<{ gameId: string; token: string; label: string } | null>(null);
  const { state, controller } = useRoom(id), room = state.room;
  const window = useWindowDimensions(), insets = useSafeAreaInsets();
  const width = window.width - insets.left - insets.right, height = window.height - insets.top - insets.bottom;
  const busy = service.busy || state.busy || !!id && state.requiresSync;
  const run = service.run, owner = service.owner;
  useFocusEffect(useCallback(() => {
    let live = true;
    if (owner) void soloEnvironment.storage.getItem(savedRoomKey(owner)).then((v) => { if (live && v && uuidPattern.test(v)) setSaved(v); }).catch(() => { if (live) setNotice("Reprise locale indisponible. Utilise le code de table."); });
    return () => { live = false; };
  }, [owner]));
  useFocusEffect(useCallback(() => {
    if (id) return;
    let live = true, pending = false;
    const refresh = async () => {
      if (!live || pending || AppState.currentState !== "active") return;
      pending = true;
      const next = await run((api, who, signal) => api.invitations(who, signal), false);
      if (live && next) setInvitations(next.invitations);
      pending = false;
    };
    void refresh(); const timer = setInterval(refresh, 30000);
    const listener = AppState.addEventListener("change", (status) => { if (status === "active") void refresh(); });
    return () => { live = false; clearInterval(timer); listener.remove(); };
  }, [id, run]));
  useEffect(() => {
    if (!invitationId || room?.viewerSeatIndex == null || accepted.current === invitationId) return;
    accepted.current = invitationId;
    void run((api, who, signal) => api.invitation(who, signal, invitationId, "accept")).then((result) => {
      if (result) { setInvitationId(null); setNotice("Invitation acceptée."); }
    });
  }, [invitationId, room?.viewerSeatIndex, run]);
  const gameId = room?.room.status === "finished" ? room.gameId : null;
  useFocusEffect(useCallback(() => {
    if (!gameId || !supabase || !service.token) return;
    const token = service.token;
    let live = true, timer: ReturnType<typeof setTimeout> | undefined, reads = 0;
    async function read() {
      try {
        const response = await supabase!.rpc("get_my_rating_match_result", { p_source_game_id: gameId });
        if (response.error) throw response.error;
        const result = parseRatingMatchResult(response.data);
        if (!live) return;
        setRating({ gameId: gameId!, token, label: !result ? "Partie non classée" : result.status === "pending" ? "Calcul Elo en cours…" : result.status === "void" ? "Résultat Elo annulé" : `Elo : ${result.ratingBefore} → ${result.ratingAfter} (${result.delta! > 0 ? "+" : ""}${result.delta})` });
        if (result?.status === "pending" && ++reads < 6) timer = setTimeout(read, 2500);
      } catch { if (live) setRating({ gameId: gameId!, token, label: "Résultat Elo indisponible. Réessaie depuis le profil web." }); }
    }
    void read(); return () => { live = false; if (timer) clearTimeout(timer); };
  }, [gameId, service.token]));
  useFocusEffect(useCallback(() => {
    if (!gameId || !supabase || !service.token) return;
    let live = true; const token = service.token;
    void supabase.rpc("get_my_progression").then(({ data, error }) => {
      if (!live) return;
      try {
        if (error || !data || typeof data !== "object" || !Number.isSafeInteger(data.total_xp)) throw new Error("unavailable");
        const progress = getProgression(data.total_xp);
        setProgression({ gameId, token, label: `Niveau ${progress.level} · ${progress.totalXp} XP · ${progress.xpIntoLevel}/${progress.xpForNextLevel} XP` });
      } catch { setProgression({ gameId, token, label: "Progression indisponible pour le moment." }); }
    }, () => { if (live) setProgression({ gameId, token, label: "Progression indisponible pour le moment." }); });
    return () => { live = false; };
  }, [gameId, service.token]));
  const audioSession = useMemo(() => room?.game && state.active ? { id: room.gameId ?? room.room.id, version: room.room.state_version, state: room.game } : null, [room, state.active]);
  const [collected, setCollected] = useState<string | null>(null);
  const audio = useSoloAudio(settings.preferences, audioSession, collected);
  function open(next: MultiplayerRoomView) {
    setDialog(null); setNotice(null); setId(next.room.id); setSaved(next.room.id);
    if (owner) void soloEnvironment.storage.setItem(savedRoomKey(owner), next.room.id).catch(() => setNotice("Code accessible, mais reprise locale non sauvegardée."));
  }
  function send(intent: RoomIntent) { return controller?.move(intent) ?? Promise.resolve(false); }
  async function invitation(invite: GameInvitation, action: "join" | "decline") {
    if (action === "decline") {
      const next = await run((api, who, signal) => api.invitation(who, signal, invite.id, "decline"));
      if (next) setInvitations((items) => items.filter((i) => i.id !== invite.id));
      return;
    }
    const next = await run((api, who, signal) => api.resolve(who, signal, invite.id));
    if (!next) return;
    if (next.state !== "joinable" || !next.roomId || !uuidPattern.test(next.roomId)) { setNotice("Cette invitation n’est plus disponible."); setInvitations((items) => items.filter((i) => i.id !== invite.id)); return; }
    setInvitationId(invite.id); accepted.current = null; setDialog(null); setId(next.roomId); setSaved(next.roomId);
    if (owner) void soloEnvironment.storage.setItem(savedRoomKey(owner), next.roomId).catch(() => {});
  }
  async function inviteFriends() {
    if (!id) return;
    setDialog("invite"); setFriends([]);
    const next = await run((api, who, signal) => api.friends(who, signal, id), false);
    if (next) setFriends(next);
  }
  const title = room ? `Table ${room.room.code}` : "Multijoueur";
  const message = state.error ?? service.error ?? notice;
  const tableSettings = normalizeMultiplayerTablePreferences(room?.room.presentation_settings);
  const received = invitations.filter((i) => i.inviteeId === owner && i.status === "pending");
  const body = (text: string) => <Text style={styles.body}>{text}</Text>;
  return <SoloAppearance value={{ textSize: settings.preferences.visual.textSize, contrast: settings.preferences.visual.highContrast, reduced: settings.reduced, sound: () => audio.sound("ui") }}>
    <SafeAreaView testID="multiplayer-screen" style={{ flex: 1, backgroundColor: "#061b15" }} edges={["top", "bottom", "left", "right"]}>
      <View testID="multiplayer-content" style={{ flex: 1 }} aria-hidden={dialog !== null} accessibilityElementsHidden={dialog !== null} importantForAccessibility={dialog ? "no-hide-descendants" : "auto"}>
        {room?.game && state.active && settings.loaded ? <>
          <NativeMultiplayerTable state={state} preferences={settings.preferences} reduced={settings.reduced} width={width} height={height} send={send} onCollected={setCollected} />
          {room.room.turn_deadline_at ? <TurnClock deadline={room.room.turn_deadline_at} /> : null}
          {rating?.gameId === gameId && rating?.token === service.token ? <View style={{ position: "absolute", bottom: 3, left: 56, right: 56, zIndex: 45 }}><Text style={{ color: "#ead8a6", fontSize: 12, textAlign: "center" }}>{rating.label}{progression?.gameId === gameId && progression?.token === service.token ? ` · ${progression.label}` : ""}</Text></View> : null}
        </> : <View style={{ flex: 1, padding: 10, paddingTop: 52, gap: 8 }}>
          {room?.room.status === "lobby" ? <NativeLobby largeText={window.fontScale > 1.3} onMore={() => setDialog("menu")} room={room} busy={busy} send={send} onRules={() => setDialog("rules")} onInvite={() => { void inviteFriends(); }} /> : id ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>{!state.error ? <ActivityIndicator color="#ead8a6" /> : null}{body(room?.room.status === "cancelled" ? "Cette table est annulée." : "Synchronisation de la table…")}<TableButton label="Recharger la table" onPress={() => { void controller?.load(); }} /></View> : <>
            <View style={{ flex: 1, flexDirection: "row", gap: 12 }}>
              <View style={panel}><Text style={styles.heading}>Créer une table</Text>{height > 340 || !saved ? body("Tes amis sur PC ou iPhone pourront te rejoindre avec le code.") : null}<TableButton label="Règles de la table" disabled={busy} onPress={() => setDialog("rules")} /><TableButton label="Créer la table" primary disabled={busy || !account.username} onPress={() => { void run((api, who, signal) => api.create(who, signal, rules)).then((next) => { if (next) open(next); }); }} /></View>
              <View style={panel}><Text style={styles.heading}>Rejoindre tes amis</Text>{height > 340 || !saved ? body("Une même communauté KFFR, sur tous les appareils.") : null}<TableButton label="Saisir un code" primary disabled={busy || !account.username} onPress={() => setDialog("join")} /><TableButton label={`Invitations (${received.length})`} disabled={busy} onPress={() => setDialog("invitations")} /></View>
            </View>
            {saved ? <TableButton label="Rouvrir la dernière table de cet appareil" disabled={busy} onPress={() => setId(saved)} /> : null}
          </>}
        </View>}
        <View style={{ position: "absolute", left: 4, top: 4, width: 44, zIndex: 60 }}><TableButton label="←" accessibilityLabel={id ? "Revenir aux salons" : "Revenir à l’accueil"} symbol chrome onPress={() => { if (id) { setId(null); setInvitationId(null); } else router.replace("/"); }} /></View>
        {!room?.game && !message ? <Text style={{ position: "absolute", top: 15, left: 58, right: 58, color: "#ead8a6", fontSize: 16, fontWeight: "900" }}>{title}</Text> : null}
        <View style={{ position: "absolute", right: 4, top: 4, width: 44, zIndex: 60 }}><TableButton label="☰" accessibilityLabel="Menu Multijoueur" symbol chrome onPress={() => setDialog("menu")} /></View>
        {message ? <View testID="multiplayer-notice" pointerEvents="box-none" style={{ position: "absolute", top: room?.game ? 50 : 4, left: 58, right: 58, zIndex: 70, minHeight: 44, paddingHorizontal: 8, paddingVertical: room?.game ? 8 : 0, borderRadius: 8, backgroundColor: "#392b13f5", flexDirection: "row", alignItems: "center", gap: 8 }}><View pointerEvents="none" style={{ flex: 1 }}><Text numberOfLines={room?.game ? undefined : 2} accessibilityRole="alert" style={{ color: "#fff", fontSize: 12 }}>{message}</Text></View><TableButton label={state.error ? "Recharger" : "OK"} onPress={() => { if (state.error) void controller?.load(); service.setError(null); setNotice(null); }} /></View> : null}
      </View>
      <DetailDialog visible={dialog !== null} title={{ join: "Code de table", rules: "Règles de la table", invitations: "Invitations reçues", invite: "Inviter des amis", menu: title, host: "Hôte et présence", forfeit: "Déclarer forfait ?", preferences: "Préférences personnelles", table: "Paramètres partagés" }[dialog ?? "menu"]} onClose={() => setDialog(null)} reduceMotion={settings.reduced}>
        {dialog === "join" ? <>{body("Saisis le code reçu sur PC ou iPhone.")}<TextInput accessibilityLabel="Code de table" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={12} style={{ color: "#fff", borderWidth: 1, borderColor: "#ead8a680", borderRadius: 12, padding: 12, fontSize: 20, minHeight: 48 }} /><TableButton label="Rejoindre la table" primary disabled={busy || !code.trim()} onPress={() => { void run((api, who, signal) => api.find(who, signal, code)).then((next) => { if (next) open(next); }); }} /></> : null}
        {dialog === "rules" ? room && (!room.isHost || room.room.status !== "lobby" || room.viewerSeatIndex === null) ? <RulesSummary room={room} /> : <SoloRulesPanel key={room ? JSON.stringify(room.room.ruleset_snapshot) : "new"} initial={room ? rulesetToCustomInput(resolveRoomRules(room.room)) : rules} replacesGame={false} saveDisabled={busy} onCancel={() => setDialog(null)} onSave={async (draft) => { if (room) { const ok = await controller?.move({ type: "update-room-rules", rules: draft }); if (!ok) return false; } else setRules(draft); setDialog(null); return true; }} /> : null}
        {dialog === "invitations" ? <>{!received.length ? body("Aucune invitation en attente.") : received.map((i) => <View key={i.id} style={{ gap: 6 }}>{body(`${i.otherUsername} · Table ${i.roomCode}`)}<TableButton label={`Rejoindre ${i.otherUsername}`} disabled={busy} onPress={() => { void invitation(i, "join"); }} /><TableButton label={`Refuser ${i.otherUsername}`} disabled={busy} onPress={() => { void invitation(i, "decline"); }} /></View>)}</> : null}
        {dialog === "invite" ? <>{!friends.length ? body("Aucun ami disponible à inviter.") : friends.map((f) => <TableButton key={f.userId} label={`Inviter ${f.username}`} disabled={busy} onPress={() => { if (id) void run((api, who, signal) => api.invite(who, signal, id, f.userId)).then((result) => { if (result) { setNotice(result.status === "already_invited" ? "Invitation déjà envoyée." : "Invitation envoyée."); setDialog(null); } }); }} />)}</> : null}
        {dialog === "menu" ? <>
          {room ? <>{room.room.status === "lobby" && room.viewerSeatIndex !== null ? <><TableButton label="Quitter la place" disabled={busy} onPress={() => send({ type: "leave-seat" })} />{room.players.some((p) => p.kind === "empty") ? <TableButton label="Inviter" onPress={() => { void inviteFriends(); }} /> : null}</> : null}{body(`Code : ${room.room.code} · Objectif ${room.room.target_score} points`)}<TableButton label="Partager le code" onPress={() => { void Share.share({ message: `Rejoins ma table KFFR Contrée avec le code ${room.room.code}` }).catch(() => setNotice("Partage indisponible. Le code reste affiché.")); }} /><TableButton label="Règles" onPress={() => setDialog("rules")} /><TableButton label="Hôte et présence" onPress={() => setDialog("host")} /><TableButton label="Paramètres de table" onPress={() => setDialog("table")} />{room.room.status === "playing" ? <TableButton label="Déclarer forfait" onPress={() => setDialog("forfeit")} /> : null}</> : null}
          <TableButton label="Préférences" onPress={() => setDialog("preferences")} />
          <TableButton label="Revenir à l’accueil" onPress={() => { setDialog(null); router.replace("/"); }} />
        </> : null}
        {dialog === "host" && room ? <>{room.players.filter((p) => p.kind !== "empty").map((p) => <View key={p.seat_index} style={{ gap: 6 }}>{body(`${p.display_name} · ${p.is_host ? "Hôte · " : ""}${p.is_connected ? "En ligne" : "Absent"}${p.bot_takeover ? " · Bot temporaire" : ""}`)}{room.isHost && p.kind === "human" && p.seat_index !== room.viewerSeatIndex && p.is_connected ? <TableButton label={`Transférer à ${p.display_name}`} disabled={busy} onPress={() => send({ type: "transfer-host", targetSeatIndex: p.seat_index })} /> : null}{room.isHost && room.room.status === "playing" && p.kind === "human" && !p.is_connected && !p.bot_takeover ? <TableButton label={`Confier ${p.display_name} à un bot`} disabled={busy} onPress={() => send({ type: "enable-bot-takeover", seatIndex: p.seat_index })} /> : null}</View>)}{room.canClaimHost ? <TableButton label="Devenir hôte" disabled={busy} onPress={() => send({ type: "claim-host" })} /> : null}</> : null}
        {dialog === "forfeit" ? <>{body("Ton équipe perd la partie. Le résultat sera enregistré par le serveur.")}<TableButton label="Confirmer le forfait" primary disabled={busy} onPress={() => { void controller?.move({ type: "forfeit-game" }).then((ok) => { if (ok) setDialog(null); }); }} /></> : null}
        {dialog === "table" && room ? <>{body("Ces préférences sont communes à tous les joueurs. Seul l’hôte peut les modifier.")}<Choice label="Vitesse de table" value={tableSettings.gameSpeed} disabled={!room.isHost || room.viewerSeatIndex === null || busy} options={[["slow", "Lente"], ["normal", "Normale"], ["fast", "Rapide"], ["instant", "Instantanée"]]} onChange={(speed) => send({ type: "update-room-presentation", settings: withMultiplayerTableSpeed(tableSettings, speed as PresetGameSpeed) })} /><Choice label="Durée du pli" value={String(tableSettings.trickDisplayMs)} disabled={!room.isHost || room.viewerSeatIndex === null || busy} options={[["0", "Instantané"], ["500", "0,5 s"], ["1000", "1 s"], ["1500", "1,5 s"], ["2000", "2 s"], ["3000", "3 s"]]} onChange={(value) => send({ type: "update-room-presentation", settings: withMultiplayerTableTrickDisplay(tableSettings, Number(value)) })} /><Toggle label="Ramassage automatique partagé" value={tableSettings.autoCollectTricks} disabled={!room.isHost || room.viewerSeatIndex === null || busy} onChange={(value) => send({ type: "update-room-presentation", settings: { ...tableSettings, autoCollectTricks: value } })} /></> : null}
        {dialog === "preferences" ? <>{body("Le rythme et le ramassage communs restent définis dans les paramètres de table.")}<SoloSettingsPanel managedTable preferences={settings.preferences} onChange={settings.update} onTestSound={() => audio.sound("ui")} music={audio.music} /></> : null}
        {notice ? body(notice) : null}{service.error ? body(service.error) : null}
      </DetailDialog>
    </SafeAreaView>
  </SoloAppearance>;
}
function TurnClock({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <Text accessibilityLabel="Temps du tour" style={{ position: "absolute", right: 56, bottom: 8, color: "#ead8a6", fontSize: 11 }}>{Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))} s</Text>;
}
const panel = { flex: 1, borderWidth: 1, borderColor: "#ead8a638", borderRadius: 16, backgroundColor: "#0b2b21", padding: 12, gap: 8, justifyContent: "center" as const };

function RulesSummary({ room }: { room: MultiplayerRoomView }) {
  const r = resolveRoomRules(room.room);
  const contracts = ["Couleurs", r.bidding.allowNoTrump && "Sans Atout", r.bidding.allowAllTrump && "Tout Atout", r.bidding.allowCapot && "Capot", r.bidding.allowGenerale && "Générale", r.bidding.allowCoinche && "Coinche", r.bidding.allowSurcoinche && "Surcoinche"].filter(Boolean).join(" · ");
  return <View style={{ gap: 10 }}><Text style={styles.heading}>{r.id === "contree-kffr" ? "Contrée KFFR" : "Variante personnalisée"} · {r.game.targetScore} points</Text><Text style={styles.body}>{contracts}</Text><Text style={styles.body}>{r.announcements.enabled ? "Avec annonces" : "Sans annonces"} · {r.belote.enabled ? `Belote ${r.belote.points} pts` : "Sans belote"}</Text>{rulesetDifferences(r).map((d) => <Text key={d.label} style={styles.body}>{d.kind === "added" ? "+" : d.kind === "removed" ? "−" : "↔"} {d.label}</Text>)}</View>;
}
