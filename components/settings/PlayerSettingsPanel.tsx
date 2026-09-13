"use client";

import { useState } from "react";
import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { moveSuit } from "@/lib/preferences/handSorting";
import { playPreferenceSound } from "@/lib/preferences/audio";
import type { GameSpeed, PlayerPreferences } from "@/lib/preferences/playerPreferences";
import { usePlayerPreferences } from "./PlayerPreferencesProvider";

type ToggleProps = {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

function Toggle({ checked, description, disabled = false, label, onChange }: ToggleProps) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-md border p-3 ${disabled ? "opacity-55" : "bg-white"}`}>
      <span><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-stone-600">{description}</span></span>
      <input aria-label={label} checked={checked} className="mt-1 h-5 w-5 shrink-0 accent-emerald-700" disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <section aria-labelledby={`settings-${title}`} className="space-y-2"><h3 className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-900" id={`settings-${title}`}>{title}</h3>{children}</section>;
}

export function PlayerSettingsPanel() {
  const { preferences, reset, setGameSpeed, setPreferences } = usePlayerPreferences();
  const [confirmReset, setConfirmReset] = useState(false);
  const update = <K extends keyof PlayerPreferences>(section: K, patch: Partial<PlayerPreferences[K]>) => {
    playPreferenceSound("ui", preferences);
    setPreferences((current) => ({
      ...current,
      [section]: { ...(current[section] as object), ...patch },
    } as PlayerPreferences));
  };
  const gameSpeedLabels: Record<GameSpeed, string> = { slow: "Lente", normal: "Normale", fast: "Rapide", instant: "Instantanée" };

  return (
    <div className="space-y-6 overflow-y-auto pr-1">
      <Section title="JEU">
        <label className="block rounded-md border bg-white p-3 text-sm font-semibold">Vitesse de jeu
          <span className="mt-0.5 block text-xs font-normal text-stone-600">Règle uniquement le rythme visuel des bots, enchères et plis.</span>
          <select aria-label="Vitesse de jeu" className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2" onChange={(event) => { playPreferenceSound("ui", preferences); setGameSpeed(event.target.value as GameSpeed); }} value={preferences.gameplay.gameSpeed}>{Object.entries(gameSpeedLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <Toggle checked={preferences.gameplay.autoCollectTricks} description={`Après ${preferences.gameplay.trickDisplayMs} ms. Sinon, utilise le bouton Continuer.`} label="Ramasser les plis automatiquement" onChange={(checked) => update("gameplay", { autoCollectTricks: checked })} />
        <Toggle checked={preferences.gameplay.confirmCoinche} description="Demander une confirmation avant de contrer." label="Confirmer la Coinche" onChange={(checked) => update("gameplay", { confirmCoinche: checked })} />
        <Toggle checked={preferences.gameplay.confirmSurcoinche} description="Demander une confirmation avant de surcontrer." label="Confirmer la Surcoinche" onChange={(checked) => update("gameplay", { confirmSurcoinche: checked })} />
        <Toggle checked={preferences.gameplay.confirmGenerale} description="Demander une confirmation avant une Générale." label="Confirmer la Générale" onChange={(checked) => update("gameplay", { confirmGenerale: checked })} />
      </Section>

      <Section title="AIDES">
        <Toggle checked={preferences.assistance.highlightLegalCards} description="Ajoute une bordure et une légère élévation sans modifier les couleurs des cartes." label="Mettre en évidence les cartes jouables" onChange={(checked) => update("assistance", { highlightLegalCards: checked })} />
        <Toggle checked={preferences.assistance.dimIllegalCards} description="Réduit légèrement l'opacité des cartes interdites." label="Atténuer les cartes interdites" onChange={(checked) => update("assistance", { dimIllegalCards: checked })} />
        <Toggle checked={preferences.assistance.disableIllegalCardClicks} description="Désactive leur clic. Si désactivé, un clic explique la règle applicable." label="Bloquer les cartes non jouables" onChange={(checked) => update("assistance", { disableIllegalCardClicks: checked })} />
        <Toggle checked={preferences.assistance.showLivePoints} description="Affiche uniquement les points déjà publics pendant la donne." label="Afficher les points pendant la donne" onChange={(checked) => update("assistance", { showLivePoints: checked })} />
        <Toggle checked={preferences.assistance.showContractProgress} description="Affiche l'avancement selon les règles de réussite de la table." label="Afficher la progression du contrat" onChange={(checked) => update("assistance", { showContractProgress: checked })} />
        <Toggle checked={preferences.assistance.showLastTrick} description="Permet de revoir les cartes déjà jouées du pli précédent." label="Afficher le dernier pli" onChange={(checked) => update("assistance", { showLastTrick: checked })} />
        <Toggle checked={preferences.assistance.showTurnIndicator} description="Renforce la bordure du joueur qui doit agir." label="Mettre en évidence le joueur qui doit jouer" onChange={(checked) => update("assistance", { showTurnIndicator: checked })} />
      </Section>

      <Section title="CARTES">
        <Toggle checked={preferences.cards.autoSortHand} description="Réordonne seulement l'affichage, jamais les cartes du moteur." label="Ranger automatiquement les cartes" onChange={(checked) => update("cards", { autoSortHand: checked })} />
        <label className="block rounded-md border bg-white p-3 text-sm font-semibold">Mode de tri
          <select aria-label="Mode de tri des cartes" className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2" onChange={(event) => update("cards", { sortMode: event.target.value as PlayerPreferences["cards"]["sortMode"] })} value={preferences.cards.sortMode}><option value="suit-rank">Par couleur puis valeur</option><option value="rank-suit">Par valeur puis couleur</option><option value="manual">Manuel</option></select>
        </label>
        <fieldset className="rounded-md border bg-white p-3"><legend className="px-1 text-sm font-semibold">Ordre des couleurs</legend><div className="mt-1 grid gap-2 sm:grid-cols-2">{preferences.cards.suitOrder.map((suit, index) => <div className="flex items-center justify-between rounded border px-3 py-2" key={suit}><span className="font-semibold">{SUIT_SYMBOLS[suit]} {SUIT_LABELS[suit]}</span><span className="flex gap-1"><button aria-label={`Monter ${SUIT_LABELS[suit]}`} className="rounded border px-2 disabled:opacity-30" disabled={index === 0} onClick={() => update("cards", { suitOrder: moveSuit(preferences.cards.suitOrder, suit, -1) })} type="button">↑</button><button aria-label={`Descendre ${SUIT_LABELS[suit]}`} className="rounded border px-2 disabled:opacity-30" disabled={index === preferences.cards.suitOrder.length - 1} onClick={() => update("cards", { suitOrder: moveSuit(preferences.cards.suitOrder, suit, 1) })} type="button">↓</button></span></div>)}</div></fieldset>
        <label className="block rounded-md border bg-white p-3 text-sm font-semibold">Taille des cartes<select aria-label="Taille des cartes" className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2" onChange={(event) => update("cards", { cardSize: event.target.value as PlayerPreferences["cards"]["cardSize"] })} value={preferences.cards.cardSize}><option value="small">Petite</option><option value="medium">Normale</option><option value="large">Grande</option></select></label>
      </Section>

      <Section title="AFFICHAGE">
        <Toggle checked={preferences.visual.compactLayout} description="Réduit les espaces et métadonnées secondaires sans masquer le jeu." label="Interface compacte" onChange={(checked) => update("visual", { compactLayout: checked })} />
        <Toggle checked={preferences.visual.animations} description="Interrupteur principal de toutes les animations." label="Animations" onChange={(checked) => update("visual", { animations: checked })} />
        <Toggle checked={preferences.visual.dealAnimation} description="Anime l'apparition de la main." disabled={!preferences.visual.animations} label="Distribution des cartes" onChange={(checked) => update("visual", { dealAnimation: checked })} />
        <Toggle checked={preferences.visual.cardPlayAnimation} description="Anime les cartes posées sur la table." disabled={!preferences.visual.animations} label="Cartes jouées" onChange={(checked) => update("visual", { cardPlayAnimation: checked })} />
        <Toggle checked={preferences.visual.trickAnimation} description="Anime le ramassage des plis à 3 ou 4 cartes." disabled={!preferences.visual.animations} label="Ramassage du pli" onChange={(checked) => update("visual", { trickAnimation: checked })} />
        <Toggle checked={preferences.visual.biddingAnimation} description="Anime les bulles d'enchères." disabled={!preferences.visual.animations} label="Enchères" onChange={(checked) => update("visual", { biddingAnimation: checked })} />
      </Section>

      <Section title="SON">
        <Toggle checked={preferences.audio.enabled} description="Active les retours audio locaux. Aucun son n'est envoyé aux autres joueurs." label="Sons" onChange={(checked) => update("audio", { enabled: checked })} />
        <label className="block rounded-md border bg-white p-3 text-sm font-semibold">Volume général : {Math.round(preferences.audio.volume * 100)} %<input aria-label="Volume général" className="mt-2 w-full accent-emerald-700" disabled={!preferences.audio.enabled} max={100} min={0} onChange={(event) => update("audio", { volume: Number(event.target.value) / 100 })} type="range" value={Math.round(preferences.audio.volume * 100)} /></label>
        <Toggle checked={preferences.audio.cardSounds} description="Jouer une carte et ramasser un pli." disabled={!preferences.audio.enabled} label="Sons des cartes" onChange={(checked) => update("audio", { cardSounds: checked })} />
        <Toggle checked={preferences.audio.biddingSounds} description="Enchères, Coinche, Surcoinche, Capot et Générale." disabled={!preferences.audio.enabled} label="Sons des enchères" onChange={(checked) => update("audio", { biddingSounds: checked })} />
        <Toggle checked={preferences.audio.uiSounds} description="Boutons et confirmations de l'interface." disabled={!preferences.audio.enabled} label="Sons de l'interface" onChange={(checked) => update("audio", { uiSounds: checked })} />
      </Section>

      <Section title="ACCESSIBILITÉ">
        <Toggle checked={preferences.visual.reducedMotion} description="Réduit les mouvements. Le réglage système du navigateur est toujours respecté." label="Réduire les animations" onChange={(checked) => update("visual", { reducedMotion: checked })} />
        <Toggle checked={preferences.visual.highContrast} description="Renforce aussi les bordures et les repères, pas seulement les couleurs." label="Contraste renforcé" onChange={(checked) => update("visual", { highContrast: checked })} />
        <label className="block rounded-md border bg-white p-3 text-sm font-semibold">Taille du texte<select aria-label="Taille du texte" className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2" onChange={(event) => update("visual", { textSize: event.target.value as "normal" | "large" })} value={preferences.visual.textSize}><option value="normal">Normale</option><option value="large">Grande</option></select></label>
      </Section>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-stone-700">Cette action ne modifie jamais les règles de la partie.</p>{confirmReset ? <div className="mt-2 flex flex-wrap gap-2"><button className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => { playPreferenceSound("ui", preferences); reset(); setConfirmReset(false); }} type="button">Confirmer la réinitialisation</button><button className="rounded border px-3 py-2 text-sm font-semibold" onClick={() => setConfirmReset(false)} type="button">Annuler</button></div> : <button className="mt-2 rounded border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800" onClick={() => setConfirmReset(true)} type="button">Réinitialiser les paramètres</button>}</div>
    </div>
  );
}

export function PlayerSettingsDialog({ onClose }: { onClose: () => void }) {
  const { preferences } = usePlayerPreferences();
  return (
    <div aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" role="dialog">
      <section className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-xl bg-[#f4f1e8] p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Paramètres</h2><p className="text-xs text-stone-600">Uniquement mon interface. Les règles de la partie restent partagées et inchangées.</p></div><button className="rounded border px-3 py-1" onClick={() => { playPreferenceSound("ui", preferences); onClose(); }} type="button">Fermer</button></div>
        <PlayerSettingsPanel />
      </section>
    </div>
  );
}
