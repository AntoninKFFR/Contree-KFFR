import { AppEyebrow, AppSurface } from "@/components/ui/AppShell";
import type { DetailedPlayerStats } from "@/lib/detailedPlayerStats";

const rate = (value: number | null) => value === null ? "—" : `${value} %`;
const number = (value: number | null) => value === null ? "—" : String(value);
const signed = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value} pts`;
const below = (value: number | null) => value === null ? "—" : `-${value} pts`;

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-3">
    <p className="text-xs font-semibold text-[color:var(--text-secondary)]">{label}</p>
    <p className="mt-1 text-xl font-black tabular-nums text-[color:var(--text-primary)]">{value}</p>
  </div>;
}

function Line({ label, value }: { label: string; value: string | number }) {
  return <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[color:var(--border)] py-2 text-sm last:border-0">
    <span className="min-w-0 text-[color:var(--text-secondary)]">{label}</span>
    <strong className="shrink-0 tabular-nums text-[color:var(--text-primary)]">{value}</strong>
  </div>;
}

function ProgressBar({ label, value, tone = "success" }: { label: string; value: number | null; tone?: "success" | "danger" | "accent" }) {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--accent)";
  return <div className="min-w-0">
    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
      <span className="min-w-0 text-[color:var(--text-secondary)]">{label}</span>
      <strong className="shrink-0 tabular-nums">{rate(value)}</strong>
    </div>
    <div aria-label={`${label} : ${rate(value)}`} className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-muted)]" role="img">
      {value !== null ? <div className="h-full rounded-full" style={{ background: color, width: `${value}%` }} /> : null}
    </div>
  </div>;
}

export function DetailedStatsDashboard({ stats }: { stats: DetailedPlayerStats }) {
  const hasContracts = stats.attackShare !== null;
  return <div className="space-y-4">
    <AppSurface>
      <AppEyebrow>Vue d&apos;ensemble</AppEyebrow>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Parties jouées" value={stats.total} />
        <Metric label="Victoires" value={stats.wins} />
        <Metric label="Défaites" value={stats.losses} />
        <Metric label="Taux de victoire" value={rate(stats.winrate)} />
        <Metric label="Manches jouées" value={number(stats.rounds)} />
        <Metric label="Série actuelle" value={stats.currentStreak} />
        <Metric label="Meilleure série" value={stats.bestStreak} />
        <Metric label="Capots réalisés" value={number(stats.capotsMade)} />
      </div>
    </AppSurface>

    <AppSurface>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><AppEyebrow>Forme récente</AppEyebrow><span className="text-xs text-[color:var(--text-secondary)]">{stats.recentForm.sampleSize} dernière{stats.recentForm.sampleSize > 1 ? "s" : ""} partie{stats.recentForm.sampleSize > 1 ? "s" : ""}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Taux global" value={rate(stats.winrate)} />
        <Metric label="Taux récent" value={rate(stats.recentForm.winrate)} />
        <Metric label="Attaque récente" value={rate(stats.recentForm.attackSuccessRate)} />
        <Metric label="Défense récente" value={rate(stats.recentForm.defenseSuccessRate)} />
      </div>
      {stats.recentForm.results.length ? <div aria-label={`Résultats des ${stats.recentForm.sampleSize} dernières parties, de la plus ancienne à la plus récente : ${stats.recentForm.results.map((won) => won ? "victoire" : "défaite").join(", ")}`} className="mt-3 flex gap-1" role="img">
        {stats.recentForm.results.map((won, index) => <span aria-hidden="true" className={`h-3 min-w-0 flex-1 rounded-sm ${won ? "bg-[color:var(--success)]" : "bg-[color:var(--danger)]"}`} key={index} />)}
      </div> : <p className="mt-3 text-sm text-[color:var(--text-secondary)]">Aucune partie enregistrée.</p>}
      <p className="mt-1 text-xs text-[color:var(--text-secondary)]"><span className="text-[color:var(--success)]">■</span> Victoire · <span className="text-[color:var(--danger)]">■</span> Défaite · de gauche à droite, de l&apos;ancienne à la récente</p>
    </AppSurface>

    <AppSurface>
      <AppEyebrow>Répartition des manches avec contrat</AppEyebrow>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm font-black">
        <span className="text-[color:var(--success)]">⚔ Attaque · {rate(stats.attackShare)}</span>
        <span className="text-[color:var(--danger)]">{rate(stats.defenseShare)} · Défense 🛡</span>
      </div>
      <div aria-label={hasContracts ? `${stats.attackShare} % attaque, ${stats.defenseShare} % défense` : "Aucune manche avec contrat"} className="relative mt-3 flex h-4 overflow-hidden rounded-full bg-[color:var(--surface-muted)]" role="img">
        {hasContracts ? <><div className="h-full bg-[color:var(--success)]" style={{ width: `${stats.attackShare}%` }} /><div className="h-full flex-1 bg-[color:var(--danger)]" /></> : null}
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-[color:var(--text-primary)] opacity-80" />
        {hasContracts ? <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-[color:var(--text-primary)]" style={{ left: `${stats.attackShare}%` }} /> : null}
      </div>
      <p className="mt-1 text-center text-[11px] text-[color:var(--text-secondary)]">Repère 50 %</p>
      {!hasContracts ? <p className="mt-2 text-center text-sm text-[color:var(--text-secondary)]">Aucune manche avec contrat enregistrée.</p> : null}
    </AppSurface>

    <AppSurface className="border-l-4 !border-l-[color:var(--success)]">
      <h2 className="text-lg font-black text-[color:var(--success)]">⚔ Analyse attaque</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3">
          <p className="text-xs font-black uppercase tracking-wide text-[color:var(--text-secondary)]">Mes contrats · {number(stats.personalContracts)}</p>
          <p className="mt-1 text-2xl font-black text-[color:var(--success)]">{rate(stats.personalSuccessRate)} <span className="text-sm font-semibold text-[color:var(--text-secondary)]">réussis</span></p>
          <ProgressBar label="Réussite personnelle" value={stats.personalSuccessRate} />
          <div className="mt-2"><Line label="Contrat moyen 80–160" value={number(stats.personalAverageBid)} /><Line label="Points faits" value={number(stats.personalAverageTakerPoints)} /><Line label="Différentiel" value={signed(stats.personalAverageBidDifference)} /></div>
        </div>
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3">
          <p className="text-xs font-black uppercase tracking-wide text-[color:var(--text-secondary)]">Contrats du partenaire · {number(stats.partnerContracts)}</p>
          <p className="mt-1 text-2xl font-black text-[color:var(--success)]">{rate(stats.partnerSuccessRate)} <span className="text-sm font-semibold text-[color:var(--text-secondary)]">réussis</span></p>
          <ProgressBar label="Réussite du partenaire" value={stats.partnerSuccessRate} />
          <div className="mt-2"><Line label="Réussite de l'équipe en attaque" value={rate(stats.attackSuccessRate)} /><Line label="Contrats pris personnellement" value={rate(stats.personalContractShare)} /></div>
        </div>
      </div>
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        <Line label="Contrat moyen de l'équipe (80–160)" value={number(stats.averageBid)} />
        <Line label="Points réellement faits" value={number(stats.averageTakerPoints)} />
        <Line label="Différentiel moyen" value={signed(stats.averageBidDifference)} />
        <Line label="Marge sur contrats réussis" value={signed(stats.averageSuccessfulMargin)} />
        <Line label="Écart moyen lors d'une chute" value={signed(stats.averageFailedContractGap)} />
        <Line label="10 de der sécurisé" value={rate(stats.tenDeDerRate)} />
      </div>
    </AppSurface>

    <AppSurface>
      <AppEyebrow>Zone de confort · contrats 80–160</AppEyebrow>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-1">
          {stats.bidValues.map(({ value, contracts, successes, successRate }) => <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_7.5rem] items-center gap-2 text-xs sm:grid-cols-[3rem_minmax(0,1fr)_9rem]" key={value}>
            <strong className="tabular-nums">{value}</strong>
            <div aria-label={`Contrat ${value} : ${rate(successRate)}, ${successes} réussi${successes > 1 ? "s" : ""} sur ${contracts}`} className="h-3 overflow-hidden rounded-full bg-[color:var(--surface-muted)]" role="img"><div className="h-full rounded-full bg-[color:var(--success)]" style={{ width: `${successRate ?? 0}%` }} /></div>
            <span className="text-right tabular-nums text-[color:var(--text-secondary)]">{rate(successRate)} · {contracts ? `${successes}/${contracts}` : "—"}</span>
          </div>)}
          <p className="pt-1 text-[11px] text-[color:var(--text-secondary)]">Taux · contrats réussis / contrats joués</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {stats.contractZones.map((zone) => <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2" key={zone.label}>
            <div className="flex items-baseline justify-between gap-2"><strong className="text-sm">{zone.label}</strong><span className="text-xs text-[color:var(--text-secondary)]">{zone.range}</span></div>
            <p className="mt-1 text-sm tabular-nums">{rate(zone.successRate)} réussite · {stats.rounds === null ? "—" : zone.contracts} contrats</p>
          </div>)}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Contrat médian" value={number(stats.medianBid)} />
        <Metric label="Moyenne réussis" value={number(stats.averageSuccessfulBid)} />
        <Metric label="Moyenne chutés" value={number(stats.averageFailedBid)} />
        <Metric label="Marge réussite" value={signed(stats.averageSuccessfulMargin)} />
      </div>
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2"><Line label="Mes contrats classiques ≥ 120" value={rate(stats.personalAtLeast120Rate)} /><Line label="Mes contrats classiques ≥ 130" value={rate(stats.personalAtLeast130Rate)} /></div>
    </AppSurface>

    <div className="grid gap-4 lg:grid-cols-2">
      <AppSurface className="border-l-4 !border-l-[color:var(--danger)]">
        <h2 className="text-lg font-black text-[color:var(--danger)]">🛡 Analyse défense</h2>
        <div className="mt-2"><Line label="Contrats adverses mis en échec" value={rate(stats.defenseSuccessRate)} /><Line label="Points moyens en défense" value={number(stats.averageDefensePoints)} /><Line label="Écart des contrats adverses chutés (80–160)" value={signed(stats.averageDefeatedContractGap)} /><Line label="10 de der volé en défense" value={rate(stats.defenseTenDeDerRate)} /></div>
      </AppSurface>
      <AppSurface>
        <AppEyebrow>Qualité des chutes · contrats 80–160</AppEyebrow>
        <div aria-label={stats.fallTotal ? stats.fallBands.map((band) => `${band.label} ${rate(band.share)}`).join(", ") : "Aucune chute sous l'annonce"} className="mt-3 flex h-4 overflow-hidden rounded-full bg-[color:var(--surface-muted)]" role="img">
          {stats.fallBands.map((band, index) => band.contracts ? <span aria-hidden="true" className={index === 0 ? "bg-[color:var(--success)]" : index === 1 ? "bg-[color:var(--accent)]" : "bg-[color:var(--danger)]"} key={band.label} style={{ flexGrow: band.contracts }} /> : null)}
        </div>
        <div className="mt-2">{stats.fallBands.map((band) => <Line key={band.label} label={`${band.label} · ${band.label === "Serrées" ? "1–9" : band.label === "Moyennes" ? "10–19" : "≥20"} pts sous annonce`} value={`${rate(band.share)} · ${stats.rounds === null ? "—" : band.contracts}`} />)}</div>
        <p className="mt-2 text-xs text-[color:var(--text-secondary)]">Répartition des contrats classiques chutés avec un déficit réel sous l&apos;annonce.</p>
      </AppSurface>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <AppSurface>
        <AppEyebrow>Coinche / Surcoinche</AppEyebrow>
        <div className="mt-2"><Line label="Coinches annoncées" value={number(stats.coinchesDeclared)} /><Line label="Coinches réussies" value={rate(stats.coincheSuccessRate)} /><Line label="Adversaires sous annonce (Coinches gagnantes)" value={below(stats.winningCoincheAverageGap)} /><Line label="Nos contrats coinchés" value={number(stats.ownContractsCoinched)} /><Line label="Contrats coinchés tout de même réussis" value={rate(stats.coinchedContractSuccessRate)} /><Line label="Marge de mes contrats réussis sous Coinche" value={signed(stats.personalCoinchedSuccessMargin)} /><Line label="Surcoinches annoncées" value={number(stats.surcoinchesDeclared)} /><Line label="Surcoinches réussies" value={rate(stats.surcoincheSuccessRate)} /></div>
      </AppSurface>
      <AppSurface>
        <AppEyebrow>Capots</AppEyebrow>
        <div className="mt-2"><Line label="Capots réalisés" value={number(stats.capotsMade)} /><Line label="Capots subis" value={number(stats.capotsSuffered)} /><Line label="Capots / 100 manches" value={stats.capotsPer100Rounds === null ? "—" : `${stats.capotsPer100Rounds.toLocaleString("fr-FR")} / 100`} /><Line label="Capots annoncés personnellement" value={number(stats.capotsBidPersonally)} /><Line label="Capots annoncés réussis" value={number(stats.capotsBidSucceeded)} /><Line label="Réussite des capots annoncés" value={rate(stats.capotBidSuccessRate)} /></div>
      </AppSurface>
    </div>

    <AppSurface>
      <AppEyebrow>Couleurs et modes</AppEyebrow>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {stats.suits.map(({ suit, contracts, share, successRate, averageBid }) => <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3" key={suit}>
          <div className="flex items-baseline justify-between gap-2"><strong>{({ hearts: "♥ Cœur", spades: "♠ Pique", diamonds: "♦ Carreau", clubs: "♣ Trèfle" })[suit]}</strong><span className="text-xs text-[color:var(--text-secondary)]">{stats.rounds === null ? "—" : contracts} contrats · {rate(share)} des couleurs</span></div>
          <div className="mt-2"><ProgressBar label="Réussite" value={successRate} /><Line label="Contrat moyen 80–160" value={number(averageBid)} /></div>
        </div>)}
      </div>
      {stats.specialModes.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{stats.specialModes.map((mode) => <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3" key={mode.mode}><strong>{mode.mode === "no-trump" ? "Sans Atout" : "Tout Atout"}</strong><p className="mt-1 text-sm text-[color:var(--text-secondary)]">{mode.contracts} contrats · {rate(mode.successRate)} réussite · moyenne {number(mode.averageBid)}</p></div>)}</div> : null}
    </AppSurface>

    {stats.progression ? <AppSurface>
      <AppEyebrow>Progression · manches avec contrat</AppEyebrow>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3"><strong>Premières {stats.progression.first.rounds} manches</strong><div className="mt-2"><ProgressBar label="Réussite attaque" value={stats.progression.first.attackSuccessRate} /><Line label="Contrat moyen 80–160" value={number(stats.progression.first.averageBid)} /></div></div>
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3"><strong>Dernières {stats.progression.recent.rounds} manches</strong><div className="mt-2"><ProgressBar label="Réussite attaque" value={stats.progression.recent.attackSuccessRate} /><Line label="Contrat moyen 80–160" value={number(stats.progression.recent.averageBid)} /></div></div>
      </div>
    </AppSurface> : null}
  </div>;
}
