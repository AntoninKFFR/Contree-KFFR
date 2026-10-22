"""Assemble actual browser captures; never redraw the application UI.

Requires Pillow. Inputs come from FINAL_TRICK_CAPTURE_DIR and the explicit
FINAL_TRICK_BASELINE reproduction. Original PNG hashes stay in evidence.json.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument("--captures", type=Path, required=True)
parser.add_argument("--baseline", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parent.parent
font_file = Path("C:/Windows/Fonts/segoeui.ttf")
font = ImageFont.truetype(str(font_file), 19) if font_file.exists() else ImageFont.load_default()
small = ImageFont.truetype(str(font_file), 16) if font_file.exists() else ImageFont.load_default()
stages = [("1-third", "1. Troisième carte"), ("2-fourth", "2. Quatrième carte"), ("3-complete", "3. Pli complet"), ("4-collection", "4. Début du ramassage"), ("5-result", "5. Résultat")]
provenance = {"baseline": "6edc683ed3babedc1cc8cfb267819d29ca89c46f", "renderer": "Actual Next.js and React Native Web components; no physical iPhone captures", "composition": "Original screenshots resized uniformly and assembled; application pixels not redrawn", "frames": {}, "measurements": {}, "runtimeSourceHashes": {}}

def source(path):
    data = path.read_bytes()
    provenance["frames"][path.name] = {"sha256": hashlib.sha256(data).hexdigest(), "size": list(Image.open(path).size)}
    return Image.open(path).convert("RGB")

for mode in ["solo", "multiplayer"]:
    for width in [568, 844, 932]:
        tile_width = min(width, 600)
        height = 320 if width == 568 else 390 if width == 844 else 430
        tile_height = round(height * tile_width / width)
        board = Image.new("RGB", (5 * tile_width + 24, 86 + 4 * (tile_height + 36)), "#f0f2f4")
        draw = ImageDraw.Draw(board)
        draw.text((12, 8), f"{mode.upper()} — dernier pli — {width} × {height} — délai choisi 1 500 ms", fill="#102a22", font=font)
        draw.text((12, 36), "Vrais composants sur projections publiques de test. RN Web ≠ iPhone physique.", fill="#334155", font=small)
        for column, (_, label) in enumerate(stages):
            draw.text((12 + column * tile_width, 62), label, fill="#102a22", font=small)
        for row, (renderer, kind, label) in enumerate([
            ("web", "round", "WEB — fin de manche"), ("native", "round", "RN WEB — fin de manche"),
            ("web", "game", "WEB — fin de partie"), ("native", "game", "RN WEB — fin de partie"),
        ]):
            y = 86 + row * (tile_height + 36)
            draw.text((12, y + 5), label, fill="#334155", font=small)
            prefix = f"{renderer}-{mode}-{kind}-{width}"
            provenance["measurements"][prefix] = json.loads((args.captures / f"{prefix}.json").read_text())
            for column, (stage, _) in enumerate(stages):
                image = source(args.captures / f"{prefix}-{stage}.png")
                board.paste(image.resize((tile_width, tile_height), Image.Resampling.LANCZOS), (12 + column * tile_width, y + 30))
        board.save(args.output / f"{mode}-{width}.png")
    before = source(args.baseline / f"native-{mode}-game-844-baseline-premature-result.png")
    after = source(args.captures / f"native-{mode}-game-844-3-complete.png")
    board = Image.new("RGB", (1688, 450), "#f0f2f4")
    draw = ImageDraw.Draw(board)
    draw.text((12, 8), f"{mode.upper()} — RN Web, même projection publique, après confirmation de la dernière carte", fill="#102a22", font=font)
    draw.text((12, 34), "Avant 6edc683 : résultat déjà superposé", fill="#8b2222", font=small)
    draw.text((856, 34), "Corrigé : quatre cartes encore visibles", fill="#14532d", font=small)
    board.paste(before, (0, 60)); board.paste(after, (844, 60))
    board.save(args.output / f"before-after-{mode}.png")

for name in ["native", "web"]:
    path = args.captures / f"real-local-{name}-timelines.json"
    provenance["measurements"][f"real-local-{name}"] = json.loads(path.read_text())
for relative in ["lib/server/multiplayerGame.ts", "lib/trickPresentation.ts", "components/GameTable.tsx", "app/solo/SoloPageClient.tsx", "app/multiplayer/[roomId]/RoomPageClient.tsx", "apps/mobile/src/solo/presentation.ts", "apps/mobile/src/solo/presentation-store.ts", "apps/mobile/src/solo/scene.tsx", "apps/mobile/src/multiplayer/table.tsx", "apps/mobile/src/app/(connected)/solo.tsx", "apps/mobile/src/app/(connected)/multiplayer.tsx"]:
    provenance["runtimeSourceHashes"][relative] = hashlib.sha256((root / relative).read_bytes()).hexdigest()
provenance["fixtureSha256"] = hashlib.sha256((root / "apps/mobile/tests/final-trick/states.json").read_bytes()).hexdigest()
(args.output / "evidence.json").write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("Assembled six phase boards, two baseline comparisons and evidence.json from actual screenshots.")
