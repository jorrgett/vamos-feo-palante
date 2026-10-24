"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Maximize, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button, Sheet } from "./ui";

const MAX_ZOOM = 4;
const OUT_PX = 320;

/** Error al abrir una foto, con el motivo para mostrar un mensaje claro. */
export class PhotoError extends Error {
  constructor(
    public reason: "formato" | "otro",
    public detail: string,
  ) {
    super(detail);
  }
}

const looksHeic = (b: Blob) => /hei[cf]/i.test(b.type) || (b instanceof File && /\.(heic|heif)$/i.test(b.name));

type Decoded = { source: CanvasImageSource; w: number; h: number; done: () => void };

/** Intenta abrir la imagen de varias formas: <img>, createImageBitmap y, si es HEIC, convirtiéndola en el teléfono. */
async function decode(blob: Blob): Promise<Decoded> {
  const tried: string[] = [];
  // 1) Como <img>: lo más compatible (respeta la orientación de la foto y no se ahoga con fotos grandes).
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("img"));
      img.src = url;
    });
    if (img.naturalWidth > 0) return { source: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
    tried.push("img:vacía");
  } catch (e) {
    tried.push(`img:${(e as Error).message}`);
  }
  URL.revokeObjectURL(url);
  // 2) createImageBitmap.
  try {
    const bmp = await createImageBitmap(blob);
    return { source: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch (e) {
    tried.push(`bitmap:${(e as Error).message}`);
  }
  // 3) HEIC/HEIF ("alta eficiencia", común en Samsung y iPhone): Chrome en Android no lo abre, se convierte aquí.
  try {
    const { heicTo, isHeic } = await import("heic-to");
    const file = blob instanceof File ? blob : new File([blob], "foto");
    if (looksHeic(blob) || (await isHeic(file))) {
      const bmp = await heicTo({ blob, type: "bitmap" });
      return { source: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    }
    tried.push("heic:no");
  } catch (e) {
    tried.push(`heic:${(e as Error).message}`);
  }
  throw new PhotoError("formato", `${blob.type || "sin-tipo"} ${Math.round(blob.size / 1024)}KB · ${tried.join(" | ")}`);
}

/** Abre la foto (también HEIC) en un canvas, achicada a un tamaño manejable. */
export async function loadPhoto(blob: Blob, maxSide = 1600): Promise<HTMLCanvasElement> {
  if (blob.size === 0) throw new PhotoError("otro", "archivo vacío");
  const { source, w, h, done } = await decode(blob);
  try {
    const k = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext("2d");
    if (!ctx) throw new PhotoError("otro", "sin canvas");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  } finally {
    done();
  }
}

function rotate90(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

type View = { zoom: number; x: number; y: number };

/** La foto siempre tapa todo el círculo: no se puede mover más allá del borde. */
function clamp(v: View, src: HTMLCanvasElement, box: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const s = (box / Math.min(src.width, src.height)) * zoom;
  const maxX = (src.width * s - box) / 2;
  const maxY = (src.height * s - box) / 2;
  return { zoom, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
}

/** Dibuja lo que se ve dentro del círculo en un canvas de `px` × `px`. */
function draw(target: HTMLCanvasElement, src: HTMLCanvasElement, box: number, v: View, px: number) {
  const s = (box / Math.min(src.width, src.height)) * v.zoom;
  const side = box / s;
  const sx = src.width / 2 - v.x / s - side / 2;
  const sy = src.height / 2 - v.y / s - side / 2;
  target.width = px;
  target.height = px;
  const ctx = target.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, side, side, 0, 0, px, px);
}

/**
 * Ajustar la foto de perfil: arrastrar para mover, pellizcar (o la barra) para acercar, y girar.
 * Se monta de nuevo (con `key`) cada vez que se abre con otra foto, así siempre empieza centrada.
 */
export function PhotoCropper({
  source,
  busy,
  onCancel,
  onConfirm,
}: {
  source: HTMLCanvasElement | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [src, setSrc] = useState<HTMLCanvasElement | null>(source);
  const [url, setUrl] = useState<string | null>(null);
  const [box, setBox] = useState(280);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const area = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    if (!src) return;
    let live = true;
    let made: string | null = null;
    src.toBlob(
      (b) => {
        if (!b || !live) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      },
      "image/jpeg",
      0.92,
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);

  // Tamaño real del recuadro (cabe en cualquier teléfono).
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox(el.clientWidth || 280));
    ro.observe(el);
    return () => ro.disconnect();
  }, [url]);

  useEffect(() => {
    if (src && preview.current) draw(preview.current, src, box, view, 112);
  }, [src, box, view]);

  const update = useCallback((fn: (v: View) => View) => setView((v) => (src ? clamp(fn(v), src, box) : v)), [src, box]);

  /** Acercar/alejar manteniendo el mismo centro. */
  const zoomTo = useCallback((z: number) => update((v) => ({ zoom: z, x: (v.x * Math.max(1, Math.min(MAX_ZOOM, z))) / v.zoom, y: (v.y * Math.max(1, Math.min(MAX_ZOOM, z))) / v.zoom })), [update]);

  // La rueda del mouse acerca (en computadora), sin mover la página.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        if (!src) return v;
        const z = v.zoom * Math.exp(-e.deltaY * 0.0015);
        return clamp({ zoom: z, x: (v.x * z) / v.zoom, y: (v.y * z) / v.zoom }, src, box);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [src, box, url]);

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: React.PointerEvent) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const others = [...map.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    if (others.length === 0) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      update((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else {
      // Dos dedos: pellizcar para acercar.
      const o = others[0];
      const before = Math.hypot(prev.x - o.x, prev.y - o.y);
      const after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      if (before > 0) update((v) => ({ zoom: v.zoom * (after / before), x: (v.x * (after / before)), y: (v.y * (after / before)) }));
    }
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const confirm = () => {
    if (!src) return;
    const out = document.createElement("canvas");
    draw(out, src, box, view, OUT_PX);
    out.toBlob((b) => b && onConfirm(b), "image/jpeg", 0.85);
  };

  const s = src ? (box / Math.min(src.width, src.height)) * view.zoom : 1;
  const dw = src ? src.width * s : box;
  const dh = src ? src.height * s : box;

  return (
    <Sheet open={!!source} onClose={busy ? () => {} : onCancel} title="Ajusta tu foto">
      {src && url && (
        <div className="space-y-4">
          <div
            ref={area}
            className="relative mx-auto aspect-square w-full max-w-[300px] cursor-grab touch-none overflow-hidden rounded-3xl bg-black select-none active:cursor-grabbing"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: dw, height: dh, left: (box - dw) / 2 + view.x, top: (box - dh) / 2 + view.y }}
            />
            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80" style={{ boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }} />
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => zoomTo(view.zoom / 1.25)} className="grid size-9 shrink-0 place-items-center rounded-full bg-card-2 text-muted" aria-label="Alejar">
              <ZoomOut size={17} />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={view.zoom}
              onChange={(e) => zoomTo(Number(e.target.value))}
              className="w-full accent-[var(--mango)]"
              aria-label="Acercar la foto"
            />
            <button type="button" onClick={() => zoomTo(view.zoom * 1.25)} className="grid size-9 shrink-0 place-items-center rounded-full bg-card-2 text-muted" aria-label="Acercar">
              <ZoomIn size={17} />
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-card-2 p-3">
            <canvas ref={preview} className="size-14 shrink-0 rounded-full ring-2 ring-card" />
            <p className="min-w-0 flex-1 text-xs text-muted">Arrastra para moverla y pellizca (o usa la barra) para acercarla. Así te ven los panas.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="soft"
              onClick={() => {
                setSrc((c) => (c ? rotate90(c) : c));
                setView({ zoom: 1, x: 0, y: 0 });
              }}
              disabled={busy}
            >
              <RotateCw size={16} /> Girar
            </Button>
            <Button type="button" variant="soft" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} disabled={busy}>
              <Maximize size={16} /> Centrar
            </Button>
          </div>
          <Button type="button" size="lg" className="w-full" onClick={confirm} loading={busy}>
            <Check size={18} /> Usar esta foto
          </Button>
        </div>
      )}
    </Sheet>
  );
}
