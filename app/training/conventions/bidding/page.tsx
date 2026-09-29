import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, AppPageHeader, AppSurface, appPrimaryActionClass, appSegmentedItemClass } from "@/components/ui/AppShell";

export const metadata: Metadata = { title: "Conventions d’annonces | Entraînement" };

export default function BiddingConventionsPage() {
  return <AppPage width="wide">
    <Link className="coinche-ui-link w-fit text-sm font-bold" href="/training">← Retour à l’entraînement</Link>
    <AppPageHeader eyebrow="Doctrine KFFR" title="Conventions d’annonces" description="Ces conventions décrivent la doctrine utilisée par KFFR Contrée. Elles ne constituent pas une vérité universelle sur la Contrée.">
      <p className="training-version-note">Advanced Rules V4.1 · Axe annonces version 1</p>
    </AppPageHeader>
    <nav aria-label="Sections des conventions" className="training-conventions-nav">
      <a className={appSegmentedItemClass} href="#ouverture">Ouverture</a><a className={appSegmentedItemClass} href="#reponse">Réponse au partenaire</a><a className={appSegmentedItemClass} href="#competitif">Compétitif</a>
      <a className={appSegmentedItemClass} href="#coinche">Coinche</a><a className={appSegmentedItemClass} href="#surcoinche">Surcoinche / Capot</a><a className={appSegmentedItemClass} href="#lecture">Lire les enchères</a><a className={appSegmentedItemClass} href="#reglement">Règlement</a>
    </nav>
    <div className="grid gap-4 text-sm leading-relaxed lg:grid-cols-2">
      <AppSurface className="training-convention-section" variant="plain"><h2 id="ouverture" className="text-xl font-black">Choisir une couleur</h2>
        <p className="mt-2">Le Valet et le 9 sont les deux atouts majeurs. Leur présence, la longueur de la couleur et les As extérieurs donnent de la force à l’annonce. Un 10 isolé reste vulnérable : il peut être capturé ou coupé.</p>
      </AppSurface>
      <AppSurface className="training-convention-section" variant="plain"><h2 className="text-xl font-black">80 comme message</h2>
        <p className="mt-2">Avec le Valet sans le 9, ou le 9 sans le Valet, annoncer 80 peut montrer la couleur et rechercher la carte manquante chez le partenaire. Ce message ne promet pas à lui seul une main autonome.</p>
        <p className="mt-2 rounded-lg border border-[var(--border)] p-3">Exemple : 9♥ A♥ 7♥ et des contrôles limités → 80 ♥ pour chercher le Valet.</p>
      </AppSurface>
      <AppSurface className="training-convention-section lg:col-span-2" variant="plain"><h2 className="text-xl font-black">Quatre atouts sans Valet ni 9</h2>
        <p className="mt-2 font-bold">4+ atouts sans Valet ni 9 : 80 maximum.</p>
        <p className="mt-2">Cette longueur ne mène pas automatiquement à 80 : il faut aussi des contrôles extérieurs crédibles. Elle ne justifie jamais 90 ou plus, même si le partenaire soutient ensuite la couleur.</p>
        <p className="mt-2 rounded-lg border border-[var(--border)] p-3">Exemple : 7♥ 8♥ Q♥ K♥ avec suffisamment de contrôles extérieurs → au maximum 80 ♥.</p>
      </AppSurface>
      <AppSurface className="training-convention-section" variant="plain"><h2 id="reponse" className="text-xl font-black">Parler avec son partenaire</h2>
        <p className="mt-2">Apporter le Valet ou le 9 manquant peut former un petit fit ; une longueur mieux contrôlée peut justifier un soutien plus fort. Après un soutien public, le joueur peut poursuivre sa première annonce si sa main permet le nouveau palier.</p>
        <p className="mt-2">La couleur du partenaire est respectée par défaut. Changer de couleur demande une alternative exceptionnellement autonome, et reste un message fort.</p>
      </AppSurface>
      <AppSurface className="training-convention-section" variant="plain"><h2 id="competitif" className="text-xl font-black">Enchères compétitives</h2>
        <p className="mt-2">Face à une annonce adverse, on utilise le plus petit palier légal utile que la main peut réellement soutenir. Une enchère plus haute ne remplace pas une fondation d’atout insuffisante.</p>
      </AppSurface>
      <AppSurface className="training-convention-section lg:col-span-2" variant="plain"><h2 id="coinche" className="text-xl font-black">Coinche</h2>
        <p className="mt-2">La voie classique demande un contrat adverse déjà élevé, la maîtrise du Valet et du 9 de son atout et plusieurs contrôles défensifs. La voie « overbid manifeste » reconnaît aussi un contrat excessif grâce à plusieurs contrôles hors atout, à une forte maîtrise de l’atout adverse, ou aux deux.</p>
        <h3 className="mt-4 font-black">Maîtrise de l’atout adverse</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>À 140 : J–9–A–10 dans l’atout adverse, plus un As extérieur.</li>
          <li>À 150 : J–9–A–10, ou J–9–A plus une paire As–10 extérieure.</li>
          <li>À 160 : J–9–A–10, ou J–9–A plus un As extérieur.</li>
        </ul>
        <h3 className="mt-4 font-black">Contrôles hors atout</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>À 140 : les trois autres couleurs contrôlées par As–10.</li>
          <li>À 150 : deux paires As–10 et l’As de la troisième couleur.</li>
          <li>À 160 : deux paires As–10.</li>
        </ul>
        <p className="mt-2">Ces voies exigent aussi une défense globalement crédible. Un contrat à 100 ou 110 ne déclenche pas cette Coinche de surenchère.</p>
        <p className="mt-2 rounded-lg border border-[var(--border)] p-3">Exemple : l’adversaire annonce 160 ♥ et ta main contient J♥ 9♥ A♥ 10♥ → Coinche possible selon V4.1.</p>
      </AppSurface>
      <AppSurface className="training-convention-section" variant="plain"><h2 id="surcoinche" className="text-xl font-black">Surcoinche et Capot</h2>
        <p className="mt-2">La Surcoinche demande une marge exceptionnelle, pas simplement une bonne main. Le Capot demande un contrôle presque complet de la donne ; dans certains cas, l’annonce publique du partenaire complète l’information.</p>
      </AppSurface>
      <AppSurface className="training-convention-section" variant="plain"><h2 id="lecture" className="text-xl font-black">Promesse ≠ main exacte</h2>
        <p className="mt-2">80 ♥ ne permet pas à lui seul de savoir si le joueur possède le Valet ou le 9. Plusieurs mains différentes peuvent produire le même message.</p>
        <p className="mt-2">Une enchère décrit ce que la doctrine promet publiquement, pas toutes les cartes de la main. Dans « Lire les enchères », une main révélée après la réponse illustre seulement une possibilité compatible.</p>
        <Link className="coinche-ui-link mt-3 inline-block font-bold" href="/training/puzzle/bid-reading?level=1">S’entraîner à lire les enchères</Link>
      </AppSurface>
      <AppSurface className="training-convention-section" variant="plain"><h2 id="reglement" className="text-xl font-black">Règlement utilisé</h2>
        <p className="mt-2">L’axe utilise le règlement contree-kffr version 1 : couleurs ♣ ♦ ♥ ♠, annonces de 80 à 160, Capot, Coinche, Surcoinche et Belote/Rebelote. Il n’interroge ni Sans Atout, ni Tout Atout, ni Générale, ni annonces de tierce ou de carré.</p>
      </AppSurface>
    </div>
    <Link className={`${appPrimaryActionClass} mt-5 w-full self-start sm:w-auto`} href="/training/puzzle/bidding?level=1">Jouer le niveau 1</Link>
  </AppPage>;
}
