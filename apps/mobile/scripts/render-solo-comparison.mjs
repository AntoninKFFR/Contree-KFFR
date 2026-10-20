import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const directory = new URL("../docs/parity-150/", import.meta.url);
const sizes = [[844, 390], [568, 320], [932, 430]];
const stages = [["bidding", "Enchères"], ["start", "Début de manche"], ["trick", "Pli en cours"], ["result", "Fin de manche"]];
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>KFFR · Comparaison Solo web / natif</title>
<style>body{margin:0;padding:12px;background:#06120d;color:#f5f1e7;font:14px system-ui}h1{font-size:20px;margin:0}p{color:#cbb989;margin:6px 0 12px}a{color:#ead8a6;margin-right:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pair img{display:block;width:100%;height:auto}h3{margin:10px 0 4px;font-size:14px}.labels{display:grid;grid-template-columns:1fr 1fr;gap:8px;color:#ead8a6;margin:8px 0 0}section{margin-bottom:24px}h2{font-size:16px;margin:12px 0 4px}</style>
<h1>Solo KFFR · Web et React Native Web</h1><p>Captures du code réel, mêmes états publics, insets 47 / 47 / 21 px. Ces planches ne sont pas des captures matérielles iOS.</p>
<nav>${sizes.map(([w,h]) => `<a href="?width=${w}">${w} × ${h}</a>`).join("")}<a href="?">Tout afficher</a></nav>
${sizes.map(([w,h]) => `<section data-width="${w}"><h2>${w} × ${h}</h2><div class="labels"><b>Web KFFR · GameTable</b><b>React Native · SoloScene</b></div>${stages.map(([id,label]) => `<h3>${label}</h3><div class="pair"><img alt="Web ${label} ${w}" src="captures/web-${w}-${id}.png"><img alt="React Native ${label} ${w}" src="captures/native-${w}-${id}.png"></div>`).join("")}</section>`).join("")}
<script>const width=new URLSearchParams(location.search).get('width');if(width)document.querySelectorAll('section').forEach(s=>s.hidden=s.dataset.width!==width)</script></html>`;
writeFileSync(new URL("comparison.html", directory), html);
const browser = await chromium.launch();
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width: width * 2 + 32, height } });
    await page.goto(new URL(`comparison.html?width=${width}`, directory).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map((image) => image.decode())); });
    await page.screenshot({ path: new URL(`captures/comparison-${width}.png`, directory).pathname.replace(/^\/(\w:)/, "$1"), fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
