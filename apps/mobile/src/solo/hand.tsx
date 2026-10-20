import { SoloText as Text } from "./appearance";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { sortHandForDisplay } from "@/lib/preferences/handSorting";
import { isPreferenceAnimationEnabled } from "@/lib/preferences/presentation";
import type { PlayerPreferences } from "@/lib/preferences/playerPreferences";
import { soloLegalHumanCards } from "@/lib/solo/publicState";
import { resolveContractMode } from "@/engine/contractMode";
import { resolveGameRules } from "@/engine/rulesets/resolve";
import { explainIllegalCard } from "@/engine/illegalCardExplanation";
import { cardKey, type Card, type NativeSoloSession } from "./contract";
import { CardFace, cardLabel } from "./card-face";

export function NativeHand({ game, width, height, canPlay, onPlay, preferences, reduced, pendingCard = null }: { game: NativeSoloSession["state"]; width: number; height: number; canPlay: boolean; onPlay: (card: Card) => void; preferences: PlayerPreferences; reduced: boolean; pendingCard?: Card | null }) {
  const mode = resolveContractMode(game), legal = soloLegalHumanCards(game);
  const cards = sortHandForDisplay(game.hand, preferences.cards, mode);
  const [notice, setNotice] = useState<{ scope: string; message: string | null } | null>(null), [focused, setFocused] = useState<string | null>(null);
  const scope = `${game.roundNumber}:${game.currentTrick.cards.length}:${game.hand.map(cardKey).join()}:${canPlay}`;
  const feedback = notice?.scope === scope ? notice.message : null;
  const setFeedback = (message: string | null) => setNotice(message ? { scope, message } : null);
  useEffect(() => { if (!feedback) return; const timer = setTimeout(() => setNotice(null), 2800); return () => clearTimeout(timer); }, [feedback]);
  const bidding = game.phase === "bidding";
  const cardWidth = bidding ? Math.min(68, Math.max(56, height * .7)) : Math.max(56, height * .68);
  const stride = 45, fanWidth = cardWidth + stride * Math.max(0, cards.length - 1);
  const start = (width - fanWidth) / 2 + 10; // Same 72px / 52px asymmetric hand gutters as web.
  const animate = isPreferenceAnimationEnabled(preferences, "deal", reduced);
  return <View testID="solo-hand" accessibilityLabel="Ta main, au Sud" pointerEvents="box-none" style={{ position: "absolute", insetInline: 0, bottom: bidding ? -22 : -24, height, zIndex: 20 }}>
    {feedback ? <Text accessibilityRole="alert" style={{ position: "absolute", left: 72, right: 52, bottom: height + 8, color: "#fff", backgroundColor: "#1c1917ee", padding: 8, borderRadius: 8 }}>{feedback}</Text> : null}
    {cards.map((card, index) => {
      const key = cardKey(card), allowed = legal.some((c) => cardKey(c) === key), disabled = !canPlay || (!allowed && preferences.assistance.disableIllegalCardClicks);
      const pending = pendingCard !== null && cardKey(pendingCard) === key;
      const delta = index - (cards.length - 1) / 2;
      return <View key={key} testID="solo-hand-card" style={{ position: "absolute", left: start + stride * index, top: Math.abs(delta) * 1.7, transformOrigin: "bottom center", transform: [{ rotate: `${delta * 3.24}deg` }], zIndex: index }}>
        <Animated.View entering={animate ? FadeInDown.duration(220).delay(index * 35) : undefined}>
          <Pressable testID={pending ? "solo-pending-card" : undefined} accessibilityRole="button" accessibilityLabel={"Jouer " + cardLabel(card) + (pending ? ", envoi en cours" : "")} accessibilityState={{ disabled, busy: pending }} disabled={disabled}
            onFocus={() => setFocused(key)} onBlur={() => setFocused(null)}
            onPress={() => { if (allowed) { setFeedback(null); onPlay(card); } else if (mode) setFeedback(explainIllegalCard({ hand: game.hand, trick: game.currentTrick, playerId: 0, card, mode, rules: resolveGameRules(game.settings).cardPlay })); }}
            style={({ pressed }) => ({ opacity: canPlay && !allowed && preferences.assistance.dimIllegalCards ? .55 : 1, transform: [{ translateY: pending || canPlay && (pressed || focused === key) ? -8 : canPlay && allowed && preferences.assistance.highlightLegalCards ? -4 : 0 }], outlineWidth: !pending && focused === key ? 2 : 0, outlineColor: "#ead8a6", outlineOffset: 3 })}>
            <CardFace card={card} height={height} width={cardWidth} modern={preferences.cards.cardStyle === "modern"} contrast={preferences.visual.highContrast} />
          </Pressable>
        </Animated.View>
      </View>;
    })}
  </View>;
}
