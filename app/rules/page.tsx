import type { Metadata } from "next";
import { AppEyebrow, AppPage, AppSurface } from "@/components/ui/AppShell";

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
    <AppPage width="medium">
      <div className="flex flex-col gap-5">
        <AppSurface className="overflow-hidden p-6 sm:p-8">
          <AppEyebrow>Aide de jeu</AppEyebrow>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-stone-50 sm:text-4xl">
            Règles de la coinche
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
            Les quatre repères essentiels pour rejoindre la table sans détour.
          </p>
        </AppSurface>

        <div className="grid gap-3 sm:grid-cols-2">
          {RULE_SECTIONS.map((section, index) => (
            <AppSurface
              className="group p-5 transition hover:-translate-y-0.5 hover:border-emerald-200/25"
              key={section.title}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-amber-200/25 bg-amber-200/10 text-xs font-black text-amber-100">
                  {index + 1}
                </span>
                <h2 className="text-lg font-bold text-stone-50">{section.title}</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-stone-300">{section.text}</p>
            </AppSurface>
          ))}
        </div>
      </div>
    </AppPage>
  );
}
