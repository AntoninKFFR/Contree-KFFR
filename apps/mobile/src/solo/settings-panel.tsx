import { SoloText as Text } from "./appearance";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { Host, Picker, Slider, Switch } from "@expo/ui";
import { clonePlayerPreferences, withCustomTiming, withGameSpeed, type PlayerPreferences, type PresetGameSpeed } from "@/lib/preferences/playerPreferences";
import { moveSuit } from "@/lib/preferences/handSorting";
import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { TableButton } from "./table-controls";

export function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return <View style={{ minHeight: 48, paddingVertical: 8, borderBottomWidth: 1, borderColor: "#ffffff14", justifyContent: "center" }}><Host matchContents={{ vertical: true }} style={{ width: "100%" }} ignoreSafeArea="all" colorScheme="dark" seedColor="#ead8a6"><Switch testID={label} label={label} value={value} onValueChange={onChange} disabled={disabled} /></Host></View>;
}
export function Choice({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (next: string) => void; disabled?: boolean }) {
  return <View style={{ gap: 8, paddingVertical: 8 }}><Text style={{ color: "#f4ead0", fontWeight: "700" }}>{label}</Text><Host matchContents={{ vertical: true }} style={{ width: "100%" }} ignoreSafeArea="all" colorScheme="dark" seedColor="#ead8a6"><Picker selectedValue={value} onValueChange={onChange} enabled={!disabled} testID={label}>{options.map(([value, label]) => <Picker.Item key={value} value={value} label={label} />)}</Picker></Host></View>;
}
function Range({ label, value, max, step = 50, onChange, disabled = false }: { label: string; value: number; max: number; step?: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <View style={{ paddingVertical: 8, gap: 8 }}><Text style={{ color: "#f4ead0", fontWeight: "700" }}>{label} : {max <= 1 ? Math.round(value * 100) + " %" : value + " ms"}</Text><Host matchContents={{ vertical: true }} style={{ width: "100%" }} ignoreSafeArea="all" colorScheme="dark" seedColor="#ead8a6"><Slider testID={label} min={0} max={max} step={step} value={value} onValueChange={onChange} disabled={disabled} /></Host></View>;
}
const sections = [["gameplay", "Jeu"], ["assistance", "Aides"], ["cards", "Cartes"], ["visual", "Affichage"], ["audio", "Son"], ["accessibility", "Accessibilité"]] as const;
const flags = {
  gameplay: [["autoCollectTricks", "Ramasser les plis automatiquement"], ["confirmCoinche", "Confirmer la Coinche"], ["confirmSurcoinche", "Confirmer la Surcoinche"], ["confirmCapot", "Confirmer le Capot"], ["confirmGenerale", "Confirmer la Générale"]],
  assistance: [["highlightLegalCards", "Mettre en avant les cartes jouables"], ["dimIllegalCards", "Atténuer les cartes interdites"], ["disableIllegalCardClicks", "Bloquer le clic sur les cartes illégales"], ["showLivePoints", "Afficher les points pendant la donne"], ["showContractProgress", "Afficher la progression du contrat"], ["showLastTrick", "Afficher le dernier pli"], ["showTurnIndicator", "Mettre en évidence le joueur actif"]],
  visual: [["compactLayout", "Interface compacte"], ["animations", "Animations"], ["dealAnimation", "Distribution des cartes"], ["cardPlayAnimation", "Cartes jouées"], ["trickAnimation", "Ramassage du pli"], ["biddingAnimation", "Enchères"]],
  audio: [["enabled", "Effets sonores"], ["cardSounds", "Sons des cartes"], ["biddingSounds", "Sons des enchères"], ["uiSounds", "Sons de l’interface"], ["musicEnabled", "Musique"]],
} as const;
export function SoloSettingsPanel({ preferences: p, onChange, onTestSound, music }: { preferences: PlayerPreferences; onChange: (p: PlayerPreferences) => void; onTestSound: () => void; music: { title: string; playing: boolean; toggle: () => void; next: () => void; previous: () => void } }) {
  const [section, setSection] = useState<string>("gameplay"), [query, setQuery] = useState(""), [reset, setReset] = useState(false);
  function patch<K extends keyof PlayerPreferences>(section: K, value: Partial<PlayerPreferences[K]>) { onChange({ ...p, [section]: { ...(p[section] as object), ...value } }); }
  const needle = query.trim().toLocaleLowerCase("fr"), shown = sections.filter(([id, label]) => !needle || `${label} ${id in flags ? flags[id as keyof typeof flags].map(([, label]) => label).join(" ") : "cartes tri couleur contraste texte mouvement"}`.toLocaleLowerCase("fr").includes(needle));
  const active = shown.some(([id]) => id === section) ? section : shown[0]?.[0];
  return <View style={{ gap: 12 }}>
    <TextInput accessibilityLabel="Rechercher un paramètre" placeholder="Rechercher un paramètre" placeholderTextColor="#ffffff66" value={query} onChangeText={setQuery} style={{ minHeight: 44, borderWidth: 1, borderColor: "#ffffff26", borderRadius: 12, padding: 10, color: "#f5f1e7", fontSize: 16 }} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>{shown.map(([id, label]) => <TableButton key={id} label={label} selected={active === id} onPress={() => setSection(id)} />)}</View>
    {!active ? <Text style={{ color: "#fff" }}>Aucun paramètre ne correspond à « {query} ».</Text> : null}
    {active === "gameplay" ? <>
      <Choice label="Vitesse de jeu" value={p.gameplay.gameSpeed} options={[["slow", "Lente"], ["normal", "Normale"], ["fast", "Rapide"], ["instant", "Instantanée"], ["custom", "Personnalisée"]]} onChange={(speed) => { if (speed !== "custom") onChange(withGameSpeed(p, speed as PresetGameSpeed)); }} />
      {flags.gameplay.map(([key, label]) => <Toggle key={key} label={label} value={p.gameplay[key]} onChange={(v) => patch("gameplay", { [key]: v })} />)}
      {([["botDelayMs", "Temps de réflexion visuel des bots", 2000], ["trickDisplayMs", "Durée d’affichage d’un pli", 3000], ["biddingDelayMs", "Délai entre enchères", 1500]] as const).map(([key, label, max]) => <Range key={key} label={label} max={max} value={p.gameplay[key]} onChange={(v) => onChange(withCustomTiming(p, key, v))} />)}
    </> : null}
    {active === "assistance" ? flags.assistance.map(([key, label]) => <Toggle key={key} label={label} value={p.assistance[key]} onChange={(v) => patch("assistance", { [key]: v })} />) : null}
    {active === "cards" ? <>
      <Toggle label="Ranger automatiquement les cartes" value={p.cards.autoSortHand} onChange={(v) => patch("cards", { autoSortHand: v })} />
      <Choice label="Mode de tri des cartes" value={p.cards.sortMode} options={[["suit-rank", "Par couleur puis valeur"], ["rank-suit", "Par valeur puis couleur"]]} disabled={!p.cards.autoSortHand} onChange={(v) => patch("cards", { sortMode: v as "suit-rank" | "rank-suit" })} />
      {p.cards.suitOrder.map((suit, i) => <View key={suit} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Text style={{ color: "#fff", flex: 1 }}>{SUIT_SYMBOLS[suit]} {SUIT_LABELS[suit]}</Text><TableButton label="↑" accessibilityLabel={`Monter ${SUIT_LABELS[suit]}`} disabled={i === 0} onPress={() => patch("cards", { suitOrder: moveSuit(p.cards.suitOrder, suit, -1) })} /><TableButton label="↓" accessibilityLabel={`Descendre ${SUIT_LABELS[suit]}`} disabled={i === 3} onPress={() => patch("cards", { suitOrder: moveSuit(p.cards.suitOrder, suit, 1) })} /></View>)}
      <Choice label="Taille des cartes" value={p.cards.cardSize} options={[["small", "Petite"], ["medium", "Normale"], ["large", "Grande"]]} onChange={(v) => patch("cards", { cardSize: v as "small" | "medium" | "large" })} />
      <Choice label="Style des cartes" value={p.cards.cardStyle} options={[["classic", "Classique"], ["modern", "Moderne"]]} onChange={(v) => patch("cards", { cardStyle: v as "classic" | "modern" })} />
    </> : null}
    {active === "visual" ? <>
      <Choice label="Tapis de jeu" value={p.visual.tableTheme} options={[["classic-green", "Vert classique"], ["midnight-blue", "Bleu nuit"], ["burgundy", "Bordeaux"], ["dark-neutral", "Neutre sombre"]]} onChange={(v) => patch("visual", { tableTheme: v as PlayerPreferences["visual"]["tableTheme"] })} />
      {flags.visual.map(([key, label]) => <Toggle key={key} label={label} value={p.visual[key]} disabled={key !== "animations" && key !== "compactLayout" && !p.visual.animations} onChange={(v) => patch("visual", { [key]: v })} />)}
    </> : null}
    {active === "audio" ? <>
      {flags.audio.map(([key, label]) => <Toggle key={key} label={label} value={p.audio[key]} disabled={!["enabled", "musicEnabled"].includes(key) && !p.audio.enabled} onChange={(v) => patch("audio", { [key]: v })} />)}
      <Range label="Volume des effets" max={1} step={.01} value={p.audio.volume} disabled={!p.audio.enabled} onChange={(v) => patch("audio", { volume: v })} />
      <TableButton label="Tester le son" disabled={!p.audio.enabled || p.audio.volume === 0} onPress={onTestSound} />
      <Range label="Volume musique" max={1} step={.01} value={p.audio.musicVolume} disabled={!p.audio.musicEnabled} onChange={(v) => patch("audio", { musicVolume: v })} />
      <Text style={{ color: "#f4ead0" }}>{music.title}</Text><View style={{ flexDirection: "row", gap: 8 }}><TableButton label="Précédent" onPress={music.previous} /><TableButton label={music.playing ? "Pause" : "Écouter"} disabled={!p.audio.musicEnabled} onPress={music.toggle} /><TableButton label="Suivant" onPress={music.next} /></View>
    </> : null}
    {active === "accessibility" ? <><Toggle label="Réduire les animations" value={p.visual.reducedMotion} onChange={(v) => patch("visual", { reducedMotion: v })} /><Text style={{ color: "#ffffff99" }}>Le réglage iOS reste toujours prioritaire.</Text><Toggle label="Contraste renforcé" value={p.visual.highContrast} onChange={(v) => patch("visual", { highContrast: v })} /><Choice label="Taille du texte" value={p.visual.textSize} options={[["normal", "Normale"], ["large", "Grande"]]} onChange={(v) => patch("visual", { textSize: v as "normal" | "large" })} /></> : null}
    <TableButton label={reset ? "Confirmer la réinitialisation" : "Réinitialiser mes paramètres"} onPress={() => { if (reset) { onChange(clonePlayerPreferences()); setReset(false); } else setReset(true); }} />{reset ? <TableButton label="Annuler" onPress={() => setReset(false)} /> : null}
  </View>;
}
