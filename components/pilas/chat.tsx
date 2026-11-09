"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Camera, RotateCcw, X } from "lucide-react";
import type { EstadoTarjeta, EventoPilas, ImagenPilas, Tarjeta } from "@/lib/pilas/tipos";
import { compressImage } from "@/components/image-tools";
import { useToast } from "@/components/ui";
import { PilasMascota } from "./mascota";
import { TarjetaPilas } from "./tarjetas";

type Parte = { t: "texto"; texto: string } | { t: "tarjeta"; tarjeta: Tarjeta };
type Item = { id: string; de: "yo"; texto: string; foto?: string } | { id: string; de: "pilas"; partes: Parte[]; error?: string; reintento?: string };
type Guardado = { v: 1; historial: unknown[]; items: Item[]; estados: Record<string, EstadoTarjeta>; notas: string[] };

const MAX_FOTOS = 3;
const nuevoId = () => Math.random().toString(36).slice(2, 10);
const clave = (userId: string) => `pilas:v1:${userId}`;

function leer(userId: string): Guardado | null {
  try {
    const raw = localStorage.getItem(clave(userId));
    const g = raw ? (JSON.parse(raw) as Guardado) : null;
    return g?.v === 1 ? g : null;
  } catch {
    return null;
  }
}
function guardar(userId: string, g: Guardado) {
  try {
    localStorage.setItem(clave(userId), JSON.stringify(g));
  } catch {
    // Sin espacio o en modo privado: la conversación vive solo mientras la pantalla esté abierta.
  }
}

/** Separa las opciones rápidas que Pilas pone al final: [[Sí|No]]. Mientras escribe, esconde lo que va de los corchetes. */
function separarOpciones(texto: string, completo: boolean): { cuerpo: string; opciones: string[] } {
  const m = texto.match(/\n?\[\[([^\]]+)\]\]\s*$/);
  if (m) return { cuerpo: texto.slice(0, m.index).trimEnd(), opciones: m[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4) };
  return { cuerpo: completo ? texto : texto.replace(/\n?\[\[[^\]]*$/, ""), opciones: [] };
}

