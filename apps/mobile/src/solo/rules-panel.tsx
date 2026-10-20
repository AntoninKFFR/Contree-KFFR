import { SoloText as Text } from "./appearance";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { buildCustomRuleset, mergeRulesetDraft, rulesetToCustomInput, type CustomRulesetInput, type RulesetOverrides } from "@/engine/rulesets/custom";
import { soloEnvironment } from "@/solo/environment";
import { Choice, Toggle } from "./settings-panel";
import { TableButton } from "./table-controls";

const STORAGE_KEY = "coinche:solo-rules:v1";
export function useSoloRules() {
  const [rules, setRules] = useState<CustomRulesetInput>({ presetId: "contree-kffr" }), [loaded, setLoaded] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void soloEnvironment.storage.getItem(STORAGE_KEY).then((raw) => { if (live && raw) setRules(rulesetToCustomInput(buildCustomRuleset(JSON.parse(raw)))); })
      .catch(() => { if (live) setError("Règles locales indisponibles. La variante KFFR est utilisée."); }).finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);
  async function save(draft: CustomRulesetInput) {
    const safe = rulesetToCustomInput(buildCustomRuleset(draft));
    try { await soloEnvironment.storage.setItem(STORAGE_KEY, JSON.stringify(safe)); setRules(safe); setError(null); return true; }
    catch { setError("Impossible de sauvegarder ces règles. Réessaie."); return false; }
  }
  return { rules, loaded, error, save };
}
const booleans = {
  bidding: [["allowCapot", "Capot"], ["allowGenerale", "Générale"], ["allowCoinche", "Coinche"], ["allowSurcoinche", "Surcoinche"], ["allowNoTrump", "Sans Atout"], ["allowAllTrump", "Tout Atout"]],
  announcements: [["enabled", "Jouer avec les annonces"], ["tierce", "Tierce"], ["fifty", "Cinquante"], ["hundred", "Cent"], ["squares", "Carrés"]],
  belote: [["enabled", "Belote / Rebelote"], ["countsForContractSuccess", "Compte pour réussir le contrat"], ["countsForContractFailure", "Compte pour faire chuter le contrat"], ["allowInAllTrump", "Belote/Rebelote en Tout Atout"]],
  cardPlay: [["mustFollowSuit", "Obligation de fournir"], ["mustTrumpWhenVoid", "Obligation de couper"], ["mustOvertrump", "Obligation de surcouper"], ["mustRaiseAtTrump", "Obligation de monter à l’atout"], ["allowDiscardWhenPartnerWinning", "Défausse autorisée si le partenaire est maître"], ["allowDiscardWhenCannotOvertrump", "Défausse autorisée si je ne peux pas surcouper"]],
  contractSuccess: [["mustReachBid", "Le preneur doit atteindre son contrat"], ["mustBeatDefense", "Le preneur doit battre la défense"], ["announcementsCount", "Les annonces comptent pour réussir le contrat"]],
  scoring: [["roundToTen", "Arrondir à la dizaine"], ["doubleAllPointsOnCoinche", "Doubler tous les points en cas de Coinche"], ["announcementsLostOnFailure", "Transférer les annonces en cas de chute"], ["announcementsLostOnCapot", "Transférer les annonces en cas de capot"]],
} as const;
const sections = [["game", "Partie"], ["bidding", "Contrats"], ["announcements", "Annonces"], ["belote", "Belote"], ["cardPlay", "Jeu"], ["contractSuccess", "Réussite du contrat"], ["scoring", "Score"], ["advanced", "Avancé"]] as const;
function NumberRule({ label, value, onChange, min = 0, disabled = false }: { label: string; value: number; onChange: (value: number) => void; min?: number; disabled?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const text = editing ?? String(value);
  return <View style={{ gap: 8, paddingVertical: 8 }}><Text style={{ color: "#f4ead0", fontWeight: "700" }}>{label}</Text><TextInput accessibilityLabel={label} value={text} editable={!disabled} keyboardType="number-pad" onChangeText={setEditing} onBlur={() => { const n = Number(text); if (text.trim() && Number.isSafeInteger(n) && n >= min && n <= 100000) onChange(n); setEditing(null); }} style={{ minHeight: 44, borderWidth: 1, borderColor: "#ffffff26", padding: 10, borderRadius: 8, color: disabled ? "#ffffff55" : "#fff", fontSize: 16 }} /></View>;
}
export function SoloRulesPanel({ initial, onSave, onCancel }: { initial: CustomRulesetInput; onSave: (draft: CustomRulesetInput) => Promise<boolean>; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial), [section, setSection] = useState<string>("game"), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [reset, setReset] = useState(false);
  const rules = buildCustomRuleset(draft);
  function patch(value: RulesetOverrides) {
    try { const next = mergeRulesetDraft(draft, value); buildCustomRuleset(next); setDraft(next); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Règle invalide"); }
  }
  function disabled(group: string, key: string) {
    return busy || group === "announcements" && key !== "enabled" && !rules.announcements.enabled
      || group === "belote" && key !== "enabled" && !rules.belote.enabled
      || key === "allowInAllTrump" && !rules.bidding.allowAllTrump || key === "allowSurcoinche" && !rules.bidding.allowCoinche
      || ["announcementsCount", "announcementsLostOnFailure", "announcementsLostOnCapot"].includes(key) && !rules.announcements.enabled
      || key === "doubleAllPointsOnCoinche" && !rules.bidding.allowCoinche;
  }
  return <View style={{ gap: 12 }}>
    <Text style={{ color: "#ffffffb3" }}>Ces règles s’appliquent à la prochaine partie. La partie en cours garde ses règles serveur.</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>{sections.map(([id, label]) => <TableButton key={id} label={label} selected={section === id} onPress={() => setSection(id)} />)}</View>
    {section in booleans ? booleans[section as keyof typeof booleans].map(([key, label]) => <Toggle key={key} label={label} value={Boolean((rules[section as keyof typeof booleans] as unknown as Record<string, unknown>)[key])} disabled={disabled(section, key)} onChange={(value) => patch({ [section]: { [key]: value } })} />) : null}
    {section === "game" ? <><Choice label="Score cible" value={String(rules.game.targetScore)} options={[["500", "500"], ["1000", "1000"], ["1500", "1500"], ["2000", "2000"], ...(![500, 1000, 1500, 2000].includes(rules.game.targetScore) ? [[String(rules.game.targetScore), "Personnalisé"] as const] : [])]} onChange={(v) => patch({ game: { targetScore: Number(v) } })} /><NumberRule label="Score cible personnalisé" value={rules.game.targetScore} min={100} onChange={(v) => patch({ game: { targetScore: v } })} /></> : null}
    {section === "belote" ? <NumberRule label="Valeur de la Belote" value={rules.belote.points} disabled={!rules.belote.enabled} onChange={(v) => patch({ belote: { points: v } })} /> : null}
    {section === "scoring" ? <Choice label="Mode de score" value={rules.scoring.mode} options={[["ffb", "Officiel"], ["contract-only", "Contrat uniquement"], ["contract-only-160-failure", "Contrat uniquement / base de chute"], ["points-only", "Points réalisés"]]} onChange={(v) => patch({ scoring: { mode: v as typeof rules.scoring.mode } })} /> : null}
    {section === "advanced" ? <><NumberRule label="Valeur de la Générale" min={1} value={rules.scoring.generaleBasePoints} disabled={!rules.bidding.allowGenerale} onChange={(v) => patch({ scoring: { generaleBasePoints: v } })} /><Toggle label="Générale Sans Atout" value={rules.bidding.generaleAllowNoTrump} disabled={!rules.bidding.allowGenerale || !rules.bidding.allowNoTrump} onChange={(v) => patch({ bidding: { generaleAllowNoTrump: v } })} /><Toggle label="Générale Tout Atout" value={rules.bidding.generaleAllowAllTrump} disabled={!rules.bidding.allowGenerale || !rules.bidding.allowAllTrump} onChange={(v) => patch({ bidding: { generaleAllowAllTrump: v } })} /><NumberRule label="Multiplicateur Coinche" value={rules.scoring.coincheMultiplier} min={1} disabled={!rules.bidding.allowCoinche} onChange={(v) => patch({ scoring: { coincheMultiplier: v } })} /><NumberRule label="Multiplicateur Surcoinche" value={rules.scoring.surcoincheMultiplier} min={1} disabled={!rules.bidding.allowCoinche} onChange={(v) => patch({ scoring: { surcoincheMultiplier: v } })} /></> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: "#fca5a5" }}>{error}</Text> : null}
    <TableButton label="Enregistrer les règles" primary disabled={busy} onPress={() => { setBusy(true); void onSave(rulesetToCustomInput(rules)).then((saved) => { if (!saved) setError("Sauvegarde impossible. Réessaie."); }).finally(() => setBusy(false)); }} />
    <TableButton label="Annuler" onPress={onCancel} disabled={busy} />
    <TableButton label={reset ? "Confirmer la réinitialisation KFFR" : "Réinitialiser les règles"} onPress={() => { if (reset) { setDraft({ presetId: "contree-kffr" }); setReset(false); } else setReset(true); }} />
  </View>;
}
