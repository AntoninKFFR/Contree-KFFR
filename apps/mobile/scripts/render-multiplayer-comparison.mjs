import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../docs/multiplayer-151/", import.meta.url);
const sizes = [[568, 320], [844, 390], [932, 430]];
const stages = [["landing", "Créer / rejoindre"], ["lobby-free", "Places libres"], ["lobby-full", "Quatre humains"], ["bidding", "Enchères"], ["start", "Partie en cours"], ["trick", "Pli"], ["last", "Dernier pli"], ["result", "Résultat final"]];
let pairs = 0;
for (const [width] of sizes) for (const [stage] of stages) for (const seat of stage === "landing" || stage.startsWith("lobby") ? [0] : [0, 1, 2, 3]) {
  const web = JSON.parse(readFileSync(new URL(`captures/web-${width}-${stage}-${seat}.json`, dir)));
  const native = JSON.parse(readFileSync(new URL(`captures/native-${width}-${stage}-${seat}.json`, dir)));
  assert.equal(web.fixtureDigest, native.fixtureDigest, `Different public projection: ${width}/${stage}/${seat}`); pairs++;
}
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>KFFR · Multijoueur web / natif</title>
<style>body{margin:0;padding:12px;background:#061b15;color:#f5f1e7;font:14px system-ui}h1{font-size:20px;margin:0}p{color:#cbb989;margin:6px 0 12px}a{color:#ead8a6;margin-right:18px}.pair,.labels{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pair img{display:block;width:100%;height:auto}h3{margin:10px 0 4px;font-size:14px}section{margin-bottom:24px}h2{font-size:16px;margin:12px 0 4px}.labels{color:#ead8a6}</style>
<h1>Multijoueur KFFR · ${pairs} paires vérifiées</h1><p>Vrais composants Next.js / React Native Web. Mêmes projections publiques issues du moteur, SHA-256 identiques. Insets 47 / 47 / 21 px. Captures de test : aucun compte réel, aucune partie en production. RN Web n’est pas un iPhone matériel.</p>
<nav>${sizes.map(([w,h]) => `<a href="?width=${w}">${w} × ${h}</a>`).join("")}${[0,1,2,3].map((s) => `<a href="?width=844&seat=${s}">Place ${s+1}</a>`).join("")}</nav>
${sizes.map(([w,h]) => `<section data-width="${w}"><h2>${w} × ${h}</h2><div class="labels"><b>WEB KFFR</b><b>REACT NATIVE WEB · table Solo partagée</b></div>${stages.map(([id,label]) => `<div class="stage" data-stage="${id}"><h3>${label}</h3>${(id === "landing" || id.startsWith("lobby") ? [0] : [0,1,2,3]).map((seat) => `<div class="pair" data-seat="${seat}"><img alt="Web ${label} place ${seat+1}" src="captures/web-${w}-${id}-${seat}.png"><img alt="RN ${label} place ${seat+1}" src="captures/native-${w}-${id}-${seat}.png"></div>`).join("")}</div>`).join("")}</section>`).join("")}
<script>const q=new URLSearchParams(location.search),width=q.get('width')||'844',seat=q.get('seat')||'0';document.querySelectorAll('section').forEach(s=>s.hidden=s.dataset.width!==width);document.querySelectorAll('.pair').forEach(p=>{const id=p.closest('.stage').dataset.stage;p.hidden=!['landing','lobby-free','lobby-full'].includes(id)&&p.dataset.seat!==seat;if(p.hidden)p.style.display='none'});</script></html>`;
writeFileSync(new URL("comparison.html", dir), html);
const browser = await chromium.launch();
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width: width * 2 + 32, height } });
    await page.goto(new URL(`comparison.html?width=${width}`, dir).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map((i) => i.decode())); });
    await page.screenshot({ path: new URL(`captures/comparison-${width}.png`, dir).pathname.replace(/^\/(\w:)/, "$1"), fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
console.log(`${pairs} pairs use identical public projections; generated comparison.html and three boards.`);
