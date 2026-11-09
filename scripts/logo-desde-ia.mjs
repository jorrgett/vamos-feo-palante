// Saca la mano del logo elegido (PNG de Gemini sobre fondo amarillo) con fondo transparente, para animarla aparte.
//   node scripts/logo-desde-ia.mjs <png-elegido>
// Deja components/marca/mano.png (512 px). Después: npx tsx scripts/generar-iconos.mts
import sharp from "sharp";

const SRC = process.argv[2];
if (!SRC) throw new Error("Falta el PNG elegido");
const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, px = (x, y) => (y * W + x) * 3;

// 1 · El cuadro amarillo: su color (muestra cerca del borde izquierdo, a media altura) y sus límites.
const yel = (x, y) => { const i = px(x, y); return data[i] > 225 && data[i + 1] > 180 && data[i + 1] < 235 && data[i + 2] < 120; };
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (yel(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
const sx = x0 + Math.round((x1 - x0) * 0.04), sy = Math.round((y0 + y1) / 2), si = px(sx, sy);
const Y = [data[si], data[si + 1], data[si + 2]];
const INK = [35, 28, 22];
console.log(`cuadro ${x0},${y0} → ${x1},${y1}; amarillo rgb(${Y.join(",")})`);

// 2 · Recorte: todo lo que no es amarillo es la mano. Los bordes (mezcla de tinta y amarillo) se vuelven tinta con transparencia.
const size = Math.min(x1 - x0, y1 - y0);
const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
const L = Math.round(cx - size / 2), T = Math.round(cy - size / 2);
const r = size * 0.2, inset = size * 0.015;
const out = Buffer.alloc(size * size * 4);
const dYI = INK.map((v, k) => v - Y[k]);
const nYI = Math.hypot(...dYI);
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    // Fuera del cuadro redondeado (las esquinas blancas): transparente.
    const qx = Math.max(0, Math.abs(x - size / 2) - (size / 2 - inset - r)), qy = Math.max(0, Math.abs(y - size / 2) - (size / 2 - inset - r));
    if (Math.hypot(qx, qy) > r) continue;
    const i = px(L + x, T + y);
    const c = [data[i], data[i + 1], data[i + 2]];
    const d = c.map((v, k) => v - Y[k]);
    const dist = Math.hypot(...d);
    const t = (d[0] * dYI[0] + d[1] * dYI[1] + d[2] * dYI[2]) / (nYI * nYI);
    const perp = Math.hypot(...d.map((v, k) => v - t * dYI[k]));
    let a, fg;
    if (perp < 28 && t > 0) {
      a = Math.min(1, t * 1.08);
      fg = INK;
    } else {
      a = Math.min(1, Math.max(0, (dist - 14) / 46));
      fg = a > 0 ? c.map((v, k) => Math.max(0, Math.min(255, (v - (1 - a) * Y[k]) / a))) : c;
    }
    if (a < 0.02) continue;
    out[o] = fg[0]; out[o + 1] = fg[1]; out[o + 2] = fg[2]; out[o + 3] = Math.round(a * 255);
  }
await sharp(out, { raw: { width: size, height: size, channels: 4 } }).resize(512, 512).png({ compressionLevel: 9, effort: 10 }).toFile("components/marca/mano.png");
console.log("✓ components/marca/mano.png");
