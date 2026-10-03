"use client";

export function MobileLandscapeNotice() {
  return (
    <section className="coinche-mobile-notice coinche-content-min coinche-safe-bottom flex items-center justify-center text-center">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-3xl text-[var(--accent)]">
          ↻
        </div>
        <h1 className="mt-4 text-xl font-bold">Tournez votre téléphone</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Passez en mode paysage pour jouer confortablement à la contrée.
        </p>
      </div>
    </section>
  );
}
