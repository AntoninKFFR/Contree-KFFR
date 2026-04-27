"use client";

export function MobileLandscapeNotice() {
  return (
    <section className="flex min-h-[calc(100dvh-56px)] items-center justify-center bg-[#f4f1e8] px-6 text-center text-stone-950">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white/95 p-6 shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-800">
          ↻
        </div>
        <h1 className="mt-4 text-xl font-bold">Tournez votre téléphone</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Passez en mode paysage pour jouer confortablement a la contree.
        </p>
      </div>
    </section>
  );
}
