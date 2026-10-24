// Genera los íconos PNG (opacos, cuadrados) para iPhone y Android: npx tsx scripts/generar-iconos.mts
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { CAR_SVG_SQUARE } from "../lib/icon-svg";

const svg = Buffer.from(CAR_SVG_SQUARE);
const YELLOW = "#FFD84D";
mkdirSync("public/icons", { recursive: true });

const png = (px: number) => sharp(svg, { density: 72 * (px / 64) * 1.2 }).resize(px, px).flatten({ background: YELLOW }).removeAlpha().png({ compressionLevel: 9, effort: 10 });

const apple = await png(180).toBuffer();
writeFileSync("public/apple-touch-icon.png", apple);
writeFileSync("public/apple-touch-icon-precomposed.png", apple);
// iOS 27.2 (beta) no descarga el ícono al "Agregar a inicio" y pone la primera letra del nombre:
// por eso el mismo PNG va incrustado en la página (data:) y no depende de la red.
writeFileSync(
  "lib/apple-icon.ts",
  `// Generado por scripts/generar-iconos.mts: el ícono del iPhone incrustado (no editar a mano).\nexport const APPLE_ICON_DATA_URI = "data:image/png;base64,${apple.toString("base64")}";\n`,
);
await png(192).toFile("public/icons/icon-192.png");
await png(512).toFile("public/icons/icon-512.png");
// Android "maskable": el dibujo al 78 % para que no lo corte el círculo.
const inner = await png(400).toBuffer();
const composed = await sharp({ create: { width: 512, height: 512, channels: 3, background: YELLOW } })
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toBuffer();
await sharp(composed).removeAlpha().png().toFile("public/icons/icon-maskable-512.png");
console.log("Íconos listos en public/");
