import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { sugerenciasPilas } from "@/lib/pilas/sugerencias";
import { EmptyState } from "@/components/ui";
import { PilasChat } from "@/components/pilas/chat";

export const metadata: Metadata = { title: "Pilas" };

export default async function PilasPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string }> }) {
  const user = await requireUser();
  if (!user.onboarded) redirect("/bienvenida");
  if (!aiEnabled())
    return (
      <EmptyState emoji="🔋" title="Pilas se está cargando">
        El asistente todavía no está activado en esta app.
      </EmptyState>
    );
  const [{ q, s }, sugerencias] = await Promise.all([searchParams, sugerenciasPilas(user.id)]);
  // Si viene de una salida, Pilas sabe cuál es sin que la persona vea la referencia.
  const desde = s && /^[0-9a-f]{8}$/.test(s) ? `La persona tocó «Que Pilas me la explique» en la salida s:${s}.` : undefined;
  return <PilasChat userId={user.id} nombre={user.name.split(" ")[0]} sugerencias={sugerencias} pregunta={q?.slice(0, 300)} contexto={desde} />;
}
