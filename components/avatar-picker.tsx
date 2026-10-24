"use client";

import clsx from "clsx";
import { useRef, useState, useTransition } from "react";
import { Camera, Crop, ImagePlus } from "lucide-react";
import { reportPhotoProblem, uploadPhoto } from "@/app/actions/auth";
import { isPhoto } from "@/lib/avatar";
import { AVATARS } from "@/lib/constants";
import { loadPhoto, PhotoCropper, PhotoError } from "./photo-cropper";
import { Avatar, Segmented, useToast } from "./ui";

/**
 * Elegir cómo te ven los panas: un emoji o tu foto.
 * La foto se ajusta (mover, acercar, girar) y se guarda apenas la confirmas; el emoji, al tocar Guardar.
 */
export function AvatarPicker({ avatar, onChange, color, hadPhoto }: { avatar: string; onChange: (a: string) => void; color: string; hadPhoto: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<"emoji" | "foto">(isPhoto(avatar) ? "foto" : "emoji");
  const [photo, setPhoto] = useState<string | null>(isPhoto(avatar) ? avatar : null);
  const [uploading, start] = useTransition();
  const [opening, startOpen] = useTransition();
  const [editing, setEditing] = useState<HTMLCanvasElement | null>(null);
  const [round, setRound] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  /** Abre el ajuste con una foto nueva (de la galería o la cámara) o con la que ya tiene. */
  const open = (load: () => Promise<Blob>) =>
    startOpen(async () => {
      try {
        const canvas = await loadPhoto(await load());
        setRound((n) => n + 1);
        setEditing(canvas);
      } catch (e) {
        const detail = e instanceof PhotoError ? e.detail : String((e as Error)?.message ?? e);
        reportPhotoProblem(detail).catch(() => {});
        toast(
          e instanceof PhotoError && e.reason === "formato"
            ? "Esa foto viene en un formato que este teléfono no abre. Prueba con otra, o tómale una captura de pantalla y sube la captura."
            : "No pude abrir esa foto. Prueba con otra.",
          "error",
        );
      } finally {
        if (input.current) input.current.value = "";
      }
    });

  const save = (blob: Blob) =>
    start(async () => {
      const fd = new FormData();
      fd.append("photo", blob, "foto.jpg");
      const r = await uploadPhoto(fd);
      if (!r.ok) return toast(r.error, "error");
      setPhoto(r.avatar);
      onChange(r.avatar);
      setEditing(null);
      toast("¡Foto lista! Así te ven los panas 📸");
    });

  return (
    <div className="space-y-3">
      <Segmented
        name="avatar-kind"
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t === "foto" && photo) onChange(photo);
        }}
        options={[
          { value: "emoji", label: "😎 Emoji" },
          { value: "foto", label: "📷 Foto" },
        ]}
      />

      {tab === "emoji" ? (
        <>
          <div className="grid grid-cols-7 gap-1 sm:grid-cols-10">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onChange(a)}
                className={clsx("grid aspect-square place-items-center rounded-xl text-xl", avatar === a ? "bg-card-2 ring-2 ring-mango" : "hover:bg-card-2")}
              >
                {a}
              </button>
            ))}
          </div>
          {(hadPhoto || photo) && !isPhoto(avatar) && <p className="text-xs text-muted">Al guardar, tu foto se borra y quedas con el emoji.</p>}
        </>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl bg-card-2 p-4">
          <Avatar emoji={photo ?? "📷"} color={color} size={72} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm text-muted">{photo ? "Esta es tu foto. Se ve redonda en toda la app." : "Elige una donde se te vea la cara. Después la acomodas como quieras."}</p>
            <div className="flex flex-wrap gap-2">
              <label className={clsx("btn-pop h-10 cursor-pointer px-4 text-sm", (uploading || opening) && "pointer-events-none opacity-60")}>
                {photo ? <Camera size={16} /> : <ImagePlus size={16} />}
                {opening ? "Abriendo…" : photo ? "Cambiar" : "Subir o tomar foto"}
                <input
                  ref={input}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) open(async () => f);
                  }}
                />
              </label>
              {photo && (
                <button
                  type="button"
                  disabled={opening}
                  onClick={() => open(async () => (await fetch(photo)).blob())}
                  className="btn-pop btn-pop-paper h-10 px-4 text-sm"
                >
                  <Crop size={16} /> Ajustar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <PhotoCropper key={round} source={editing} busy={uploading} onCancel={() => setEditing(null)} onConfirm={save} />
    </div>
  );
}
