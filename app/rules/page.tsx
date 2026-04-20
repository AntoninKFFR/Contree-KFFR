import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Règles",
};

const RULE_SECTIONS = [
  {
    title: "Objectif",
    text: "La coinche se joue à quatre, en deux équipes de deux. Le but est de remporter des plis et de réussir le contrat annoncé par son équipe.",
  },
  {
    title: "Déroulement",
    text: "Une manche commence par les annonces. Une fois le contrat fixé, les joueurs jouent chacun une carte à tour de rôle. Le joueur qui remporte un pli ouvre le pli suivant.",
  },
  {
    title: "Annonces",
    text: "Les joueurs peuvent passer, annoncer une valeur avec un atout, contrer un contrat adverse ou surcontrer un contrat déjà contré.",
  },
  {
    title: "Score",
    text: "À la fin d'une manche, les points des plis sont comptés. Si le contrat est réussi, l'équipe preneuse marque ses points. Sinon, la défense marque selon le contrat.",
  },
];

export default function RulesPage() {
  return (
    <main className="min-h-dvh bg-[#f4f1e8] px-4 py-6 text-stone-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-3">
            <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/">
              Accueil
            </Link>
            <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/solo">
              Solo
            </Link>
            <Link
              className="text-sm font-semibold text-emerald-900 hover:underline"
              href="/multiplayer"
            >
              Multijoueur
            </Link>
          </nav>
        </header>

        <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Aide de jeu
          </p>
          <h1 className="mt-1 text-3xl font-bold">Règles de la coinche</h1>
        </section>

        <div className="grid gap-3">
          {RULE_SECTIONS.map((section) => (
            <section
              className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm"
              key={section.title}
            >
              <h2 className="text-lg font-bold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-stone-700">{section.text}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
