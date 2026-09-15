import Link from "next/link";
import type { Metadata } from "next";
import { AppEyebrow, AppPage, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";

export const metadata: Metadata = {
  title: "Accueil",
};

export default function HomePage() {
  return (
    <AppPage className="justify-center sm:min-h-[calc(100dvh-120px)]" width="wide">
      <section className="coinche-app-surface relative overflow-hidden rounded-[2rem] border px-5 py-8 sm:px-10 sm:py-12 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:px-14 lg:py-16">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_75%_35%,rgb(58_160_108_/_17%),transparent_30%)]" />
        <div className="relative">
          <AppEyebrow>Contrée KFFR</AppEyebrow>
          <h1 className="mt-3 max-w-2xl text-4xl font-black leading-[1.05] tracking-[-0.035em] text-[#f4ead0] sm:text-5xl lg:text-6xl">
            La contrée, en solo ou entre amis
          </h1>
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <Link className={`${appPrimaryActionClass} sm:min-w-48`} href="/solo">Jouer en solo</Link>
            <Link className={`${appSecondaryActionClass} sm:min-w-48`} href="/multiplayer">Multijoueur</Link>
          </div>
          <Link className="mt-5 inline-flex text-sm font-bold text-emerald-200/70 transition hover:text-emerald-100" href="/rules">Voir les règles <span aria-hidden="true" className="ml-1.5">→</span></Link>
        </div>

        <div aria-hidden="true" className="relative mt-10 hidden min-h-72 lg:block">
          <div className="absolute left-1/2 top-1/2 h-64 w-80 -translate-x-1/2 -translate-y-1/2 rounded-[45%] border border-white/10 bg-[radial-gradient(ellipse_at_center,rgb(24_112_72_/_55%),rgb(7_31_21_/_90%))] shadow-[inset_0_0_55px_rgb(0_0_0_/_40%),0_24px_60px_rgb(0_0_0_/_35%)]" />
          {["♣", "♦", "♠", "♥"].map((suit, index) => (
            <div className={`absolute left-1/2 top-1/2 flex h-32 w-24 items-center justify-center rounded-xl border border-stone-300 bg-[#fffdf7] text-4xl font-black shadow-2xl ${index === 0 ? "-translate-x-[125%] -translate-y-[42%] -rotate-12 text-stone-950" : index === 1 ? "-translate-x-[72%] -translate-y-[54%] -rotate-3 text-red-700" : index === 2 ? "-translate-x-[18%] -translate-y-[53%] rotate-6 text-stone-950" : "translate-x-[35%] -translate-y-[36%] rotate-12 text-red-700"}`} key={suit}>{suit}</div>
          ))}
        </div>
      </section>
    </AppPage>
  );
}
