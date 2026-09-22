import { describe, expect, it } from "vitest";
import { getRatingPresentation } from "@/lib/rating/presentation";

describe("rating emblem presentation", () => {
  it.each([
    [0, "debutant", "V", "Débutant V", "/ranks/debutant.png"],
    [849, "debutant", "V", "Débutant V", "/ranks/debutant.png"],
    [850, "debutant", "IV", "Débutant IV", "/ranks/debutant.png"],
    [899, "debutant", "IV", "Débutant IV", "/ranks/debutant.png"],
    [900, "debutant", "III", "Débutant III", "/ranks/debutant.png"],
    [949, "debutant", "III", "Débutant III", "/ranks/debutant.png"],
    [950, "debutant", "II", "Débutant II", "/ranks/debutant.png"],
    [999, "debutant", "II", "Débutant II", "/ranks/debutant.png"],
    [1000, "debutant", "I", "Débutant I", "/ranks/debutant.png"],
    [1049, "debutant", "I", "Débutant I", "/ranks/debutant.png"],
    [1050, "pas-mauvais", "V", "Pas mauvais V", "/ranks/pas-mauvais.png"],
    [1099, "pas-mauvais", "V", "Pas mauvais V", "/ranks/pas-mauvais.png"],
    [1100, "pas-mauvais", "IV", "Pas mauvais IV", "/ranks/pas-mauvais.png"],
    [1149, "pas-mauvais", "IV", "Pas mauvais IV", "/ranks/pas-mauvais.png"],
    [1150, "pas-mauvais", "III", "Pas mauvais III", "/ranks/pas-mauvais.png"],
    [1199, "pas-mauvais", "III", "Pas mauvais III", "/ranks/pas-mauvais.png"],
    [1200, "pas-mauvais", "II", "Pas mauvais II", "/ranks/pas-mauvais.png"],
    [1249, "pas-mauvais", "II", "Pas mauvais II", "/ranks/pas-mauvais.png"],
    [1250, "pas-mauvais", "I", "Pas mauvais I", "/ranks/pas-mauvais.png"],
    [1299, "pas-mauvais", "I", "Pas mauvais I", "/ranks/pas-mauvais.png"],
    [1300, "sait-jouer", "V", "Sait jouer V", "/ranks/sait-jouer.png"],
    [1349, "sait-jouer", "V", "Sait jouer V", "/ranks/sait-jouer.png"],
    [1350, "sait-jouer", "IV", "Sait jouer IV", "/ranks/sait-jouer.png"],
    [1399, "sait-jouer", "IV", "Sait jouer IV", "/ranks/sait-jouer.png"],
    [1400, "sait-jouer", "III", "Sait jouer III", "/ranks/sait-jouer.png"],
    [1449, "sait-jouer", "III", "Sait jouer III", "/ranks/sait-jouer.png"],
    [1450, "sait-jouer", "II", "Sait jouer II", "/ranks/sait-jouer.png"],
    [1499, "sait-jouer", "II", "Sait jouer II", "/ranks/sait-jouer.png"],
    [1500, "sait-jouer", "I", "Sait jouer I", "/ranks/sait-jouer.png"],
    [1549, "sait-jouer", "I", "Sait jouer I", "/ranks/sait-jouer.png"],
    [1550, "capot-de-capi", "V", "Capot de Capi V", "/ranks/capot-de-capi.png"],
    [1599, "capot-de-capi", "V", "Capot de Capi V", "/ranks/capot-de-capi.png"],
    [1600, "capot-de-capi", "IV", "Capot de Capi IV", "/ranks/capot-de-capi.png"],
    [1649, "capot-de-capi", "IV", "Capot de Capi IV", "/ranks/capot-de-capi.png"],
    [1650, "capot-de-capi", "III", "Capot de Capi III", "/ranks/capot-de-capi.png"],
    [1699, "capot-de-capi", "III", "Capot de Capi III", "/ranks/capot-de-capi.png"],
    [1700, "capot-de-capi", "II", "Capot de Capi II", "/ranks/capot-de-capi.png"],
    [1749, "capot-de-capi", "II", "Capot de Capi II", "/ranks/capot-de-capi.png"],
    [1750, "capot-de-capi", "I", "Capot de Capi I", "/ranks/capot-de-capi.png"],
    [2000, "capot-de-capi", "I", "Capot de Capi I", "/ranks/capot-de-capi.png"],
  ] as const)("maps %i Elo to its official family asset", (rating, family, division, label, imageSrc) => {
    expect(getRatingPresentation(rating)).toMatchObject({ family, division, label, imageSrc });
  });
});