/** Negritas, cursivas y listas cortas: lo poco de formato que usa Pilas. Sin HTML. */
function Rico({ texto }: { texto: string }) {
  const inline = (s: string, k: string) =>
    s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((p, i) =>
      p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
        <strong key={`${k}${i}`} className="font-bold">
          {p.slice(2, -2)}
        </strong>
      ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
        <em key={`${k}${i}`}>{p.slice(1, -1)}</em>
      ) : (
        <Fragment key={`${k}${i}`}>{p}</Fragment>
      ),
    );
  // Párrafos y listas: las líneas seguidas que empiezan con «-», «•» o «1.» forman una lista.
  const VIÑETA = /^\s*([-•·*]|\d+[.)])\s+/;
  const grupos: { lista: boolean; lineas: string[] }[] = [];
  for (const l of texto.split("\n")) {
    const lista = VIÑETA.test(l);
    const ult = grupos[grupos.length - 1];
    if (!l.trim()) grupos.push({ lista: false, lineas: [] });
    else if (ult && ult.lista === lista && (lista || ult.lineas.length)) ult.lineas.push(l);
    else grupos.push({ lista, lineas: [l] });
  }
  return (
    <>
      {grupos
        .filter((g) => g.lineas.length)
        .map((g, i) =>
          g.lista ? (
            <ul key={i} className="my-1.5 space-y-1 first:mt-0 last:mb-0">
              {g.lineas.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-mango-ink">•</span>
                  <span className="min-w-0">{inline(l.replace(VIÑETA, ""), `${i}-${j}-`)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p key={i} className="my-1.5 whitespace-pre-line first:mt-0 last:mb-0">
              {inline(g.lineas.join("\n"), `${i}-`)}
            </p>
          ),
        )}
    </>
  );
}

export function PilasChat({
  userId,
  nombre,
  sugerencias,
  pregunta,
  contexto,
}: {
  userId: string;
  nombre: string;
  sugerencias: string[];
  /** Pregunta que llega de otra pantalla y se manda sola. */
  pregunta?: string;
  /** Nota para Pilas sobre de dónde viene esa pregunta (no la ve la persona). */
  contexto?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cargado, setCargado] = useState(false);
  const [historial, setHistorial] = useState<unknown[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoTarjeta>>({});
  const [notas, setNotas] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<(ImagenPilas & { vista: string }) | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const [feliz, setFeliz] = useState(false);
  const [teclado, setTeclado] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const seguir = useRef(true);
  const preguntaHecha = useRef(false);
  const abortar = useRef<AbortController | null>(null);

  // Cargar la conversación guardada en este teléfono.
  useEffect(() => {
    const g = leer(userId);
    if (g) {
      setHistorial(g.historial);
      setItems(g.items);
      setEstados(g.estados);
      setNotas(g.notas);
    }
    setCargado(true);
  }, [userId]);

  // Guardarla cuando no se está escribiendo.
  useEffect(() => {
    if (cargado && !ocupado) guardar(userId, { v: 1, historial, items, estados, notas });
  }, [cargado, ocupado, userId, historial, items, estados, notas]);

  // iPhone: con el teclado abierto la barra de escribir sube con él. Los cambios chicos de alto (la barra de
  // Safari que se esconde al deslizar) no son el teclado: si se tomaran como teclado, la página saltaría.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => {
      const k = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setTeclado(k > 120 ? k : 0);
    };
    vv.addEventListener("resize", f);
    vv.addEventListener("scroll", f);
    return () => {
      vv.removeEventListener("resize", f);
      vv.removeEventListener("scroll", f);
    };
  }, []);

  // Se sigue el final solo si la persona está abajo: si sube a leer, no se la baja a la fuerza.
  useEffect(() => {
    const f = () => (seguir.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80);
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  // Baja hasta el final (incluye el espacio de la barra de escribir) solo cuando llega algo nuevo, nunca al deslizar.
  useEffect(() => {
    if (items.length && seguir.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [items, estado, foto]);
  // Al abrir el teclado, que se vea lo último de la conversación.
  useEffect(() => {
    if (teclado && items.length) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [teclado, items.length]);

  useEffect(() => () => abortar.current?.abort(), []);

  const fotosUsadas = items.filter((i) => i.de === "yo" && i.foto).length;

  const enviar = useCallback(
    async (msg: string, img?: (ImagenPilas & { vista: string }) | null, nota?: string) => {
      const t = msg.trim();
      if ((!t && !img) || ocupado) return;
      const pid = nuevoId();
      const notasAhora = notas;
      const notasEnvio = nota ? [...notasAhora, nota] : notasAhora;
      seguir.current = true;
      setItems((prev) => [...prev, { id: nuevoId(), de: "yo", texto: t, foto: img?.vista }, { id: pid, de: "pilas", partes: [] }]);
      setTexto("");
      if (area.current) area.current.style.height = "";
      setFoto(null);
      setOcupado(true);
      setFeliz(false);
      setEstado("Pensando");
      const tocar = (fn: (it: Extract<Item, { de: "pilas" }>) => Extract<Item, { de: "pilas" }>) =>
        setItems((prev) => prev.map((it) => (it.id === pid && it.de === "pilas" ? fn(it) : it)));
      const ac = new AbortController();
      abortar.current = ac;
      let terminado = false;
      try {
        const res = await fetch("/api/pilas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ historial, texto: t, imagen: img ? { mime: img.mime, base64: img.base64 } : null, notas: notasEnvio }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? "No pude hablar con Pilas. Intenta de nuevo.");
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        const manejar = (ev: EventoPilas) => {
          if (ev.t === "estado") setEstado(ev.texto);
          else if (ev.t === "texto") {
            setEstado(null);
            tocar((it) => {
              const last = it.partes[it.partes.length - 1];
              return last?.t === "texto"
                ? { ...it, partes: [...it.partes.slice(0, -1), { t: "texto", texto: last.texto + ev.d }] }
                : { ...it, partes: [...it.partes, { t: "texto", texto: ev.d.replace(/^\n+/, "") }] };
            });
          } else if (ev.t === "tarjeta") tocar((it) => ({ ...it, partes: [...it.partes, { t: "tarjeta", tarjeta: ev.tarjeta }] }));
          else if (ev.t === "fin") {
            terminado = true;
            setHistorial(ev.historial);
            setNotas((prev) => prev.filter((n) => !notasAhora.includes(n)));
          } else if (ev.t === "error") {
            terminado = true;
            tocar((it) => ({ ...it, error: ev.texto, reintento: img ? undefined : t }));
          }
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) manejar(JSON.parse(line) as EventoPilas);
          }
        }
        if (!terminado) throw new Error("Se cortó la conexión 📶 Intenta de nuevo.");
      } catch (e) {
        if (!ac.signal.aborted) tocar((it) => ({ ...it, error: (e as Error).message, reintento: img ? undefined : t }));
      } finally {
        setOcupado(false);
        setEstado(null);
      }
    },
    [historial, notas, ocupado],
  );

  // Pregunta que viene de otra pantalla (/pilas?q=…): se manda sola una vez.
  useEffect(() => {
    if (!cargado || !pregunta || preguntaHecha.current) return;
    preguntaHecha.current = true;
    router.replace("/pilas", { scroll: false });
    void enviar(pregunta, null, contexto);
  }, [cargado, pregunta, contexto, enviar, router]);

  const hecho = (id: string) => (e: EstadoTarjeta, nota: string) => {
    setEstados((prev) => ({ ...prev, [id]: e }));
    setNotas((prev) => [...prev, nota].slice(-8));
    if (e.estado === "hecho") {
      setFeliz(true);
      router.refresh();
    }
  };

  const reintentar = (id: string, t: string) => {
    // Quita el intento fallido (la pregunta y la respuesta con error) y lo manda otra vez.
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      return i > 0 ? [...prev.slice(0, i - 1), ...prev.slice(i + 1)] : prev;
    });
    setTimeout(() => void enviar(t), 0);
  };

  const nueva = () => {
    abortar.current?.abort();
    setHistorial([]);
    setItems([]);
    setEstados({});
    setNotas([]);
    setFeliz(false);
    try {
      localStorage.removeItem(clave(userId));
    } catch {}
  };

  const elegirFoto = async (file?: File | null) => {
    if (!file) return;
    if (fotosUsadas >= MAX_FOTOS) return toast(`Máximo ${MAX_FOTOS} fotos por conversación. Empieza una nueva para mandar otra.`, "info");
    try {
      const blob = await compressImage(file, 1568, 0.82);
      const base64 = await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",")[1] ?? "");
        r.onerror = () => fail(new Error("lectura"));
        r.readAsDataURL(blob);
      });
      const vista = await new Promise<string>((ok) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          const k = 220 / Math.max(img.width, img.height);
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => ok("");
        img.src = URL.createObjectURL(blob);
      });
      setFoto({ mime: "image/jpeg", base64, vista });
      area.current?.focus();
    } catch {
      toast("No pude abrir esa foto. Prueba con otra.", "error");
    }
  };

  const ultimo = items[items.length - 1];
  const opcionesUltimo =
    !ocupado && ultimo?.de === "pilas" && !ultimo.error
      ? (() => {
          const tx = ultimo.partes.filter((p) => p.t === "texto").pop();
          return tx?.t === "texto" ? separarOpciones(tx.texto, true).opciones : [];
        })()
      : [];
  const vacio = cargado && items.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <PilasMascota size={44} vivo estado={ocupado ? "pensando" : feliz ? "feliz" : "normal"} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-2xl leading-none font-extrabold">Pilas</h1>
          <p className="mt-1 text-xs text-muted">Tu pana más pilas con las cuentas · con IA</p>
        </div>
        {items.length > 0 && (
          <button onClick={nueva} className="chip !py-1.5 text-sm hover:border-line-strong" disabled={ocupado}>
            <RotateCcw size={14} /> Nueva charla
          </button>
        )}
      </div>

      {vacio && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-4 text-center">
          <div className="wobble mx-auto w-fit">
            <PilasMascota size={132} vivo cadaSeg={[5, 9]} />
          </div>
          <h2 className="display mt-5 text-2xl font-extrabold">¡Épale, {nombre}! Soy Pilas</h2>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            Pregúntame lo que sea de tus cuentas, o dime qué anotar y yo te lo armo. Escríbelo como se lo dirías a un pana.
          </p>
          <div className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-2">
            {sugerencias.map((s) => (
              <button key={s} onClick={() => void enviar(s)} className="rounded-full border-2 border-ink bg-card px-3.5 py-2 text-sm font-semibold shadow-[2px_2px_0_var(--pop)] transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                {s}
              </button>
            ))}
            <button onClick={() => archivo.current?.click()} className="rounded-full border-2 border-dashed border-line-strong px-3.5 py-2 text-sm font-semibold text-muted hover:text-text">
              📸 Mándame la foto de una factura
            </button>
          </div>
          <p className="mx-auto mt-8 max-w-xs text-[11px] leading-relaxed text-faint">
            Pilas usa inteligencia artificial y puede equivocarse: revisa cada tarjeta antes de tocarla. La conversación se queda en este teléfono.
          </p>
        </motion.div>
      )}

      <div className="space-y-4" style={{ paddingBottom: 132 }}>
        {items.map((it, idx) =>
          it.de === "yo" ? (
            <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
              <div className="max-w-[85%] space-y-2">
                {it.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.foto} alt="Foto enviada" className="ml-auto max-h-44 rounded-2xl border-2 border-ink object-cover" />
                )}
                {it.texto && <p className="rounded-3xl rounded-tr-lg border-2 border-ink bg-sun px-4 py-2.5 whitespace-pre-line text-sun-ink">{it.texto}</p>}
              </div>
            </motion.div>
          ) : (
            <div key={it.id} className="flex items-start gap-2.5">
              <PilasMascota size={30} className="mt-0.5" estado={ocupado && idx === items.length - 1 ? "pensando" : "normal"} />
              <div className="min-w-0 flex-1 space-y-2.5">
                {it.partes.map((p, j) => {
                  if (p.t === "tarjeta")
                    return (
                      <motion.div key={j} initial={{ opacity: 0, scale: 0.96, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}>
                        <TarjetaPilas tarjeta={p.tarjeta} estado={estados[p.tarjeta.id]} onHecho={hecho(p.tarjeta.id)} />
                      </motion.div>
                    );
                  const enVivo = ocupado && idx === items.length - 1 && j === it.partes.length - 1;
                  const { cuerpo } = separarOpciones(p.texto, !enVivo);
                  if (!cuerpo) return null;
                  return (
                    <div key={j} className="w-fit max-w-full rounded-3xl rounded-tl-lg border border-line-strong bg-card px-4 py-2.5 leading-relaxed shadow-[var(--shadow)]">
                      <Rico texto={cuerpo} />
                      {enVivo && <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-full bg-mango" />}
                    </div>
                  );
                })}
                {ocupado && idx === items.length - 1 && estado && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                    <span className="inline-flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <motion.span key={d} className="size-1.5 rounded-full bg-mango" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1, repeat: Infinity, delay: d * 0.18 }} />
                      ))}
                    </span>
                    {estado}…
                  </p>
                )}
                {it.error && (
                  <div className="w-fit max-w-full rounded-3xl rounded-tl-lg border-2 border-rose/40 bg-rose-soft px-4 py-2.5 text-sm">
                    <p className="font-semibold text-rose">{it.error}</p>
                    {it.reintento && idx === items.length - 1 && (
                      <button onClick={() => reintentar(it.id, it.reintento!)} className="mt-1.5 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                        <RotateCcw size={14} /> Reintentar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        <AnimatePresence>
          {opcionesUltimo.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap justify-end gap-2 pl-10">
              {opcionesUltimo.map((o) => (
                <button key={o} onClick={() => void enviar(o)} className="rounded-full border-2 border-ink bg-card px-3.5 py-2 text-sm font-semibold shadow-[2px_2px_0_var(--pop)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                  {o}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto, foto);
        }}
        className="fixed inset-x-0 z-50 border-t border-line bg-bg/95 backdrop-blur-md lg:left-[264px]"
        style={{ bottom: teclado, paddingBottom: teclado ? 8 : "max(env(safe-area-inset-bottom), 0.6rem)" }}
      >
        <div className="mx-auto w-full max-w-2xl px-4 pt-2.5">
          {foto && (
            <div className="mb-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.vista} alt="Foto adjunta" className="size-14 rounded-xl border-2 border-ink object-cover" />
              <span className="text-xs text-muted">Foto lista. Dime quiénes fueron y quién pagó.</span>
              <button type="button" onClick={() => setFoto(null)} className="ml-auto grid size-8 place-items-center rounded-full bg-card-2 text-muted" aria-label="Quitar foto">
                <X size={16} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => archivo.current?.click()}
              disabled={ocupado}
              className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-line-strong bg-card text-muted hover:text-text disabled:opacity-50"
              aria-label="Mandar foto de una factura"
            >
              <Camera size={20} />
            </button>
            <textarea
              ref={area}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void enviar(texto, foto);
                }
              }}
              rows={1}
              maxLength={2000}
              enterKeyHint="send"
              placeholder={ocupado ? "Pilas está escribiendo…" : "Escríbele a Pilas…"}
              aria-label="Mensaje para Pilas"
              className="field max-h-[132px] min-h-11 flex-1 resize-none !rounded-3xl !py-2.5 leading-snug"
            />
            <button type="submit" disabled={ocupado || (!texto.trim() && !foto)} className="btn-pop size-11 shrink-0 !p-0 disabled:opacity-40" aria-label="Enviar">
              <ArrowUp size={20} strokeWidth={2.6} />
            </button>
          </div>
        </div>
        <input
          ref={archivo}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void elegirFoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </form>
    </div>
  );
}
