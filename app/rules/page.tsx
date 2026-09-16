import type { Metadata } from "next";
import { AppPage } from "@/components/ui/AppShell";
import { cardValues, defaultRules, kffrSections, variantSections, type RulesSection } from "@/lib/rules/rulesContent";

export const metadata: Metadata = { title: "Règles" };

const sectionClass = "scroll-mt-36 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-7";
const mutedClass = "text-sm leading-7 text-[color:var(--text-secondary)]";

function CardOrder({ title, cards }: { title: string; cards: readonly (readonly [string, number])[] }) {
  return <div className="min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-4">
    <h4 className="text-xs font-black uppercase tracking-[0.15em] text-[color:var(--text-muted)]">{title}</h4>
    <div className="mt-3 flex flex-wrap gap-2" aria-label={`Ordre et points ${title.toLowerCase()}`}>
      {cards.map(([rank, points]) => <span className="min-w-12 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1.5 text-center text-sm font-bold text-[color:var(--text-primary)]" key={rank}>
        <span className="block">{rank}</span><span className="block text-[11px] font-medium text-[color:var(--text-muted)]">{points} pt</span>
      </span>)}
    </div>
  </div>;
}

function RuleSection({ section }: { section: RulesSection }) {
  return <section aria-labelledby={`${section.id}-title`} className={sectionClass} id={section.id}>
    <h3 className="text-xl font-black tracking-tight text-[color:var(--text-primary)]" id={`${section.id}-title`}>{section.title}</h3>
    {section.paragraphs?.map((paragraph) => <p className={`mt-3 ${mutedClass}`} key={paragraph}>{paragraph}</p>)}
    {section.points ? <ul className={`mt-4 list-disc space-y-2 pl-5 ${mutedClass}`}>{section.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}

    {section.id === "encheres" ? <div aria-label="Échelle des enchères" className="mt-5 flex flex-wrap gap-2">
      {defaultRules.bids.map((bid) => <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-raised)] px-3 py-1 text-sm font-bold text-[color:var(--text-primary)]" key={bid}>{bid}</span>)}
      <span className="rounded-full border border-[color:var(--accent)] bg-[color:var(--accent-soft)] px-3 py-1 text-sm font-black text-[color:var(--text-primary)]">Capot</span>
    </div> : null}
    {section.id === "ordre-valeur" ? <div className="mt-5 grid gap-3 lg:grid-cols-2"><CardOrder cards={cardValues.plain} title="Hors atout" /><CardOrder cards={cardValues.trump} title="À l’atout" /></div> : null}
    {section.id === "reussite" ? <div className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Exemples pour un contrat à 80">
      {[["82 – 80", "Réussi"], ["81 – 81", "Chuté"], ["80 – 82", "Chuté"]].map(([score, result]) => <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-3" key={score}><span className="block text-xs text-[color:var(--text-muted)]">Contrat 80</span><span className="mt-1 block font-black text-[color:var(--text-primary)]">{score}</span><span className="text-xs font-bold text-[color:var(--brand-strong)]">{result}</span></div>)}
    </div> : null}
  </section>;
}

export default function RulesPage() {
  return <AppPage stickyContent width="wide">
    <div className="mx-auto w-full max-w-5xl pb-10">
      <header className="mb-7 border-b border-[color:var(--border)] pb-6 pt-3 sm:pt-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">Aide de jeu</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-[color:var(--text-primary)] sm:text-5xl">Règles de la Contrée</h1>
      </header>

      <nav aria-label="Navigation des règles" className="sticky top-14 z-20 mb-8 flex gap-2 overflow-x-auto border-b border-[color:var(--border)] bg-[color:var(--app-bg)] py-3">
        <a className="rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 py-2 text-sm font-bold text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--focus-ring)]" href="#contree-kffr">Contrée KFFR</a>
        <a className="rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 py-2 text-sm font-bold text-[color:var(--text-primary)] transition hover:border-[color:var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--focus-ring)]" href="#variantes-disponibles">Variantes disponibles</a>
      </nav>

      <div className="space-y-14">
        <section aria-labelledby="contree-title" className="scroll-mt-32" id="contree-kffr">
          <div className="mb-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">La variante par défaut</p><h2 className="mt-1 text-3xl font-black text-[color:var(--text-primary)]" id="contree-title">Contrée KFFR</h2></div>
          <div className="grid gap-4">{kffrSections.map((section) => <RuleSection key={section.id} section={section} />)}</div>
        </section>

        <section aria-labelledby="variants-title" className="scroll-mt-32" id="variantes-disponibles">
          <div className="mb-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">Une base, des réglages</p><h2 className="mt-1 text-3xl font-black text-[color:var(--text-primary)]" id="variants-title">Variantes disponibles</h2><p className={`mt-2 ${mutedClass}`}>Contrée KFFR est le seul preset fixe. Le mode <strong>Personnalisée</strong> adapte ses contrats, annonces, obligations de jeu, conditions de réussite et scores. Sans Atout, Tout Atout et Générale sont des options, pas des presets distincts.</p></div>
          <div className="grid gap-4">{variantSections.map((section) => <RuleSection key={section.id} section={section} />)}</div>
        </section>
      </div>
    </div>
  </AppPage>;
}
