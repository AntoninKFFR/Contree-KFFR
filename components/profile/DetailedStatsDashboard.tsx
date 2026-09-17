import { AppEyebrow, AppSurface } from "@/components/ui/AppShell";
import type { DetailedPlayerStats } from "@/lib/detailedPlayerStats";

const rate = (value: number | null) => value === null ? "—" : `${value} %`;
const number = (value: number | null) => value === null ? "—" : String(value);
const signed = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value} pts`;

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-3">
    <p className="text-xs font-semibold text-[color:var(--text-secondary)]">{label}</p>
    <p className="mt-1 text-xl font-black tabular-nums text-[color:var(--text-primary)]">{value}</p>
  </div>;
}

function Line({ label, value }: { label: string; value: string | number }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--border)] py-2 text-sm last:border-0">
    <span className="text-[color:var(--text-secondary)]">{label}</span>
    <strong className="shrink-0 tabular-nums text-[color:var(--text-primary)]">{value}</strong>
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
        <Metric label="Série de victoires actuelle" value={stats.currentStreak} />
        <Metric label="Meilleure série de victoires" value={stats.bestStreak} />
        <Metric label="Capots réalisés" value={number(stats.capotsMade)} />
      </div>
      {stats.missingHistoryGames > 0 ? <p className="mt-3 text-xs text-[color:var(--text-secondary)]">{stats.missingHistoryGames} partie(s) sans détail de manches : les indicateurs par manche portent uniquement sur les archives disponibles.</p> : null}
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

    <div className="grid gap-4 lg:grid-cols-2">
      <AppSurface className="border-l-4 !border-l-[color:var(--success)]">
        <h2 className="text-lg font-black text-[color:var(--success)]">⚔ Attaque</h2>
        <div className="mt-2">
          <Line label="Contrats réussis" value={rate(stats.attackSuccessRate)} />
          <Line label="Contrats pris personnellement" value={rate(stats.personalContractShare)} />
          <Line label="Contrat moyen (80–160)" value={number(stats.averageBid)} />
          <Line label="Points réellement faits (mêmes contrats)" value={number(stats.averageTakerPoints)} />
          <Line label="Différentiel moyen" value={signed(stats.averageBidDifference)} />
          <Line label="Écart moyen lors d'une chute (80–160)" value={signed(stats.averageFailedContractGap)} />
          <Line label="10 de der sécurisé" value={rate(stats.tenDeDerRate)} />
        </div>
      </AppSurface>
      <AppSurface className="border-l-4 !border-l-[color:var(--danger)]">
        <h2 className="text-lg font-black text-[color:var(--danger)]">🛡 Défense</h2>
        <div className="mt-2">
          <Line label="Contrats adverses mis en échec" value={rate(stats.defenseSuccessRate)} />
          <Line label="Points moyens en défense" value={number(stats.averageDefensePoints)} />
          <Line label="Écart moyen des contrats adverses chutés (80–160)" value={signed(stats.averageDefeatedContractGap)} />
        </div>
      </AppSurface>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <AppSurface>
        <AppEyebrow>Enchères avancées</AppEyebrow>
        <div className="mt-2">
          <Line label="Coinches annoncées" value={number(stats.coinchesDeclared)} />
          <Line label="Coinches réussies" value={rate(stats.coincheSuccessRate)} />
          <Line label="Nos contrats coinchés" value={number(stats.ownContractsCoinched)} />
          <Line label="Contrats coinchés tout de même réussis" value={rate(stats.coinchedContractSuccessRate)} />
          <Line label="Surcoinches annoncées" value={number(stats.surcoinchesDeclared)} />
          <Line label="Surcoinches réussies" value={rate(stats.surcoincheSuccessRate)} />
        </div>
      </AppSurface>
      <AppSurface>
        <AppEyebrow>Capots</AppEyebrow>
        <div className="mt-2">
          <Line label="Capots réalisés" value={number(stats.capotsMade)} />
          <Line label="Capots subis" value={number(stats.capotsSuffered)} />
          <Line label="Capots annoncés personnellement" value={number(stats.capotsBidPersonally)} />
          <Line label="Capots annoncés réussis" value={number(stats.capotsBidSucceeded)} />
          <Line label="Réussite des capots annoncés" value={rate(stats.capotBidSuccessRate)} />
        </div>
      </AppSurface>
    </div>

    <AppSurface>
      <AppEyebrow>Contrats par couleur</AppEyebrow>
      <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
        {stats.suits.map(({ suit, contracts, share, successRate }) => <Line key={suit} label={({ hearts: "♥ Cœur", spades: "♠ Pique", diamonds: "♦ Carreau", clubs: "♣ Trèfle" })[suit]} value={`${stats.rounds === null ? "—" : contracts} · ${rate(share)} · ${rate(successRate)} réussite`} />)}
      </div>
      <p className="mt-2 text-xs text-[color:var(--text-secondary)]">Part calculée parmi les contrats à couleur de votre équipe. Sans atout et tout atout sont exclus.</p>
    </AppSurface>
  </div>;
}
