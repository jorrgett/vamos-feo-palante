// Genera propuestas del logo con Gemini (Nano Banana Pro) usando a Pilas como referencia de estilo.
// La clave sale de .env.local (GOOGLE_API_KEY) y nunca se imprime.
//   node scripts/generar-logo-ia.mjs <carpeta-de-salida> [modelo]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = process.argv[2];
const MODEL = process.argv[3] || "gemini-3-pro-image";
if (!OUT) throw new Error("Falta la carpeta de salida");
fs.mkdirSync(OUT, { recursive: true });
const KEY = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^GOOGLE_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("No hay GOOGLE_API_KEY en .env.local");

// Pilas (estático, saludando) y el logo actual, como imágenes de referencia.
const T = "#231C16", P = "#FFFAF0", S = "#FFD84D", M = "#F0562A";
const pilas = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 96 108" width="1024" height="1152"><rect x="-10" y="-10" width="96" height="108" fill="#F3EAD8"/>
<ellipse cx="27" cy="82.5" rx="6.2" ry="3.4" fill="${T}"/><ellipse cx="48" cy="82.5" rx="6.2" ry="3.4" fill="${T}"/>
<g transform="rotate(28 16 50)"><path d="M16 50V64" stroke="${T}" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="66" r="3.6" fill="${P}" stroke="${T}" stroke-width="2.6"/></g>
<g transform="rotate(-150 58 50)"><path d="M58 50V64" stroke="${T}" stroke-width="4" stroke-linecap="round"/><circle cx="58" cy="66" r="3.6" fill="${P}" stroke="${T}" stroke-width="2.6"/></g>
<rect x="15" y="17" width="50" height="64" rx="17" fill="${T}"/><rect x="27" y="5" width="20" height="12" rx="5" fill="${P}" stroke="${T}" stroke-width="3.5"/>
<clipPath id="c"><rect x="12" y="14" width="50" height="64" rx="17"/></clipPath><rect x="12" y="14" width="50" height="64" rx="17" fill="${P}"/>
<g clip-path="url(#c)"><path fill="${S}" d="M-28 56 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 V96 H-28 Z"/></g>
<rect x="12" y="14" width="50" height="64" rx="17" fill="none" stroke="${T}" stroke-width="3.5"/>
<ellipse cx="21.5" cy="47" rx="4" ry="2.6" fill="${M}" opacity=".32"/><ellipse cx="52.5" cy="47" rx="4" ry="2.6" fill="${M}" opacity=".32"/>
<ellipse cx="29" cy="38" rx="3.4" ry="4.5" fill="${T}"/><circle cx="30.2" cy="36.4" r="1.1" fill="${P}"/><ellipse cx="45" cy="38" rx="3.4" ry="4.5" fill="${T}"/><circle cx="46.2" cy="36.4" r="1.1" fill="${P}"/>
<path d="M28 46 q9 11 18 0 z" fill="${T}" stroke="${T}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M39.5 57 l-7.5 11 h5.5 l-2.5 8 l9 -12 h-5.5 l2.5 -7 z" fill="${M}" stroke="${T}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const brand = fs.readFileSync(new URL("../components/brand.tsx", import.meta.url), "utf8");
const inner = brand.slice(brand.indexOf("<svg"), brand.indexOf("</svg>") + 6);
const logo = inner
  .replace(/<svg[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024">')
  .replace(/\{bg && (<rect[^>]*\/>)\}/, "$1")
  .replace(/strokeWidth/g, "stroke-width").replace(/strokeLinecap/g, "stroke-linecap").replace(/strokeLinejoin/g, "stroke-linejoin")
  .replace(/=\{([^}]+)\}/g, '="$1"');
const png = async (svg) => (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
const [refPilas, refLogo] = await Promise.all([png(pilas), png(logo)]);
fs.writeFileSync(path.join(OUT, "ref-pilas.png"), Buffer.from(refPilas, "base64"));
fs.writeFileSync(path.join(OUT, "ref-logo-actual.png"), Buffer.from(refLogo, "base64"));

const ESTILO = `STYLE (copy it exactly from image 1, the battery mascot "Pilas"): flat 2D vector sticker illustration, thick uniform dark brown-black outlines (#231C16), solid flat fills with NO gradients, NO texture, NO 3D, NO glossy highlights; a hard flat offset drop shadow in the same dark ink color shifted down-right; very rounded, chunky, friendly shapes; limited palette: cream #FFFAF0, sunny yellow #FFD84D, mango orange #F0562A, ink #231C16, with soft pink cheeks. Cute minimal face style: two tall oval black eyes each with a tiny white highlight dot, simple smile, small blush ovals.`;
const FORMATO = `FORMAT: square app icon, the artwork centered on a solid sunny yellow #FFD84D rounded-square tile that fills the whole canvas with generous margins, nothing touching the edges, no text, no letters, no watermark. It must stay readable at 32 pixels: bold silhouette, few details.`;
const IDEAS = [
  ["shaka-con-cara", `Redesign the app logo in image 2: a hand doing the Venezuelan/Hawaiian "shaka" gesture (thumb and pinky extended, three middle fingers folded) with a mango-orange sleeve cuff. Make the hand itself a cute character: put the mascot face (eyes, smile, blush) on the palm. Tilt it playfully about -15 degrees, add two small curved motion lines next to it and a tiny four-point sparkle.`],
  ["shaka-limpio", `Redraw the app logo in image 2 as a cleaner, bolder icon: a single hand doing the "shaka" gesture (thumb and pinky out, three middle fingers folded), warm peach skin tone #F4B183 with the thick ink outline, a short mango-orange sleeve cuff, two small curved motion lines on each side as if it is waving, and one tiny cream four-point sparkle. No face. Strong, simple, iconic.`],
  ["shaka-pilas", `Make a new app logo where the battery mascot from image 1 (same body, cap, face, yellow charge level and orange lightning bolt) happily does the "shaka" hand gesture (thumb and pinky out) with one raised arm ending in a small hand, like in image 2. Keep the mascot recognizable and the icon very simple.`],
  ["shaka-sticker", `Redesign the app logo in image 2 as a die-cut sticker: a chunky "shaka" hand (thumb and pinky out) in warm peach #F4B183 with a mango-orange sleeve, surrounded by a thick cream sticker border and then the dark ink outline and hard shadow, slightly rotated, with a tiny lightning bolt sparkle in mango orange near the pinky as a nod to the mascot.`],
];

async function una(nombre, idea, i) {
  const body = {
    contents: [
      {
        parts: [
          { text: `${idea}\n\n${ESTILO}\n\n${FORMATO}\n\nImage 1 is the style reference. Image 2 is the current logo (concept reference only, its drawing style is outdated).` },
          { inline_data: { mime_type: "image/png", data: refPilas } },
          { inline_data: { mime_type: "image/png", data: refLogo } },
        ],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "2K" } },
  };
  const t0 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) return console.log(`✗ ${nombre}-${i}: ${res.status} ${j.error?.message?.slice(0, 160)}`);
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const data = part?.inlineData?.data ?? part?.inline_data?.data;
  if (!data) return console.log(`✗ ${nombre}-${i}: sin imagen (${j.candidates?.[0]?.finishReason ?? "?"})`);
  const f = path.join(OUT, `${nombre}-${i}.png`);
  fs.writeFileSync(f, Buffer.from(data, "base64"));
  console.log(`✓ ${path.basename(f)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

const veces = Number(process.env.VECES || 2);
await Promise.all(IDEAS.flatMap(([n, idea]) => Array.from({ length: veces }, (_, i) => una(n, idea, i + 1))));
