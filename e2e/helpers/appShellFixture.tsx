/** @jsxImportSource react */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppPage, AppPageHeader, AppSurface, appFieldClass, appFormClass, appInputClass, appMetadataClass, appPrimaryActionClass, appRowClass, appSecondaryActionClass, appSegmentedGroupClass, appSegmentedItemClass, appTableScrollClass } from "../../components/ui/AppShell";

// Render actual shared components into a settled page using production CSS.
// No test route, responsive JS or fixture component is shipped in the application.
export function appShellFixture(width: "narrow" | "medium" | "wide" = "medium") {
  return renderToStaticMarkup(<AppPage width={width}>
    <AppPageHeader eyebrow="Espace social" title="Une table, quatre places à partager"
      description="Retrouve tes partenaires, réponds aux demandes et organise ta prochaine partie. Toutes les informations restent lisibles."
      actions={<><button className={appPrimaryActionClass}>Créer table</button><button className={appSecondaryActionClass}>Rejoindre</button></>} />
    <AppSurface>
      <h2>Préparer une partie</h2>
      <form className={appFormClass}>
        <label className={appFieldClass}>Pseudo<input className={appInputClass} defaultValue={"Navigation".repeat(4)} /></label>
        <label className={appFieldClass}>Email<input className={appInputClass} type="email" /></label>
        <label className={appFieldClass}>Mot de passe<input className={appInputClass} type="password" /></label>
        <label className={appFieldClass}>Nombre<input className={appInputClass} type="number" /></label>
        <label className={appFieldClass}>Mode<select className={appInputClass}><option>Contrée classique</option></select></label>
        <label className={appFieldClass}>Message<textarea className={appInputClass} /></label>
        <button className={appPrimaryActionClass} type="button">Enregistrer les réglages</button>
      </form>
      <div className="flex flex-wrap gap-2">
        <button className={`${appPrimaryActionClass} min-h-14 min-w-56`}>Action ample</button>
        <button className={`${appSecondaryActionClass} min-w-32`}>Pause</button>
      </div>
      <div className={appSegmentedGroupClass} role="group" aria-label="Mode de partie">
        <button className={appSegmentedItemClass} aria-pressed>Contrée classique</button>
        <button className={appSegmentedItemClass}>Une traduction potentiellement beaucoup plus longue</button>
      </div>
      <div className={appRowClass}><strong>{"Navigation".repeat(4)}</strong><div className={appMetadataClass}><span>Niveau 999</span><span>12345678901234567890 XP</span><span>30 septembre 2026</span></div><button className={appSecondaryActionClass}>Afficher les informations supplémentaires</button></div>
      <div className={appTableScrollClass} role="region" aria-label="Tableau détaillé" tabIndex={0}>
        <table><caption>Résultats détaillés</caption><tbody><tr>{Array.from({length:8}, (_,index) => <td key={index}>Métadonnées supplémentaires {index}</td>)}</tr></tbody></table>
      </div>
    </AppSurface>
  </AppPage>);
}
