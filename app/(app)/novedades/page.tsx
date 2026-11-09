import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { RELEASES } from "@/lib/novedades";
import { MarkNovedadesSeen, ReleaseCard } from "@/components/novedades";

export const metadata: Metadata = { title: "Novedades" };

export default async function Novedades() {
  await requireUser();
  return (
    <div className="entra mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="display text-3xl font-extrabold sm:text-4xl">Novedades ✨</h1>
        <p className="mt-1 text-muted">Lo que le vamos mejorando a la app, de lo más nuevo a lo más viejo.</p>
      </div>
      {RELEASES.map((r) => (
        <ReleaseCard key={r.id} r={r} />
      ))}
      <MarkNovedadesSeen />
    </div>
  );
}
