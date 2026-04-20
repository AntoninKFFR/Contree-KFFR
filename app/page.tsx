import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accueil",
};

const HOME_LINKS = [
  {
    href: "/solo",
    label: "Jouer en solo",
  },
  {
    href: "/multiplayer",
    label: "Multijoueur",
  },
  {
    href: "/rules",
    label: "Règles",
  },
];

export default function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f4f1e8] px-4 text-stone-950">
      <section className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Contrée par KFFR
          </p>
          <h1 className="mt-2 text-4xl font-bold">La contrée, en solo ou entre amis</h1>
        </div>

        <nav className="flex w-full flex-col gap-3">
          {HOME_LINKS.map((link) => (
            <Link
              className="rounded-md border border-emerald-900 bg-white px-5 py-4 text-lg font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-50"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
