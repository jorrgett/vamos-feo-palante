// Genera los íconos PNG (opacos, cuadrados) para iPhone, Android y la pestaña del navegador
// a partir de la mano del logo (components/marca/mano.png): npx tsx scripts/generar-iconos.mts
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const YELLOW = "#FFD84D";
const MANO = "components/marca/mano.png";
mkdirSync("public/icons", { recursive: true });

/** Cuadro amarillo con la mano al `escala` del lado. */
async function icono(px: number, escala = 1, opts: { paleta?: boolean } = {}) {
  const lado = Math.round(px * escala);
  const mano = await sharp(MANO).resize(lado, lado).toBuffer();
  const off = Math.round((px - lado) / 2);
  const base = await sharp({ create: { width: px, height: px, channels: 3, background: YELLOW } }).composite([{ input: mano, top: off, left: off }]).png().toBuffer();
  return sharp(base).removeAlpha().png(opts.paleta ? { palette: true, colors: 96, compressionLevel: 9, effort: 10 } : { compressionLevel: 9, effort: 10 }).toBuffer();
}

const apple = await icono(180, 0.92, { paleta: true });
writeFileSync("public/apple-touch-icon.png", apple);
writeFileSync("public/apple-touch-icon-precomposed.png", apple);
// iOS 27.2 (beta) no descarga el ícono al "Agregar a inicio" y pone la primera letra del nombre:
// por eso el mismo PNG va incrustado en la página (data:) y no depende de la red.
writeFileSync(
  "lib/apple-icon.ts",
  `// Generado por scripts/generar-iconos.mts: el ícono del iPhone incrustado (no editar a mano).\nexport const APPLE_ICON_DATA_URI = "data:image/png;base64,${apple.toString("base64")}";\n`,
);
writeFileSync("public/icons/icon-192.png", await icono(192, 0.92));
writeFileSync("public/icons/icon-512.png", await icono(512, 0.92));
// Android "maskable": el dibujo al 72 % para que no lo corte el círculo.
writeFileSync("public/icons/icon-maskable-512.png", await icono(512, 0.72));
// Pestaña del navegador.
writeFileSync("app/icon.png", await icono(256, 0.96));
console.log(`Íconos listos (ícono del iPhone incrustado: ${(apple.length / 1024).toFixed(1)} KB)`);
