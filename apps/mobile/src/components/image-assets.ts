import { Asset } from "expo-asset";
import { Image } from "expo-image";
import logo from "../../assets/kffr-logo.png";
import homeFelt from "../../assets/felt-table.png";
import soloFelt from "../../assets/solo-felt.png";

let warming: Promise<void> | null = null;

/** Start while the account restores, before Home/Solo need their images.
 * Use the same URI/cache policy as the views. Never delay account navigation.
 * Give the small critical assets a head start over the 3 MB Solo texture.
 */
export function warmGameImages() {
  warming ??= (async () => {
    await Image.prefetch([logo, homeFelt].map((source) => Asset.fromModule(source).uri), "memory-disk");
    await Image.prefetch(Asset.fromModule(soloFelt).uri, "memory-disk");
  })().catch(() => { warming = null; }); // Ordinary image loading remains the fallback.
  return warming;
}
