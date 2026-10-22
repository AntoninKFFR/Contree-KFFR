import { SoloText as Text } from "./appearance";
import { useState } from "react";
import { View } from "react-native";
import { canBidCapot, canBidGenerale, canBidGeneraleMode, canCoinche, canSurcoinche, getAvailableBidValues, getCurrentContractFromBids } from "@/engine/bidding";
import { SUITS, SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { formatContractLabel } from "@/engine/contractMode";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import type { BidValue, ContractMode } from "@/engine/types";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";
import { preferredBidMode, shouldConfirmBidAction, bidConfirmationMessage, type ConfirmableBidAction } from "@/lib/solo/biddingPresentation";
import { DetailDialog } from "@/components/ui";
import type { NativeSoloSession, SoloIntent } from "./contract";
import { TableButton } from "./table-controls";

export function NativeBidding({ game, canBid, width, height, handHeight, top, preferences, reduced, onIntent }: { game: NativeSoloSession["state"]; canBid: boolean; width: number; height: number; handHeight: number; top: number; preferences: PlayerPreferences; reduced: boolean; onIntent: (intent: SoloIntent) => void }) {
  const rules = resolveGameRules(game.settings), contract = getCurrentContractFromBids(game.bids);
  const values = getAvailableBidValues(contract, rules.bidding);
  const [selected, setValue] = useState<BidValue | undefined>(values[0]), [mode, setMode] = useState<ContractMode>(() => {
    const preferred = preferredBidMode(game.bids, game.viewerPlayerId);
    return preferred.kind === "no-trump" && !rules.bidding.allowNoTrump || preferred.kind === "all-trump" && !rules.bidding.allowAllTrump ? { kind: "suit", suit: "hearts" } : preferred;
  });
  const value = selected !== undefined && values.includes(selected) ? selected : values[0];
  const [pending, setPending] = useState<{ action: ConfirmableBidAction; intent: SoloIntent } | null>(null);
  const [panelHeight, setPanelHeight] = useState(82);
  const capot = canBidCapot(contract, rules.bidding), generale = canBidGenerale(contract, rules.bidding) && canBidGeneraleMode(mode, rules.bidding);
  const chooseMode = values.length > 0 || capot || generale, actionOnly = canBid && !chooseMode;
  function special(action: ConfirmableBidAction) {
    const intent: SoloIntent = action === "capot" || action === "generale" ? { type: action, playerId: game.viewerPlayerId, contractMode: mode } : { type: action, playerId: game.viewerPlayerId };
    if (shouldConfirmBidAction(action, preferences)) setPending({ action, intent }); else onIntent(intent);
  }
  const panelWidth = Math.min(actionOnly ? 360 : 560, width - 128);
  const specialBelow = panelWidth < 388;
  const valueColumnWidth = Math.max(236, (panelWidth - 10) * 5 / 8);
  const choice = (label: string, onPress: () => void, selected = false, disabled = !canBid, accessibilityLabel = label, symbol = false) => <TableButton key={accessibilityLabel} label={label} onPress={onPress} selected={selected} disabled={disabled} accessibilityLabel={accessibilityLabel} symbol={symbol} reduced={reduced} style={{ flex: 1 }} />;
  return <View testID="solo-bidding" onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)} style={{ position: "absolute", width: panelWidth, left: (width - panelWidth) / 2, top: actionOnly ? 52 + (height - handHeight - 52) / 2 - panelHeight / 2 : top, zIndex: 30 }}>
    <View style={{ position: "absolute", top: -18, left: 8, right: 8, flexDirection: "row", gap: 5, alignItems: "center" }}><Text style={{ color: "#cbb989", fontSize: 8, fontWeight: "800" }}>ENCHÈRES</Text><Text style={{ color: "#f5f1e7", fontWeight: "900", fontSize: 12 }}>{canBid ? "À toi de parler" : "Les autres joueurs annoncent…"}</Text>{contract && width > 650 ? <Text numberOfLines={1} style={{ color: "#ead8a6", fontSize: 10, flexShrink: 1 }}>{formatContractLabel(contract)}</Text> : null}</View>
    <View style={{ backgroundColor: "#0c201bf5", borderColor: "#ead8a659", borderWidth: 1, borderRadius: 16, gap: 4, boxShadow: "0 12px 32px #0006" }}>
      {!actionOnly ? <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ width: valueColumnWidth, gap: 4 }}>
          {Array.from({ length: Math.ceil((values.length + 1) / 5) }, (_, row) => <View key={row} style={{ flexDirection: "row", gap: 4 }}>{Array.from({ length: 5 }, (_, column) => {
            const n = row * 5 + column, amount = values[n];
            if (amount) return choice(String(amount), () => setValue(amount), value === amount, !canBid, `Valeur ${amount}`);
            if (n === values.length) return choice("Capot", () => special("capot"), false, !canBid || !capot);
            return <View key={n} style={{ flex: 1 }} />;
          })}</View>)}
        </View>
        <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
          <View style={{ flex: 2, gap: 4 }}>{[0, 1].map((row) => <View key={row} style={{ flexDirection: "row", gap: 4 }}>{SUITS.slice(row * 2, row * 2 + 2).map((suit) => choice(SUIT_SYMBOLS[suit] + "\uFE0E", () => setMode({ kind: "suit", suit }), mode.kind === "suit" && mode.suit === suit, !canBid || !chooseMode, `Atout ${SUIT_LABELS[suit]}`, true))}</View>)}</View>
          {!specialBelow && (rules.bidding.allowNoTrump || rules.bidding.allowAllTrump) ? <View style={{ flex: 1, gap: 4 }}>{rules.bidding.allowNoTrump ? choice("SA", () => setMode({ kind: "no-trump" }), mode.kind === "no-trump", !canBid || !chooseMode, "Atout Sans Atout") : null}{rules.bidding.allowAllTrump ? choice("TA", () => setMode({ kind: "all-trump" }), mode.kind === "all-trump", !canBid || !chooseMode, "Atout Tout Atout") : null}</View> : null}
        </View>
      </View> : <Text style={{ color: "#f5f1e7", fontSize: 12, padding: 8 }}>{contract?.status === "coinched" ? "Contrat contré : passer ou surcontrer." : "Passer ou contrer le contrat."}</Text>}
      <View style={{ flexDirection: "row", gap: 4 }}>
        {specialBelow && !actionOnly && rules.bidding.allowNoTrump ? <TableButton label="SA" accessibilityLabel="Atout Sans Atout" selected={mode.kind === "no-trump"} disabled={!canBid || !chooseMode} onPress={() => setMode({ kind: "no-trump" })} /> : null}
        {specialBelow && !actionOnly && rules.bidding.allowAllTrump ? <TableButton label="TA" accessibilityLabel="Atout Tout Atout" selected={mode.kind === "all-trump"} disabled={!canBid || !chooseMode} onPress={() => setMode({ kind: "all-trump" })} /> : null}
        {!actionOnly ? <TableButton label="Annoncer" primary disabled={!canBid || value === undefined} onPress={() => { if (value) onIntent({ type: "bid", playerId: game.viewerPlayerId, value, contractMode: mode }); }} style={{ flex: 1 }} reduced={reduced} /> : null}
        {choice("Passer", () => onIntent({ type: "pass", playerId: game.viewerPlayerId }))}
        {rules.bidding.allowGenerale && (!actionOnly || generale) ? choice("Générale", () => special("generale"), false, !canBid || !generale) : null}
        {canBid && canCoinche(game.viewerPlayerId, contract, rules.bidding) ? choice("Contrer", () => special("coinche")) : null}
        {canBid && canSurcoinche(game.viewerPlayerId, contract, rules.bidding) ? choice("Surcontrer", () => special("surcoinche")) : null}
      </View>
    </View>
    <DetailDialog reduceMotion={reduced} visible={Boolean(pending)} title="Confirmation d’enchère" onClose={() => setPending(null)}><Text style={{ color: "#f5f1e7", fontSize: 16 }}>{pending ? bidConfirmationMessage(pending.action, contract, mode) : ""}</Text><TableButton label="Confirmer" primary onPress={() => { if (pending) onIntent(pending.intent); setPending(null); }} /><TableButton label="Annuler" onPress={() => setPending(null)} /></DetailDialog>
  </View>;
}
