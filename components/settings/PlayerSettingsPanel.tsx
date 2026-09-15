"use client";

import { useEffect, useMemo, useState } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { playPreferenceSound } from "@/lib/preferences/audio";
import { moveSuit } from "@/lib/preferences/handSorting";
import { withCustomTiming, type PlayerPreferences, type PresetGameSpeed } from "@/lib/preferences/playerPreferences";
import {
  normalizeMultiplayerTablePreferences,
  withMultiplayerTableSpeed,
  withMultiplayerTableTrickDisplay,
  type MultiplayerTablePreferences,
} from "@/lib/multiplayerTablePreferences";
import { usePlayerPreferences } from "./PlayerPreferencesProvider";

const SECTIONS = [
  { id: "game", label: "Jeu", keywords: "vitesse délai temps bot enchère pli ramassage confirmation coinche surcoinche capot générale" },
  { id: "help", label: "Aides", keywords: "carte jouable interdite score contrat dernier pli tour" },
  { id: "cards", label: "Cartes", keywords: "carte tri couleur taille style classique moderne" },
  { id: "display", label: "Affichage", keywords: "interface tapis thème animation distribution enchère pli" },
  { id: "sound", label: "Son", keywords: "son audio volume tester carte enchère interface" },
  { id: "accessibility", label: "Accessibilité", keywords: "accessibilité mouvement contraste texte taille" },
] as const;
type SectionId = typeof SECTIONS[number]["id"];

function Toggle({ checked, description, disabled = false, disabledReason, label, onChange }: { checked: boolean; description: string; disabled?: boolean; disabledReason?: string; label: string; onChange: (checked: boolean) => void }) {
  return <label className={`group flex items-start justify-between gap-4 rounded-2xl border p-3.5 transition ${disabled ? "border-stone-200/80 bg-stone-100/70 text-stone-500" : "border-stone-300/70 bg-[#fffdf7] shadow-[0_8px_24px_rgb(41_37_36_/_6%)] hover:border-emerald-700/30"}`}><span><span className="block text-sm font-bold text-stone-900 group-has-[:disabled]:text-stone-500">{label}</span><span className="mt-1 block text-xs leading-relaxed text-stone-600">{disabled && disabledReason ? disabledReason : description}</span></span><span className="relative mt-0.5 shrink-0"><input aria-label={label} checked={checked} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span aria-hidden="true" className="pointer-events-none block h-6 w-11 rounded-full bg-stone-300 shadow-inner transition peer-checked:bg-emerald-700 peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-700 peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5" /></span></label>;
}

function Field({ children, description, label }: { children: React.ReactNode; description?: string; label: string }) {
  return <label className="block rounded-2xl border border-stone-300/70 bg-[#fffdf7] p-3.5 text-sm font-bold shadow-[0_8px_24px_rgb(41_37_36_/_6%)]">{label}{description ? <span className="mt-1 block text-xs font-normal leading-relaxed text-stone-600">{description}</span> : null}{children}</label>;
}

