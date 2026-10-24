import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listPanas } from "@/lib/community";
import { SalidaWizard } from "@/components/salida-wizard";
import { InviteCard } from "@/components/invite-card";
import { getInviteCode } from "@/lib/community";
import { aiEnabled } from "@/lib/ai";

export const metadata: Metadata = { title: "Nueva salida" };

export default async function NuevaSalida() {
  const user = await requireUser();
  const panas = await listPanas(user.id);
  const people = panas.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, isMe: p.isMe, hasAccount: true }));
  return (
    <div>
      <div className="mx-auto mb-4 max-w-3xl">
        <Link href="/salidas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
          <ArrowLeft size={16} /> Salidas
        </Link>
        <h1 className="display mt-2 text-3xl font-extrabold sm:text-4xl">Anotar una salida 🧾</h1>
        <p className="mt-1 text-muted">Te guío paso a paso: qué fue, quiénes fueron, cuánto fue, quién puso la plata y quién ya pagó.</p>
      </div>
      {people.length < 2 ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="sticker bg-sun p-5 text-sun-ink">
            <p className="display text-xl font-bold">Primero invita a tus panas 👇</p>
            <p className="mt-1 text-sm opacity-80">Una salida es de al menos 2 personas, y todavía eres el único registrado. Mándales el link y cuando entren ya los puedes agregar.</p>
          </div>
          <InviteCard code={await getInviteCode()} />
        </div>
      ) : (
        <SalidaWizard people={people} meId={user.id} defaultRate={user.rateSource} aiOn={aiEnabled()} />
      )}
    </div>
  );
}
