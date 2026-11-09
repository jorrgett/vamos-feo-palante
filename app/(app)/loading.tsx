import { PilasMascota } from "@/components/pilas/mascota";

// Mientras carga una pantalla: Pilas se carga y las tarjetas aparecen como esqueleto.
export default function Cargando() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <PilasMascota size={44} estado="pensando" />
        <div className="space-y-2">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-6 w-52" />
        </div>
      </div>
      <div className="skeleton h-40 w-full rounded-[1.4rem]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="skeleton h-24 rounded-[1.25rem]" />
        <div className="skeleton h-24 rounded-[1.25rem]" />
      </div>
      <div className="skeleton h-56 w-full rounded-[1.25rem]" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