export function formatPreferenceDuration(value: number): string {
  return value < 1_000 ? `${value} ms` : `${(value / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
}

function TimingField({ label, max, step, value, onChange }: { label: string; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><div className="mt-2 flex items-center gap-3"><input aria-label={label} className="min-w-0 flex-1 accent-emerald-700" max={max} min={0} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} /><output className="w-16 text-right font-mono text-xs text-emerald-900">{formatPreferenceDuration(value)}</output></div></Field>;
}

export type PlayerSettingsContext =
  | { mode: "solo" }
  | {
      mode: "multiplayer";
      isHost: boolean;
      tablePreferences?: MultiplayerTablePreferences;
      isSavingTablePreferences?: boolean;
      onTablePreferencesChange?: (settings: MultiplayerTablePreferences) => void;
    };

const SOLO_SETTINGS_CONTEXT: PlayerSettingsContext = { mode: "solo" };

export function PlayerSettingsPanel({ context = SOLO_SETTINGS_CONTEXT }: { context?: PlayerSettingsContext }) {
  const { preferences, reset, setGameSpeed, setPreferences } = usePlayerPreferences();
  const [active, setActive] = useState<SectionId>("game");
  const [query, setQuery] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const update = <K extends keyof PlayerPreferences>(section: K, patch: Partial<PlayerPreferences[K]>, sound = true) => {
    if (sound) playPreferenceSound("ui", preferences);
    setPreferences((current) => ({ ...current, [section]: { ...(current[section] as object), ...patch } } as PlayerPreferences));
  };
  const visibleSections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return needle ? SECTIONS.filter((section) => `${section.label} ${section.keywords}`.toLocaleLowerCase("fr").includes(needle)) : [...SECTIONS];
  }, [query]);
  const selected = visibleSections.some((section) => section.id === active) ? active : visibleSections[0]?.id;
  const timing = (key: "botDelayMs" | "trickDisplayMs" | "biddingDelayMs", value: number) => setPreferences((current) => withCustomTiming(current, key, value));
  const speedLabels: Record<PresetGameSpeed | "custom", string> = { slow: "Lente", normal: "Normale", fast: "Rapide", instant: "Instantanée", custom: "Personnalisée" };

  return <div className="coinche-settings-panel flex h-full min-h-0 flex-1 flex-col bg-[#eeeade] text-stone-900">
    <div className="shrink-0 border-b border-stone-300/70 bg-[#f6f2e8] px-4 py-2.5 sm:px-6"><input aria-label="Rechercher un paramètre" className="w-full rounded-xl border border-stone-300/80 bg-[#fffdf7] px-3 py-2.5 text-sm text-stone-900 shadow-inner outline-none placeholder:text-stone-500 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un paramètre" type="search" value={query} /></div>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:grid md:grid-cols-[210px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
      <nav aria-label="Sections des paramètres" className="flex shrink-0 overflow-x-auto border-b border-stone-300/70 bg-[#e5e3d9] p-2 md:flex-col md:overflow-hidden md:border-b-0 md:border-r md:p-4">
        <div className="flex shrink-0 gap-1.5 md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto md:overscroll-contain">
          {visibleSections.map((section) => <button aria-current={selected === section.id ? "page" : undefined} className={`whitespace-nowrap rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition ${selected === section.id ? "border-emerald-950 bg-[#123c2b] text-[#f6edda] shadow-md" : "border-transparent bg-transparent text-stone-700 hover:border-stone-300 hover:bg-[#f5f1e7]"}`} key={section.id} onClick={() => setActive(section.id)} type="button">{section.label.toLocaleUpperCase("fr")}</button>)}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1.5 border-l border-stone-400/40 pl-2 md:ml-0 md:mt-3 md:block md:border-l-0 md:border-t md:pl-0 md:pt-3">
          {confirmReset ? <div className="flex gap-1.5 md:grid"><button className="rounded-lg border border-red-800/25 bg-red-50 px-2.5 py-2 text-xs font-bold text-red-900 transition hover:bg-red-100" onClick={() => { reset(); setConfirmReset(false); }} type="button">Confirmer</button><button className="rounded-lg border border-stone-300 bg-white/70 px-2.5 py-2 text-xs font-bold text-stone-700 transition hover:bg-white" onClick={() => setConfirmReset(false)} type="button">Annuler</button></div> : <button className="whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-stone-600 transition hover:bg-white/55 hover:text-red-900" onClick={() => setConfirmReset(true)} type="button">Réinitialiser mes paramètres</button>}
        </div>
      </nav>
      <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_right,rgb(255_255_255_/_55%),transparent_45%)] p-4 [scrollbar-gutter:stable] sm:p-6">
        {!selected ? <p className="rounded-lg border bg-white p-4 text-sm">Aucun paramètre ne correspond à « {query} ».</p> : null}
        {selected === "game" ? <GameSettings context={context} preferences={preferences} setGameSpeed={setGameSpeed} timing={timing} update={update} speedLabels={speedLabels} /> : null}
        {selected === "help" ? <HelpSettings preferences={preferences} update={update} /> : null}
        {selected === "cards" ? <CardSettings preferences={preferences} update={update} /> : null}
        {selected === "display" ? <DisplaySettings preferences={preferences} update={update} /> : null}
        {selected === "sound" ? <SoundSettings preferences={preferences} update={update} /> : null}
        {selected === "accessibility" ? <AccessibilitySettings preferences={preferences} update={update} /> : null}
      </div>
    </div>
  </div>;
}

type Update = <K extends keyof PlayerPreferences>(section: K, patch: Partial<PlayerPreferences[K]>, sound?: boolean) => void;
function GameSettings({ context, preferences, setGameSpeed, speedLabels, timing, update }: { context: PlayerSettingsContext; preferences: PlayerPreferences; setGameSpeed: (speed: PresetGameSpeed) => void; speedLabels: Record<PresetGameSpeed | "custom", string>; timing: (key: "botDelayMs" | "trickDisplayMs" | "biddingDelayMs", value: number) => void; update: Update }) {
  return <section aria-labelledby="settings-game" className="space-y-3"><h3 className="text-lg font-bold" id="settings-game">Jeu</h3>{context.mode === "solo" ? <><Field description="Règle uniquement le rythme visuel. Le moteur calcule toujours immédiatement." label="Vitesse de jeu"><select aria-label="Vitesse de jeu" className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2" onChange={(event) => { if (event.target.value !== "custom") setGameSpeed(event.target.value as PresetGameSpeed); }} value={preferences.gameplay.gameSpeed}>{Object.entries(speedLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Toggle checked={preferences.gameplay.autoCollectTricks} description={`Ramasse après ${formatPreferenceDuration(preferences.gameplay.trickDisplayMs)}. Sinon, un bouton indique qui a gagné.`} label="Ramasser les plis automatiquement" onChange={(v) => update("gameplay", { autoCollectTricks: v })} /></> : <TablePacingSettings context={context} speedLabels={speedLabels} />}<div className="grid gap-2 sm:grid-cols-2"><Toggle checked={preferences.gameplay.confirmCoinche} description="Demander avant de contrer." label="Confirmer la Coinche" onChange={(v) => update("gameplay", { confirmCoinche: v })} /><Toggle checked={preferences.gameplay.confirmSurcoinche} description="Demander avant de surcontrer." label="Confirmer la Surcoinche" onChange={(v) => update("gameplay", { confirmSurcoinche: v })} /><Toggle checked={preferences.gameplay.confirmCapot} description="Demander avant d'annoncer un Capot." label="Confirmer le Capot" onChange={(v) => update("gameplay", { confirmCapot: v })} /><Toggle checked={preferences.gameplay.confirmGenerale} description="Demander avant d'annoncer une Générale." label="Confirmer la Générale" onChange={(v) => update("gameplay", { confirmGenerale: v })} /></div>{context.mode === "solo" ? <details className="rounded-xl border border-stone-300 bg-stone-50 p-3"><summary className="cursor-pointer font-bold">Réglages avancés <span className="font-normal text-stone-500">· délais précis</span></summary><div className="mt-3 grid gap-2"><TimingField label="Temps de réflexion visuel des bots" max={2000} onChange={(v) => timing("botDelayMs", v)} step={50} value={preferences.gameplay.botDelayMs} /><TimingField label="Durée d'affichage d'un pli" max={3000} onChange={(v) => timing("trickDisplayMs", v)} step={50} value={preferences.gameplay.trickDisplayMs} /><TimingField label="Délai entre enchères" max={1500} onChange={(v) => timing("biddingDelayMs", v)} step={50} value={preferences.gameplay.biddingDelayMs} /></div></details> : null}</section>;
}

function TablePacingSettings({ context, speedLabels }: { context: Extract<PlayerSettingsContext, { mode: "multiplayer" }>; speedLabels: Record<PresetGameSpeed | "custom", string> }) {
  const sourceSettings = context.tablePreferences;
  const settings = normalizeMultiplayerTablePreferences(sourceSettings);
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(normalizeMultiplayerTablePreferences(sourceSettings)), [sourceSettings]);
  if (!context.isHost || !context.onTablePreferencesChange) {
    return <div className="rounded-2xl border border-stone-300/70 bg-[#fffdf7] p-3.5 text-sm shadow-[0_8px_24px_rgb(41_37_36_/_6%)]"><strong className="text-stone-900">Rythme de la table : {speedLabels[settings.gameSpeed]}</strong><span className="mt-1 block text-xs leading-relaxed text-stone-600">{context.tablePreferences ? "Défini par l’hôte et appliqué à tous les joueurs." : "Il sera défini par l’hôte une fois dans la table."}</span></div>;
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(settings);
  return <div className="space-y-3 rounded-2xl border border-stone-300/70 bg-[#fffdf7] p-3.5 shadow-[0_8px_24px_rgb(41_37_36_/_6%)]"><div><h4 className="font-bold text-stone-900">Rythme de la table</h4><p className="mt-1 text-xs leading-relaxed text-stone-600">Ces réglages sont partagés avec tous les joueurs.</p></div><Field description="Règle la présentation commune des plis." label="Vitesse de jeu"><select aria-label="Vitesse de jeu de la table" className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2" onChange={(event) => { if (event.target.value !== "custom") setDraft((current) => withMultiplayerTableSpeed(current, event.target.value as PresetGameSpeed)); }} value={draft.gameSpeed}>{Object.entries(speedLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Toggle checked={draft.autoCollectTricks} description={`Ramasse après ${formatPreferenceDuration(draft.trickDisplayMs)}. Sinon, chaque joueur voit le bouton de ramassage.`} label="Ramassage automatique des plis" onChange={(autoCollectTricks) => setDraft((current) => ({ ...current, autoCollectTricks }))} /><details className="rounded-xl border border-stone-300 bg-stone-50 p-3"><summary className="cursor-pointer font-bold text-stone-900">Réglages avancés <span className="font-normal text-stone-500">· délai réellement appliqué</span></summary><div className="mt-3"><TimingField label="Durée d'affichage d'un pli" max={3000} onChange={(value) => setDraft((current) => withMultiplayerTableTrickDisplay(current, value))} step={50} value={draft.trickDisplayMs} /></div></details><button className="w-full rounded-lg bg-emerald-800 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!changed || context.isSavingTablePreferences} onClick={() => context.onTablePreferencesChange?.(draft)} type="button">{context.isSavingTablePreferences ? "Application…" : "Appliquer à la table"}</button></div>;
}

function HelpSettings({ preferences, update }: { preferences: PlayerPreferences; update: Update }) {
  const rows: [keyof PlayerPreferences["assistance"], string, string][] = [["highlightLegalCards","Mettre en évidence les cartes jouables","Ajoute un léger lift et un contour sans altérer les couleurs."],["dimIllegalCards","Atténuer les cartes interdites","Réduit leur présence sans masquer leur couleur."],["disableIllegalCardClicks","Bloquer les cartes non jouables","Si désactivé, un clic affiche brièvement la règle applicable."],["showLivePoints","Afficher les points pendant la donne","Uniquement les points déjà publics."],["showContractProgress","Afficher la progression du contrat","Objectif et points manquants, sans prédiction."],["showLastTrick","Afficher le dernier pli","Cartes, ordre, gagnant et points publics."],["showTurnIndicator","Mettre en évidence le joueur actif","Renforce son contour et son statut."]];
  return <section aria-labelledby="settings-help" className="space-y-2"><h3 className="text-lg font-bold" id="settings-help">Aides</h3>{rows.map(([key,label,description]) => <Toggle checked={preferences.assistance[key]} description={description} key={key} label={label} onChange={(v) => update("assistance", { [key]: v })} />)}</section>;
}

function CardSettings({ preferences, update }: { preferences: PlayerPreferences; update: Update }) {
  return <section aria-labelledby="settings-cards" className="space-y-3"><h3 className="text-lg font-bold" id="settings-cards">Cartes</h3><Toggle checked={preferences.cards.autoSortHand} description="Réordonne uniquement l'affichage, jamais la main du moteur." label="Ranger automatiquement les cartes" onChange={(v) => update("cards", { autoSortHand: v })} /><Field label="Mode de tri"><select aria-label="Mode de tri des cartes" className="mt-2 w-full rounded-lg border px-3 py-2" disabled={!preferences.cards.autoSortHand} onChange={(event) => update("cards", { sortMode: event.target.value as PlayerPreferences["cards"]["sortMode"] })} value={preferences.cards.sortMode}><option value="suit-rank">Par couleur puis valeur</option><option value="rank-suit">Par valeur puis couleur</option></select></Field><fieldset className="rounded-xl border bg-white p-3 shadow-sm"><legend className="px-1 text-sm font-semibold">Ordre des couleurs</legend><p className="mb-2 text-center text-xl" aria-live="polite">{preferences.cards.suitOrder.map((suit) => SUIT_SYMBOLS[suit]).join(" → ")}</p><div className="grid gap-2 sm:grid-cols-2">{preferences.cards.suitOrder.map((suit, index) => <div className="flex items-center justify-between rounded-lg border px-3 py-2" key={suit}><span className="font-semibold">{SUIT_SYMBOLS[suit]} {SUIT_LABELS[suit]}</span><span className="flex gap-1"><button aria-label={`Monter ${SUIT_LABELS[suit]}`} className="rounded border px-2 py-1 disabled:opacity-30" disabled={index === 0} onClick={() => update("cards", { suitOrder: moveSuit(preferences.cards.suitOrder, suit, -1) })} type="button">↑</button><button aria-label={`Descendre ${SUIT_LABELS[suit]}`} className="rounded border px-2 py-1 disabled:opacity-30" disabled={index === 3} onClick={() => update("cards", { suitOrder: moveSuit(preferences.cards.suitOrder, suit, 1) })} type="button">↓</button></span></div>)}</div></fieldset><div className="grid gap-2 sm:grid-cols-2"><Field label="Taille des cartes"><select aria-label="Taille des cartes" className="mt-2 w-full rounded-lg border px-3 py-2" onChange={(event) => update("cards", { cardSize: event.target.value as PlayerPreferences["cards"]["cardSize"] })} value={preferences.cards.cardSize}><option value="small">Petite</option><option value="medium">Normale</option><option value="large">Grande</option></select></Field><Field label="Style des cartes"><select aria-label="Style des cartes" className="mt-2 w-full rounded-lg border px-3 py-2" onChange={(event) => update("cards", { cardStyle: event.target.value as PlayerPreferences["cards"]["cardStyle"] })} value={preferences.cards.cardStyle}><option value="classic">Classique</option><option value="modern">Moderne</option></select></Field></div></section>;
}

function DisplaySettings({ preferences, update }: { preferences: PlayerPreferences; update: Update }) {
  const animations: [keyof PlayerPreferences["visual"], string][] = [["dealAnimation","Distribution des cartes"],["cardPlayAnimation","Cartes jouées"],["trickAnimation","Ramassage du pli"],["biddingAnimation","Enchères"]];
  return <section aria-labelledby="settings-display" className="space-y-2"><h3 className="text-lg font-bold" id="settings-display">Affichage</h3><Field description="Palette interne de la table, sans ressource téléchargée." label="Tapis de jeu"><select aria-label="Tapis de jeu" className="mt-2 w-full rounded-lg border px-3 py-2" onChange={(event) => update("visual", { tableTheme: event.target.value as PlayerPreferences["visual"]["tableTheme"] })} value={preferences.visual.tableTheme}><option value="classic-green">Vert classique</option><option value="midnight-blue">Bleu nuit</option><option value="burgundy">Bordeaux</option><option value="dark-neutral">Neutre sombre</option></select></Field><Toggle checked={preferences.visual.compactLayout} description="Réduit les espaces et métadonnées secondaires." label="Interface compacte" onChange={(v) => update("visual", { compactLayout: v })} /><Toggle checked={preferences.visual.animations} description="Interrupteur principal de toutes les animations." label="Animations" onChange={(v) => update("visual", { animations: v })} />{animations.map(([key,label]) => <Toggle checked={preferences.visual[key] as boolean} description={`Animation : ${label.toLocaleLowerCase("fr")}.`} disabled={!preferences.visual.animations} disabledReason="Active d'abord les animations." key={key} label={label} onChange={(v) => update("visual", { [key]: v })} />)}</section>;
}

function SoundSettings({ preferences, update }: { preferences: PlayerPreferences; update: Update }) {
  const sounds: [keyof PlayerPreferences["audio"], string, string][] = [["cardSounds","Sons des cartes","Jouer une carte et ramasser un pli."],["biddingSounds","Sons des enchères","Enchères, Coinche, Surcoinche, Capot et Générale."],["uiSounds","Sons de l'interface","Boutons et confirmations."]];
  return <section aria-labelledby="settings-sound" className="space-y-2"><h3 className="text-lg font-bold" id="settings-sound">Son</h3><Toggle checked={preferences.audio.enabled} description="Retours locaux uniquement ; ils ne bloquent jamais le jeu." label="Sons" onChange={(v) => update("audio", { enabled: v }, false)} /><Field label={`Volume général : ${Math.round(preferences.audio.volume * 100)} %`}><input aria-label="Volume général" className="mt-2 w-full accent-emerald-700" disabled={!preferences.audio.enabled} max={100} min={0} onChange={(event) => update("audio", { volume: Number(event.target.value) / 100 }, false)} type="range" value={Math.round(preferences.audio.volume * 100)} /></Field>{sounds.map(([key,label,description]) => <Toggle checked={preferences.audio[key] as boolean} description={description} disabled={!preferences.audio.enabled} disabledReason="Active d'abord les sons." key={key} label={label} onChange={(v) => update("audio", { [key]: v })} />)}<button className="w-full rounded-lg border border-emerald-700 bg-white px-3 py-2 text-sm font-bold text-emerald-900 disabled:opacity-50" disabled={!preferences.audio.enabled || preferences.audio.volume === 0} onClick={() => playPreferenceSound("ui", preferences)} type="button">Tester le son</button></section>;
}

function AccessibilitySettings({ preferences, update }: { preferences: PlayerPreferences; update: Update }) {
  return <section aria-labelledby="settings-accessibility" className="space-y-2"><h3 className="text-lg font-bold" id="settings-accessibility">Accessibilité</h3><Toggle checked={preferences.visual.reducedMotion} description="Le réglage système du navigateur reste toujours prioritaire." label="Réduire les animations" onChange={(v) => update("visual", { reducedMotion: v })} /><Toggle checked={preferences.visual.highContrast} description="Renforce cartes, boutons, table, modales, toggles et focus." label="Contraste renforcé" onChange={(v) => update("visual", { highContrast: v })} /><Field label="Taille du texte"><select aria-label="Taille du texte" className="mt-2 w-full rounded-lg border px-3 py-2" onChange={(event) => update("visual", { textSize: event.target.value as "normal" | "large" })} value={preferences.visual.textSize}><option value="normal">Normale</option><option value="large">Grande</option></select></Field></section>;
}

export function PlayerSettingsDialog({ context = SOLO_SETTINGS_CONTEXT, onClose }: { context?: PlayerSettingsContext; onClose: () => void }) {
  const multiplayer = context.mode === "multiplayer";
  return <AccessibleDialog closeLabel={multiplayer ? "Fermer les préférences" : "Fermer les paramètres"} minimalHeader onClose={onClose} stableHeight title={multiplayer ? "Préférences" : "Paramètres"}><PlayerSettingsPanel context={context} /></AccessibleDialog>;
}
