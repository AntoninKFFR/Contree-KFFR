import Link from "next/link";
import type { Metadata } from "next";
import { AppPage, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";
import { KffrLogo } from "@/components/ui/KffrLogo";

export const metadata: Metadata = {
  title: "Accueil",
};

export default function HomePage() {
  return (
    <AppPage className="justify-center sm:min-h-[calc(100dvh-120px)]" width="wide">
      <section className="coinche-app-surface relative overflow-hidden rounded-[2rem] border px-5 py-8 sm:px-10 sm:py-12 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:px-14 lg:py-16">
        <div className="relative">
          <h1 className="max-w-2xl text-4xl font-black leading-[1.05] tracking-[-0.035em] text-[#f4ead0] sm:text-5xl lg:text-6xl">
            La contrée, en solo ou entre amis
          </h1>
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <Link className={`${appPrimaryActionClass} sm:min-w-48`} href="/solo">Jouer en solo</Link>
            <Link className={`${appSecondaryActionClass} sm:min-w-48`} href="/multiplayer">Multijoueur</Link>
          </div>
          <Link className="coinche-ui-link mt-5 inline-flex text-sm font-bold transition" href="/rules">Voir les règles <span aria-hidden="true" className="coinche-ui-kicker ml-1.5">→</span></Link>
        </div>

        <div aria-hidden="true" className="relative mt-10 flex min-h-40 items-center justify-center sm:min-h-48 lg:mt-0 lg:min-h-80">
          <KffrLogo alt="" className="h-auto w-40 sm:w-48 lg:w-64" variant="full" />
        </div>
      </section>
    </AppPage>
  );
}
