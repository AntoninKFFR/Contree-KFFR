import { formatBidLabel } from "@/lib/solo/tableAnnouncements";
import { SoloAppearance, SoloText as Text } from "@/solo/appearance";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AccountGate } from "@/components/AccountGate";
import { DetailDialog, styles } from "@/components/ui";
import { soloBotCollectionKey, scheduleSoloBotTurn, type SoloBotTurnPacer } from "@/lib/soloBotPacing";
import { queueForcedHumanLastCard } from "@/lib/soloLastTrick";
import { getContractProgress } from "@/engine/contractProgress";
import { playerName } from "@/engine/players";
import { formatContractLabel } from "@/engine/contractMode";
import { useSolo } from "@/solo/useSolo";
import { useSoloPreferences } from "@/solo/preferences";
import { useTablePresentation } from "@/solo/presentation";
import { SoloScene, RoundCompletion, TrickCards } from "@/solo/scene";
import { TableButton } from "@/solo/table-controls";
import type { SoloIntent } from "@/solo/contract";
import { SoloSettingsPanel } from "@/solo/settings-panel";
import { useSoloRules, SoloRulesPanel } from "@/solo/rules-panel";
import { useSoloAudio } from "@/solo/audio";
export { cardLabel } from "@/solo/card-face";

export default function SoloScreen() { return <AccountGate bottomInset><SoloRoom /></AccountGate>; }
function SoloRoom() {
  const router = useRouter();
  const { state, controller } = useSolo(), settings = useSoloPreferences(), rules = useSoloRules();
  const insets = useSafeAreaInsets(), window = useWindowDimensions();
  const width = window.width - insets.left - insets.right, height = window.height - insets.top - insets.bottom;
  const [dialog, setDialog] = useState<"menu" | "exit" | "new" | "last" | "details" | "table" | "settings" | "rules" | null>(null);
  const session = state.session, game = session?.state;
  const ready = Boolean(controller && !state.busy && !state.requiresSync && !state.error && settings.loaded && rules.loaded);
  const enabled = ready && state.active && window.width > window.height;
  const human = enabled && game?.currentPlayerId === 0;
  const presentation = useTablePresentation(session, settings.preferences, settings.reduced, enabled);
  const audio = useSoloAudio(settings.preferences, session, presentation.lastCollected);
  const pacer = useRef<SoloBotTurnPacer | null>(null);
  useEffect(() => {
    if (!enabled || !game || !["bidding", "playing"].includes(game.phase) || game.currentPlayerId === 0) return;
    const key = soloBotCollectionKey(game, settings.preferences, settings.reduced);
    const next = scheduleSoloBotTurn(game.phase === "bidding" ? settings.preferences.gameplay.biddingDelayMs : settings.preferences.gameplay.botDelayMs,
      key && !presentation.isCollected(key) ? key : null, () => { void controller?.move({ type: "advance-bot" }); });
    pacer.current = next;
    return () => { next.cancel(); if (pacer.current === next) pacer.current = null; };
    // A collection releases the running timer below; it must not restart its bot delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, session?.id, session?.version, game, controller, settings.preferences, settings.reduced]);
  useEffect(() => { if (presentation.lastCollected) pacer.current?.autoCollected(presentation.lastCollected); }, [presentation.lastCollected]);
  useEffect(() => {
    if (!enabled || !game || game.currentPlayerId !== 0) return;
    return queueForcedHumanLastCard(game, 0, settings.preferences.gameplay.botDelayMs, (expected, card) => {
      if (controller?.state.session?.state === expected) void controller.move({ type: "play-card", playerId: 0, card });
    });
  }, [enabled, game, controller, settings.preferences.gameplay.botDelayMs]);
  function send(intent: SoloIntent) { if (ready) void controller?.move(intent); }
  const last = game?.completedTricks.at(-1), progress = game ? getContractProgress(game) : null;
  return <SoloAppearance value={{ textSize: settings.preferences.visual.textSize, contrast: settings.preferences.visual.highContrast, reduced: settings.reduced, sound: () => audio.sound("ui") }}><SafeAreaView testID="solo-screen" edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: "#06120d" }}>
    <View style={{ flex: 1, overflow: "hidden" }} aria-hidden={dialog !== null} accessibilityElementsHidden={dialog !== null} importantForAccessibility={dialog !== null ? "no-hide-descendants" : "auto"}>
      {game && state.active && settings.loaded ? <>
        <SoloScene session={session!} width={width} height={height} preferences={settings.preferences} reduced={settings.reduced} human={human} onIntent={send}
          layers={presentation.layers} cardPresentations={presentation.cardPresentations} presented={presentation.presented} policy={presentation.policy} onCollect={presentation.collect} onLastTrick={() => setDialog("last")} />
        {game.phase === "finished" || game.phase === "game-over" ? <RoundCompletion game={game} disabled={!ready} onAction={() => game.phase === "game-over" ? setDialog("new") : send({ type: "start-next-round" })} onDetails={() => setDialog("details")} reduced={settings.reduced} /> : null}
      </> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 68, gap: 12 }}>
        {!state.hydrated || state.busy || !settings.loaded ? <><ActivityIndicator color="#ead8a6" accessibilityLabel="Chargement Solo" /><Text style={styles.body}>Recherche de ta partie…</Text></> : <>
          <Text accessibilityRole="header" style={styles.heading}>{session ? "Partie sauvegardée" : "Solo · Contrée KFFR"}</Text>
          <Text style={styles.body}>{session ? `Manche ${game?.roundNumber} · Nous ${game?.totalScore[0]} / Eux ${game?.totalScore[1]}` : "La table KFFR, face aux bots du jeu web."}</Text>
          {session && !state.requiresSync ? <TableButton label="Reprendre" primary onPress={() => controller?.resume()} /> : null}
          <TableButton label="Nouvelle partie" primary disabled={state.busy || !state.hydrated || !rules.loaded} onPress={() => session ? setDialog("new") : void controller?.start(rules.rules)} />
        </>}
      </View>}
      {state.error ? <View style={{ position: "absolute", zIndex: 60, left: 64, right: 64, top: 48, backgroundColor: "#241910f5", borderColor: "#fca5a5", borderWidth: 1, borderRadius: 12, padding: 8, flexDirection: "row", alignItems: "center", gap: 8 }}><Text accessibilityRole="alert" style={[styles.body, { flex: 1 }]}>{state.error}</Text><TableButton label="Recharger" disabled={state.busy} onPress={() => { void controller?.load(); }} /></View> : null}
      <View style={{ position: "absolute", left: 4, top: 4, zIndex: 50, width: 44 }}><TableButton label="←" accessibilityLabel="Quitter la table et revenir à l’accueil" onPress={() => setDialog("exit")} symbol chrome /></View>
      <View style={{ position: "absolute", right: 4, top: 4, zIndex: 50, width: 44 }}><TableButton label="☰" accessibilityLabel="Menu Partie" onPress={() => setDialog("menu")} symbol chrome /></View>
      <View style={{ position: "absolute", right: 4, bottom: 12, zIndex: 50, width: 44 }}><TableButton label="‹" accessibilityLabel="Menu KFFR" onPress={() => setDialog("menu")} symbol chrome /></View>
    </View>
    <DetailDialog reduceMotion={settings.reduced} visible={dialog !== null} title={{ menu: "Menu Partie", exit: "Revenir à l’accueil ?", new: "Nouvelle partie", settings: "Paramètres", rules: "Règles de la prochaine partie", table: "La table", last: "Dernier pli", details: "Détails de la manche" }[dialog ?? "menu"]} onClose={() => setDialog(null)}>    {dialog === "menu" ? <>
      <TableButton label="Table, enchères et scores" onPress={() => setDialog("table")} />
      <TableButton label="Paramètres" onPress={() => setDialog("settings")} />
      <TableButton label="Règles de la prochaine partie" onPress={() => setDialog("rules")} />
      <TableButton label="Nouvelle partie" onPress={() => setDialog("new")} />
      <TableButton label="Revenir à l’accueil" onPress={() => setDialog("exit")} />
    </> : null}
    {dialog === "exit" ? <><Text style={styles.body}>Ta partie reste sauvegardée sur le serveur.</Text><TableButton label="Revenir à l’accueil" primary onPress={() => { setDialog(null); router.replace("/"); }} /><TableButton label="Rester à la table" onPress={() => setDialog(null)} /></> : null}
    {dialog === "new" ? <><Text style={styles.body}>La reprise sur cet appareil pointera vers la nouvelle partie. La partie actuelle reste sauvegardée sur le serveur.</Text><TableButton label="Commencer" primary disabled={state.busy || !rules.loaded} onPress={() => { setDialog(null); void controller?.start(rules.rules); }} /><TableButton label="Annuler" onPress={() => setDialog(null)} /></> : null}
    {dialog === "settings" ? <>{settings.error ? <Text accessibilityRole="alert" style={styles.body}>{settings.error}</Text> : null}<SoloSettingsPanel preferences={settings.preferences} onChange={settings.update} onTestSound={() => audio.sound("ui")} music={audio.music} /></> : null}
    {dialog === "rules" ? <>{rules.error ? <Text accessibilityRole="alert" style={styles.body}>{rules.error}</Text> : null}{dialog === "rules" ? <SoloRulesPanel initial={rules.rules} onCancel={() => setDialog(null)} onSave={async (draft) => { const saved = await rules.save(draft); if (saved) setDialog(null); return saved; }} /> : null}</> : null}
    {dialog === "table" ? <>{game ? <>
      <Text style={styles.heading}>Manche {game.roundNumber} · Nous {game.totalScore[0]} / Eux {game.totalScore[1]}</Text>
      <Text style={styles.body}>{game.contract ? formatContractLabel(game.contract) : "Enchères en cours"}</Text>{!settings.preferences.visual.compactLayout ? <Text style={styles.body}>{game.message}</Text> : null}
      {settings.preferences.assistance.showContractProgress && progress ? <Text style={styles.body}>{progress.label}</Text> : null}
      {([0, 1, 2, 3] as const).map((p) => <Text key={p} style={styles.body}>{playerName(p, game.playerNames)} · {game.handCounts[p]} cartes{game.inactivePlayerId === p ? " · Ne joue pas cette donne" : ""}</Text>)}
      {game.bids.map((bid, i) => <Text key={i} style={styles.body}>{playerName(bid.playerId, game.playerNames)} : {formatBidLabel(bid).label}</Text>)}
    </> : null}</> : null}
    {dialog === "last" ? <>{last ? <><Text style={styles.body}>{playerName(last.winnerId, game?.playerNames)} gagne · {last.points} points</Text><View style={{ alignSelf: "center" }}><TrickCards cards={last.cards} height={72} preferences={settings.preferences} reduced details /></View></> : null}</> : null}
    {dialog === "details" ? <>{game?.result?.kind === "played" ? <>
      <Text style={styles.body}>Points de plis : {game.result.trickPointsByTeam[0]} — {game.result.trickPointsByTeam[1]}</Text><Text style={styles.body}>Points détaillés : {game.result.totalPointsByTeam[0]} — {game.result.totalPointsByTeam[1]}</Text><Text style={styles.body}>Belote : {game.result.belotePointsByTeam[0]} — {game.result.belotePointsByTeam[1]}</Text><Text style={styles.body}>Annonces : {game.result.announcementPointsByTeam[0]} — {game.result.announcementPointsByTeam[1]}</Text><Text style={styles.body}>Multiplicateur : ×{game.result.multiplier}</Text>{last ? <Text style={styles.body}>Dernier pli : {playerName(last.winnerId, game.playerNames)} · {last.points} points</Text> : null}
    </> : <Text style={styles.body}>Tous ont passé. Nouvelle donne.</Text>}</> : null}
    </DetailDialog>
  </SafeAreaView></SoloAppearance>;
}
